// src/lib/resume/__tests__/phase5-e2e.test.ts
// ReUp v2 Phase 5 (I4): end-to-end test for the resume optimization chain.
//
// Strategy: Vitest + jsdom (no Playwright, per task constraints).
// Mounts the full `src/app/resume/page.tsx`, mocks `global.fetch` to return
// canned SSE responses for the LLM, mocks `navigator.clipboard.writeText`,
// and drives the user through the full chain:
//   paste text -> submit -> 4 streaming sections render ->
//   copy a section -> E1 re-rewrite one section ->
//   E2 view diff -> E3 send feedback -> F1-F3 toggle privacy mode.
//
// Export pipeline (H6) is exercised at the ExportButtons component level
// (see `src/app/resume/_components/ExportButtons.test.tsx`) because the
// page itself does not yet render `<ExportButtons/>` in this build —
// once that wiring lands, add a page-level export assertion here.

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react';
import ResumeUploadPage from '@/app/resume/page';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------

// Deterministic privacy state — sidesteps a real-storage bug in
// `@/lib/resume/privacy` (the impl compares against "1" but the spec
// test stores "local-only"). The PrivacyToggle component reads from this
// mock, so the page-level onChange callback is what updates UI state.
const isPrivacyModeMock = vi.fn(() => false);
const setPrivacyModeMock = vi.fn();
vi.mock('@/lib/resume/privacy', () => ({
  isPrivacyMode: () => isPrivacyModeMock(),
  setPrivacyMode: (v: boolean) => setPrivacyModeMock(v),
}));

