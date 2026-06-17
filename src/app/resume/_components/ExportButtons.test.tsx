// src/app/resume/_components/ExportButtons.test.tsx
// ReUp v2 Phase 5 (H6): Export buttons UI tests.
//
// TDD-first: written before the component. The component renders
// Copy Markdown / PDF / DOCX buttons, calls navigator.clipboard for
// the copy action, and POSTs to /api/resume/export for binary formats.
//
// Tests are synchronous — fetch is mocked globally; clipboard is
// mocked by stubbing `navigator.clipboard.writeText` in the jsdom env.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportButtons } from './ExportButtons';
import type { ResumeDocument } from '@/lib/resume/types';
import type { StarRewriteResult } from '@/lib/resume/star-rewriter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const resume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张三', title: '高级测试开发工程师' },
  experience: [
    {
      company: 'Acme',
      role: 'SDET',
      period: '2022-2025',
      bullets: ['Built test framework'],
    },
  ],
  projects: [],
  skills: ['Python', 'MySQL'],
  education: [],
  raw: '张三 / 高级测试开发工程师',
};

const starResult: StarRewriteResult = {
  sections: {
    '我的分析': '5 年测试开发经验，端到端负责核心业务质量。',
    'STAR改写': 'S: 面对千万级数据回归 T: 主导自动化方案 A: 落地 R: 节省 60% 时间',
    '底层心法': '闭环 = 目标 + 度量 + 迭代。',
    '建议': '补充业务影响力数字。',
  },
  confidence: 0.8,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return { writeText };
}

function mockFetchBlob(): ReturnType<typeof vi.fn> {
  const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(blob),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportButtons', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders three buttons: Copy Markdown, PDF, DOCX', () => {
    render(<ExportButtons resume={resume} starResult={starResult} />);
    expect(screen.getByRole('button', { name: /Copy Markdown|复制 Markdown/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^PDF$|导出 PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^DOCX$|导出 DOCX/i })).toBeInTheDocument();
  });

  it('disables all three buttons when resume is null', () => {
    render(<ExportButtons resume={null} starResult={starResult} />);
    const buttons = screen.getAllByRole('button');
    for (const b of buttons) {
      expect(b).toBeDisabled();
    }
  });

  it('disables all three buttons when starResult is null', () => {
    render(<ExportButtons resume={resume} starResult={null} />);
    const buttons = screen.getAllByRole('button');
    for (const b of buttons) {
      expect(b).toBeDisabled();
    }
  });

  it('Copy Markdown button copies the formatted resume markdown to clipboard', async () => {
    const { writeText } = mockClipboard();
    render(<ExportButtons resume={resume} starResult={starResult} />);
    const btn = screen.getByRole('button', { name: /Copy Markdown|复制 Markdown/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const arg = writeText.mock.calls[0]?.[0] as string;
    expect(typeof arg).toBe('string');
    expect(arg.length).toBeGreaterThan(0);
    // The markdown should contain some resume basics
    expect(arg).toMatch(/张三|高级测试|Acme/);
  });

  it('PDF button POSTs to /api/resume/export with format=pdf and triggers a download', async () => {
    const fetchMock = mockFetchBlob();
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    // jsdom does not implement anchor.click by default — wire it up
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLAnchorElement;
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy, configurable: true });
      }
      return el;
    });

    render(<ExportButtons resume={resume} starResult={starResult} />);
    const pdfBtn = screen.getByRole('button', { name: /^PDF$|导出 PDF/i });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/resume/export');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.format).toBe('pdf');
    expect(body.resume).toBeDefined();
    expect(body.starResult).toBeDefined();

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('DOCX button POSTs to /api/resume/export with format=docx and triggers a download', async () => {
    const fetchMock = mockFetchBlob();
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLAnchorElement;
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy, configurable: true });
      }
      return el;
    });

    render(<ExportButtons resume={resume} starResult={starResult} />);
    const docxBtn = screen.getByRole('button', { name: /^DOCX$|导出 DOCX/i });
    fireEvent.click(docxBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.format).toBe('docx');
    expect(body.resume).toBeDefined();
    expect(body.starResult).toBeDefined();

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
