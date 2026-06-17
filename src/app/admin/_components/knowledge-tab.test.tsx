import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import KnowledgeTab from './knowledge-tab';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const STATS_RESPONSE = {
  total: 608,
  dimension: 1024,
  byBook: [
    { name: 'book-alpha', count: 274 },
    { name: 'book-beta', count: 334 },
  ],
  byCategory: [
    { name: 'category-alpha', count: 88 },
    { name: 'category-beta', count: 50 },
  ],
  bySkill: [], // 保留字段，Phase 2D 后已为空
  byChapter: [
    { name: 'book-alpha（第10章）', count: 18 },
    { name: 'book-alpha（加餐一）', count: 12 },
  ],
  bySection: [
    { name: '加餐一｜主题 alpha', count: 5 },
    { name: '开篇词｜主题 beta', count: 3 },
  ],
};

const SAMPLE_HITS = [
  {
    id: 'chunk-1',
    preview: '示例文本一：先把故事讲清楚，再讲数据。',
    book: 'book-alpha',
    category: 'category-alpha',
    skillName: '',
    topic: '主题 alpha 的叙事结构',
    sourcePath: 'book/alpha/10.md',
    docTitle: 'book-alpha（第10章）',
    sectionTitle: '10.1 叙事',
    chunkIndex: 0,
  },
  {
    id: 'chunk-2',
    preview: '示例文本二：结构化表达更聚焦。',
    book: 'book-beta',
    category: 'category-beta',
    skillName: '',
    topic: '开场的结构化钩子',
    sourcePath: 'book/beta/02.md',
    docTitle: 'book-beta（第2章）',
    sectionTitle: '2.1 开场',
    chunkIndex: 1,
  },
];

function mockFetchOnce(json: unknown, ok = true): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => json,
  } as unknown as Response);
}

describe('KnowledgeTab — 4 维度分组（Phase 2F）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
    vi.restoreAllMocks();
  });

  it('(a) 渲染 4 个分组 tab（按书 / 按分类 / 按章 / 按节），不再有"按 Skill"', async () => {
    globalThis.fetch = mockFetchOnce(STATS_RESPONSE) as unknown as typeof globalThis.fetch;

    render(<KnowledgeTab />);

    // 4 个新 tab 都在
    expect(await screen.findByTestId('group-tab-book')).toHaveTextContent('按书');
    expect(screen.getByTestId('group-tab-category')).toHaveTextContent('按分类');
    expect(screen.getByTestId('group-tab-docTitle')).toHaveTextContent('按章');
    expect(screen.getByTestId('group-tab-sectionTitle')).toHaveTextContent('按节');

    // 「按 Skill」tab 不再出现
    expect(screen.queryByRole('button', { name: /按 Skill/ })).toBeNull();
  });

  it('(b) 默认激活的 tab 是「按章」（docTitle）', async () => {
    globalThis.fetch = mockFetchOnce(STATS_RESPONSE) as typeof globalThis.fetch;

    render(<KnowledgeTab />);

    // 等待 stats 加载完成 → 表格行出现
    await screen.findByText('book-alpha（第10章）');

    const bookTab = screen.getByTestId('group-tab-book');
    const categoryTab = screen.getByTestId('group-tab-category');
    const chapterTab = screen.getByTestId('group-tab-docTitle');
    const sectionTab = screen.getByTestId('group-tab-sectionTitle');

    // 按章 应处于 active 态（带 bg-primary 类）
    expect(chapterTab.className).toContain('bg-primary');
    expect(bookTab.className).not.toContain('bg-primary');
    expect(categoryTab.className).not.toContain('bg-primary');
    expect(sectionTab.className).not.toContain('bg-primary');

    // 默认 tab 下渲染的是 stats.byChapter 的数据（而不是 byBook）
    expect(screen.getByText('book-alpha（第10章）')).toBeInTheDocument();
    expect(screen.getByText('book-alpha（加餐一）')).toBeInTheDocument();
    // byBook 的内容不会出现在按章 tab 下
    expect(screen.queryByText('book-beta')).toBeNull();
  });

  it('(c) 点击「按分类」切换 active tab，并展示 byCategory 数据', async () => {
    globalThis.fetch = mockFetchOnce(STATS_RESPONSE) as unknown as typeof globalThis.fetch;

    render(<KnowledgeTab />);
    await screen.findByText('book-alpha（第10章）');

    const categoryTab = screen.getByTestId('group-tab-category');
    fireEvent.click(categoryTab);

    await waitFor(() => {
      expect(categoryTab.className).toContain('bg-primary');
    });

    // byCategory 数据出现
    expect(screen.getByText('category-alpha')).toBeInTheDocument();
    expect(screen.getByText('category-beta')).toBeInTheDocument();

    // 按章 tab 不再 active
    const chapterTab = screen.getByTestId('group-tab-docTitle');
    expect(chapterTab.className).not.toContain('bg-primary');

    // 展开一个分组时，调用的 search API 仍然走 /api/admin/knowledge?action=search
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: SAMPLE_HITS }),
    } as unknown as Response);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    fireEvent.click(screen.getByText('category-alpha'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const lastCallUrl = String(fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]?.[0] ?? '');
    expect(lastCallUrl).toMatch(/action=search/);
    expect(lastCallUrl).toMatch(/q=/); // q 至少存在
  });

  it('(d) 搜索结果展示 `book / doc_title` 头部（mono 字体）', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      // 第一次 stats，第二次 search
      if (callCount === 1) {
        return { ok: true, json: async () => STATS_RESPONSE } as unknown as Response;
      }
      return { ok: true, json: async () => ({ results: SAMPLE_HITS }) } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;

    render(<KnowledgeTab />);
    await screen.findByText('book-alpha（第10章）');

    // 触发搜索
    const input = screen.getByPlaceholderText(/关键词/);
    fireEvent.change(input, { target: { value: '示例' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    // 等待搜索结果渲染
    const hits = await screen.findAllByTestId('search-hit');
    expect(hits).toHaveLength(2);

    // 每条结果都有 `book / doc_title` 头部
    const topicLines = screen.getAllByTestId('search-hit-topic');
    expect(topicLines).toHaveLength(2);
    expect(topicLines[0]!.textContent).toContain('book-alpha');
    expect(topicLines[0]!.textContent).toContain('book-alpha（第10章）');
    expect(topicLines[0]!.textContent).toContain('/');
    expect(topicLines[1]!.textContent).toContain('book-beta');
    expect(topicLines[1]!.textContent).toContain('book-beta（第2章）');

    // 头部使用 mono 字体
    expect(topicLines[0]!.className).toContain('font-mono');
  });

  it('(e) 搜索结果展示 `topic` 字段作为副标题', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => STATS_RESPONSE } as unknown as Response;
      }
      return { ok: true, json: async () => ({ results: SAMPLE_HITS }) } as unknown as Response;
    });

    render(<KnowledgeTab />);
    await screen.findByText('book-alpha（第10章）');

    const input = screen.getByPlaceholderText(/关键词/);
    fireEvent.change(input, { target: { value: '示例' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    const subtitles = await screen.findAllByTestId('search-hit-subtitle');
    expect(subtitles).toHaveLength(2);
    expect(subtitles[0]!.textContent).toBe('主题 alpha 的叙事结构');
    expect(subtitles[1]!.textContent).toBe('开场的结构化钩子');
  });
});