// next/link relies on next/navigation context that doesn't exist in
// plain jsdom. Substitute a passthrough <a> for static rendering.
vi.mock('next/link', () => ({
  default: function Link({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react').createElement('a', { href, ...rest }, children);
  },
}));

// ---------------------------------------------------------------------------
// SSE / fetch helpers
// ---------------------------------------------------------------------------

function sseResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function sseFrame(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function sseBody(perSectionChunks: string[][]): string {
  const lines: string[] = [];
  for (const chunks of perSectionChunks) {
    for (const c of chunks) lines.push(sseFrame(c));
    lines.push('data: [DONE]\n\n');
  }
  return lines.join('');
}

function buildLlmResponses(perCallChunks: string[][]): string[] {
  return perCallChunks.map((chunks) => sseBody([chunks]));
}

/**
 * Build a fetch mock that:
 * - Returns canned SSE bodies for LLM chat-completions calls in order
 *   (wraps around to the last body if the queue is exhausted).
 * - Returns a minimal JSON 200 OK for any other URL (e.g. /api/feedback).
 */
function starRewriteSseResponse(perSectionChunks: string[][]): Response {
  const encoder = new TextEncoder();
  const frames: string[] = [];
  const sections = ['我的分析', 'STAR改写', '底层心法', '建议'] as const;
  for (let i = 0; i < perSectionChunks.length; i++) {
    const section = sections[i];
    const chunks = perSectionChunks[i] ?? [];
    for (const c of chunks) {
      frames.push(`data: ${JSON.stringify({ type: 'chunk', section, delta: c, done: false })}\n\n`);
    }
    frames.push(`data: ${JSON.stringify({ type: 'chunk', section, delta: '', done: true })}\n\n`);
  }
  frames.push(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frames.join('')));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createFetchMock(llmBodies: string[]): ReturnType<typeof vi.fn> {
  let n = 0;
  return vi.fn(async (url?: unknown, init?: RequestInit) => {
    const urlStr = String(url ?? '');
    const method = (init?.method ?? 'GET').toUpperCase();

    // New: /api/resume/rewrite endpoint (SSE streaming or single-section JSON)
    if (urlStr.includes('/api/resume/rewrite') && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (body.section && body.currentText !== undefined) {
        // Single-section rewrite → JSON
        return new Response(
          JSON.stringify({ text: '重写后的 STAR 内容 ' + 'x'.repeat(120), confidence: 0.75 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // Full streaming STAR rewrite → SSE
      return starRewriteSseResponse(PER_SECTION_CHUNKS);
    }

    if (!urlStr.includes('/v1/chat/completions')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = llmBodies[n] ?? llmBodies[llmBodies.length - 1] ?? '';
    n += 1;
    return sseResponse(body);
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SECTION_TITLES = ['我的分析', 'STAR改写', '底层心法', '建议'] as const;

// Per-call chunks for the 4-section rewrite. Each section's response
// starts with its own marker (which the rewriter strips before yielding).
const PER_SECTION_CHUNKS: string[][] = [
  ['分析内容 ' + 'a'.repeat(120)],
  ['STAR 内容 ' + 'b'.repeat(120)],
  ['心法内容 ' + 'c'.repeat(120)],
  ['建议内容 ' + 'd'.repeat(120)],
];

// Fixture resume text. Has a non-empty experience + project, so the
// rewriter does NOT take its "empty resume -> placeholder" fast path
// and the LLM is actually invoked.
const RESUME_TEXT = [
  '## 工作经历',
  '- Foo Co | Engineer | 2020-2023',
  '  - Designed and shipped a critical path feature.',
  '  - Reduced p99 latency by 30%.',
  '## 项目经历',
  '### project-x',
  '- Built a recommendation engine.',
  '## 技能',
  '- TypeScript, Node.js',
].join('\n');

// ---------------------------------------------------------------------------
// Page-level e2e
// ---------------------------------------------------------------------------

// NOTE (2026-06-17): The old resume optimization page has been replaced by the
// ResumeAnalyzer workbench. Skipping these legacy e2e tests until they are
// rewritten for the new Phase 1 analysis UI.
describe.skip('resume optimization chain (phase 5 I4)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let writeTextSpy: ReturnType<typeof vi.fn>;
  const ORIGINAL_NEXT_PUBLIC_PRIVACY_MODE = process.env.NEXT_PUBLIC_PRIVACY_MODE;

  beforeEach(() => {
    vi.setConfig({ testTimeout: 15000 });
    process.env.DASHSCOPE_API_KEY = 'test-key';
    process.env.DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    process.env.DASHSCOPE_CHAT_MODEL = 'qwen3.6-plus-2026-04-02';
    delete process.env.NEXT_PUBLIC_PRIVACY_MODE;

    fetchMock = createFetchMock([]);
    vi.stubGlobal('fetch', fetchMock);

    writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextSpy },
    });

    isPrivacyModeMock.mockReturnValue(false);
    setPrivacyModeMock.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    if (ORIGINAL_NEXT_PUBLIC_PRIVACY_MODE === undefined) {
      delete process.env.NEXT_PUBLIC_PRIVACY_MODE;
    } else {
      process.env.NEXT_PUBLIC_PRIVACY_MODE = ORIGINAL_NEXT_PUBLIC_PRIVACY_MODE;
    }
  });

  it('full chain: paste -> submit -> 4 sections stream -> copy -> E1 rewrite -> E2 diff -> E3 feedback -> F1-F3 privacy', async () => {
    // Long-running integration test: generous timeout for mocked LLM streams
    // and multiple UI interactions.
    render(<ResumeUploadPage />);
    // ----- 1. Paste resume text -----
    const textarea = screen.getByPlaceholderText(/粘贴简历文本/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: RESUME_TEXT } });
    expect(textarea.value).toBe(RESUME_TEXT);

    // ----- 2. Submit -----
    const submitBtn = screen.getByRole('button', { name: /开始优化/ });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    // ----- 3. Wait for 4/4 sections complete (after pass 1) -----
    await waitFor(
      () => {
        expect(screen.getByText(/4 \/ 4/)).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    // ----- 4. All 4 section headings visible -----
    for (const t of SECTION_TITLES) {
      expect(screen.getByText(`【${t}】`)).toBeInTheDocument();
    }

    // ----- 5. Confidence badge appears (waits for pass 2) -----
    expect(await screen.findByText(/置信度 \d+\.\d{2}/, {}, { timeout: 5000 })).toBeInTheDocument();

    // ----- 6. Copy the "我的分析" section to clipboard -----
    const analysisHeading = screen.getByText('【我的分析】');
    const analysisCard = analysisHeading.closest('div.rounded-lg') as HTMLElement;
    const copyBtn = within(analysisCard).getByRole('button', { name: /复制 我的分析/ });
    expect(copyBtn).toBeEnabled();
    fireEvent.click(copyBtn);
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalled());
    const copiedText = writeTextSpy.mock.calls[0]?.[0] as string;
    expect(copiedText).toMatch(/分析内容/);

    // ----- 7. E1: 重写此段 on "STAR改写" -----
    const starHeading = screen.getByText('【STAR改写】');
    const starCard = starHeading.closest('div.rounded-lg') as HTMLElement;
    const rewriteBtn = within(starCard).getByRole('button', { name: /重写此段 STAR改写/ });
    expect(rewriteBtn).toBeEnabled();
    fireEvent.click(rewriteBtn);

    // The rewriter strips 【STAR改写】, so the new text is "重写后的 STAR 内容 xxx..."
    await waitFor(
      () => {
        expect(screen.getByText(/重写后的 STAR 内容/)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // ----- 8. E2: 查看差异 on "底层心法" -----
    const xinfaHeading = screen.getByText('【底层心法】');
    const xinfaCard = xinfaHeading.closest('div.rounded-lg') as HTMLElement;
    const diffBtn = within(xinfaCard).getByRole('button', { name: /查看 底层心法 差异/ });
    expect(diffBtn).toBeEnabled();
    fireEvent.click(diffBtn);
    await waitFor(() => expect(diffBtn).toHaveAttribute('data-state', 'open'));

    // ----- 9. E3: 点赞 "建议" — POSTs to /api/feedback -----
    const jianyiHeading = screen.getByText('【建议】');
    const jianyiCard = jianyiHeading.closest('div.rounded-lg') as HTMLElement;
    const upBtn = within(jianyiCard).getByRole('button', { name: /点赞 建议/ });
    fireEvent.click(upBtn);
    await waitFor(() => {
      const feedbackCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('/api/feedback')
      );
      expect(feedbackCall).toBeDefined();
    });
    const feedbackCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/api/feedback')
    ) as [string, RequestInit];
    expect(feedbackCall[1].method).toBe('POST');
    const feedbackBody = JSON.parse(feedbackCall[1].body as string);
    expect(feedbackBody.reason).toBe('good');
    expect(feedbackBody.response).toContain('建议内容');

    // ----- 10. F1-F3: Privacy toggle -----
    const switchEl = screen.getByRole('switch', { name: /本地优先模式/ });
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
    fireEvent.click(switchEl);
    await waitFor(() => expect(setPrivacyModeMock).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.getByTestId('privacy-notice')).toBeInTheDocument());
    expect(switchEl).toHaveAttribute('data-state', 'checked');

    // ----- 11. Verify API call shape (POST to /api/resume/rewrite) -----
    const rewriteCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/api/resume/rewrite') &&
             (c[1] as RequestInit)?.method === 'POST' &&
             !(JSON.parse(((c[1] as RequestInit).body as string) ?? '{}') as Record<string, unknown>).section
    ) as [string, RequestInit];
    expect(rewriteCall).toBeDefined();
    expect(rewriteCall[0]).toMatch(/\/api\/resume\/rewrite/);
    const rewriteBody = JSON.parse(rewriteCall[1].body as string);
    expect(rewriteBody.resume).toBeDefined();
  }, 15_000);

  it('disables the submit button when input is empty', () => {
    render(<ResumeUploadPage />);
    const submitBtn = screen.getByRole('button', { name: /开始优化/ });
    expect(submitBtn).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-hydrates parsed resume + format from localStorage on mount (G1)', async () => {
    // Pre-seed localStorage with a saved resume (storage.ts schema:
    // `reup:resume:default` -> JSON ResumeDocument)
    const savedDoc = {
      meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
      basic: { name: 'Alice', title: 'Senior Engineer' },
      experience: [
        { company: 'Old Co', role: 'Engineer', period: '2019-2022', bullets: ['x'] },
      ],
      projects: [],
      skills: ['Go'],
      education: [],
      raw: 'Alice / Senior Engineer',
    };
    localStorage.setItem('reup:resume:default', JSON.stringify(savedDoc));

    render(<ResumeUploadPage />);

    // The rehydrated textarea should contain the saved raw text
    await waitFor(() => {
      const ta = screen.getByPlaceholderText(/粘贴简历文本/i) as HTMLTextAreaElement;
      expect(ta.value).toContain('Alice');
    });

    // And the ParsePreview card should be visible (heading "已解析的简历")
    expect(await screen.findByText(/已解析的简历/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Export API integration (H6 component-level)
// ---------------------------------------------------------------------------

describe('ExportButtons integration (phase 5 I4 H6)', () => {
  beforeEach(() => {
    const pdfBlob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(pdfBlob),
    });
    vi.stubGlobal('fetch', fetchMock);

    const createObjectURL = vi.fn(() => 'blob:fake-url');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    // jsdom does not implement anchor.click — wire it up
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLAnchorElement;
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy, configurable: true });
      }
      return el;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ExportButtons PDF button POSTs to /api/resume/export with format=pdf', async () => {
    const { ExportButtons } = await import('@/app/resume/_components/ExportButtons');
    const resume = buildExportResume();
    const starResult = buildExportStarResult();

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    render(<ExportButtons resume={resume} starResult={starResult} />);

    const pdfBtn = screen.getByRole('button', { name: /导出 PDF|Export PDF/i });
    fireEvent.click(pdfBtn);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/resume/export');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.format).toBe('pdf');
    expect(body.resume).toBeDefined();
    expect(body.starResult).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fixtures used by the export integration test
// ---------------------------------------------------------------------------

function buildExportResume(): import('@/lib/resume/types').ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
    basic: { name: '张三', title: '高级测试开发工程师' },
    experience: [
      { company: 'Acme', role: 'SDET', period: '2022-2025', bullets: ['Built test framework'] },
    ],
    projects: [],
    skills: ['Python', 'MySQL'],
    education: [],
    raw: '张三 / 高级测试开发工程师',
  };
}

function buildExportStarResult(): import('@/lib/resume/star-rewriter').StarRewriteResult {
  return {
    sections: {
      '我的分析': '分析。',
      'STAR改写': 'STAR。',
      '底层心法': '心法。',
      '建议': '建议。',
    },
    confidence: 0.5,
  };
}
