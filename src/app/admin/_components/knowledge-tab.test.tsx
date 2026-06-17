import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import KnowledgeTab from './knowledge-tab';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const STATS_RESPONSE = {
  total: 608,
  dimension: 1024,
  byBook: [
    { name: '大厂晋升指南', count: 274 },
    { name: '面试现场', count: 334 },
  ],
  byCategory: [
    { name: '晋升答辩', count: 88 },
    { name: '自我介绍', count: 50 },
  ],
  bySkill: [], // 保留字段，Phase 2D 后已为空
  byChapter: [
    { name: '大厂晋升指南（第10章优化版）', count: 18 },
    { name: '大厂晋升指南（加餐一优化版）', count: 12 },
  ],
  bySection: [
    { name: '加餐一｜晋升等级：不同的职级体系如何对标？', count: 5 },
    { name: '开篇词｜为什么讲技术人的职场发展？', count: 3 },
  ],
};

const SAMPLE_HITS = [
  {
    id: 'chunk-1',
    preview: '晋升答辩要先把故事讲清楚，再讲数据。',
    book: '大厂晋升指南',
    category: '晋升答辩',
    skillName: '',
    topic: '晋升答辩的叙事结构',
    sourcePath: 'book/promotion/10.md',
    docTitle: '大厂晋升指南（第10章优化版）',
    sectionTitle: '10.1 答辩叙事',
    chunkIndex: 0,
  },
  {
    id: 'chunk-2',
    preview: 'STAR 法则让自我介绍更聚焦。',
    book: '面试现场',
    category: '自我介绍',
    skillName: '',
    topic: '开场的 30 秒钩子',
    sourcePath: 'book/interview/02.md',
    docTitle: '面试现场（第2章优化版）',
    sectionTitle: '2.1 自我介绍',
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
    await screen.findByText('大厂晋升指南（第10章优化版）');

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
    expect(screen.getByText('大厂晋升指南（第10章优化版）')).toBeInTheDocument();
    expect(screen.getByText('大厂晋升指南（加餐一优化版）')).toBeInTheDocument();
    // byBook 的内容不会出现在按章 tab 下
    expect(screen.queryByText('面试现场')).toBeNull();
  });

  it('(c) 点击「按分类」切换 active tab，并展示 byCategory 数据', async () => {
    globalThis.fetch = mockFetchOnce(STATS_RESPONSE) as unknown as typeof globalThis.fetch;

    render(<KnowledgeTab />);
    await screen.findByText('大厂晋升指南（第10章优化版）');

    const categoryTab = screen.getByTestId('group-tab-category');
    fireEvent.click(categoryTab);

    await waitFor(() => {
      expect(categoryTab.className).toContain('bg-primary');
    });

    // byCategory 数据出现
    expect(screen.getByText('晋升答辩')).toBeInTheDocument();
    expect(screen.getByText('自我介绍')).toBeInTheDocument();

    // 按章 tab 不再 active
    const chapterTab = screen.getByTestId('group-tab-docTitle');
    expect(chapterTab.className).not.toContain('bg-primary');

    // 展开一个分组时，调用的 search API 仍然走 /api/admin/knowledge?action=search
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: SAMPLE_HITS }),
    } as unknown as Response);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    fireEvent.click(screen.getByText('晋升答辩'));

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
    await screen.findByText('大厂晋升指南（第10章优化版）');

    // 触发搜索
    const input = screen.getByPlaceholderText(/关键词/);
    fireEvent.change(input, { target: { value: '晋升' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    // 等待搜索结果渲染
    const hits = await screen.findAllByTestId('search-hit');
    expect(hits).toHaveLength(2);

    // 每条结果都有 `book / doc_title` 头部
    const topicLines = screen.getAllByTestId('search-hit-topic');
    expect(topicLines).toHaveLength(2);
    expect(topicLines[0]!.textContent).toContain('大厂晋升指南');
    expect(topicLines[0]!.textContent).toContain('大厂晋升指南（第10章优化版）');
    expect(topicLines[0]!.textContent).toContain('/');
    expect(topicLines[1]!.textContent).toContain('面试现场');
    expect(topicLines[1]!.textContent).toContain('面试现场（第2章优化版）');

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
    await screen.findByText('大厂晋升指南（第10章优化版）');

    const input = screen.getByPlaceholderText(/关键词/);
    fireEvent.change(input, { target: { value: '晋升' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    const subtitles = await screen.findAllByTestId('search-hit-subtitle');
    expect(subtitles).toHaveLength(2);
    expect(subtitles[0]!.textContent).toBe('晋升答辩的叙事结构');
    expect(subtitles[1]!.textContent).toBe('开场的 30 秒钩子');
  });
});
