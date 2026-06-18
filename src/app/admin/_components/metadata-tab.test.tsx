// src/app/admin/_components/metadata-tab.test.tsx
// ReUp v2 Phase 2E: 分类浏览 tab 组件测试。
//
// 覆盖点（参考 2026-06-15 spec §3.5）：
//   (a) 初次渲染 loading 状态
//   (b) 拉取后 4 张统计卡显示数字
//   (c) 默认视图 = 按分类
//   (d) 切换到「按书 × 分类」显示交叉表
//   (e) 刷新按钮重新触发拉取
//   (f) 通用分类用 muted 样式（视觉区分）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetadataTab from './metadata-tab';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------- Fixtures ----------------

const STATS_FIXTURE = {
  total: 608,
  dimension: 1024,
  byBook: [
    { name: '大厂晋升指南', count: 274 },
    { name: '面试现场', count: 334 },
  ],
  byCategory: [
    { name: '晋升答辩', count: 60 },
    { name: '能力模型', count: 48 },
    { name: '自我介绍', count: 40 },
    { name: '通用', count: 36 },
  ],
  bySkill: [],
  byChapter: [],
  bySection: [],
};

const TOPIC_SUMMARY_FIXTURE = {
  byBookCategory: [
    {
      book: '大厂晋升指南',
      categories: [
        { category: '晋升答辩', count: 60 },
        { category: '能力模型', count: 48 },
        { category: '通用', count: 20 },
      ],
    },
    {
      book: '面试现场',
      categories: [
        { category: '自我介绍', count: 40 },
        { category: '通用', count: 16 },
      ],
    },
  ],
  byBook: [
    { name: '大厂晋升指南', total: 274 },
    { name: '面试现场', total: 334 },
  ],
  byCategory: [
    { name: '晋升答辩', total: 60 },
    { name: '通用', total: 36 },
  ],
  genericCount: 36,
};

const CATEGORY_GROUPS_FIXTURE = {
  groups: [
    {
      name: '晋升答辩',
      count: 60,
      sample: { preview: '答辩话术...', book: '大厂晋升指南', sectionTitle: '晋升答辩' },
    },
    {
      name: '自我介绍',
      count: 40,
      sample: { preview: '开场白...', book: '面试现场', sectionTitle: '自我介绍' },
    },
    {
      name: '通用',
      count: 36,
      sample: { preview: '通用知识...', book: '大厂晋升指南', sectionTitle: '前言' },
    },
  ],
};

function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

function setupFetchMock(): ReturnType<typeof vi.fn> {
  const fn = vi.fn((url: string) => {
    if (url.includes('action=stats')) {
      return Promise.resolve(mockJsonResponse(STATS_FIXTURE));
    }
    if (url.includes('action=topic-summary')) {
      return Promise.resolve(mockJsonResponse(TOPIC_SUMMARY_FIXTURE));
    }
    if (url.includes('action=by-category')) {
      return Promise.resolve(mockJsonResponse(CATEGORY_GROUPS_FIXTURE));
    }
    return Promise.resolve(mockJsonResponse({ error: 'unknown_action' }, false));
  });
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  return fn;
}

describe('MetadataTab', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
    vi.restoreAllMocks();
  });

  // (a) Loading state on first render
  it('(a) 初次渲染显示 loading 状态,统计卡显示占位符 -', async () => {
    const fetchMock = setupFetchMock();
    render(<MetadataTab />);

    // 4 个统计卡占位符
    expect(screen.getByTestId('stat-promotion')).toHaveTextContent('-');
    expect(screen.getByTestId('stat-interview')).toHaveTextContent('-');
    expect(screen.getByTestId('stat-generic')).toHaveTextContent('-');
    expect(screen.getByTestId('stat-total')).toHaveTextContent('-');

    // 视图区 loading
    expect(screen.getByText(/加载分类数据/)).toBeInTheDocument();

    // 等 fetch 解析完，避免影响下一个 case
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  // (b) Renders 4 stat cards with real values after fetch
  it('(b) 拉取完成后 4 张统计卡显示真实数值', async () => {
    setupFetchMock();
    render(<MetadataTab />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-promotion')).toHaveTextContent('274');
    });
    expect(screen.getByTestId('stat-interview')).toHaveTextContent('334');
    expect(screen.getByTestId('stat-generic')).toHaveTextContent('36');
    expect(screen.getByTestId('stat-total')).toHaveTextContent('608');
  });

  // (c) Default view is 按分类
  it('(c) 默认视图是「按分类」,渲染分类表格', async () => {
    setupFetchMock();
    render(<MetadataTab />);

    await waitFor(() => {
      expect(screen.getByTestId('category-row-晋升答辩')).toBeInTheDocument();
    });

    // 分类表格应包含 3 行（晋升答辩 / 自我介绍 / 通用）
    expect(screen.getByTestId('category-row-晋升答辩')).toBeInTheDocument();
    expect(screen.getByTestId('category-row-自我介绍')).toBeInTheDocument();
    expect(screen.getByTestId('category-row-通用')).toBeInTheDocument();

    // 视图按钮处于按分类高亮
    const catButton = screen.getByRole('button', { name: /按分类/ });
    expect(catButton).toHaveAttribute('aria-pressed', 'true');
  });

  // (d) Toggle to 按书 × 分类 shows matrix
  it('(d) 切换到「按书 × 分类」显示交叉表', async () => {
    const user = userEvent.setup();
    setupFetchMock();
    render(<MetadataTab />);

    await waitFor(() => {
      expect(screen.getByTestId('category-row-晋升答辩')).toBeInTheDocument();
    });

    // 切换到交叉表
    const crosstabButton = screen.getByRole('button', { name: /按书 × 分类/ });
    await user.click(crosstabButton);

    // 交叉表行出现
    await waitFor(() => {
      expect(screen.getByTestId('crosstab-book-大厂晋升指南')).toBeInTheDocument();
    });
    expect(screen.getByTestId('crosstab-book-面试现场')).toBeInTheDocument();
    expect(
      screen.getByTestId('crosstab-cell-大厂晋升指南-晋升答辩')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('crosstab-cell-面试现场-自我介绍')
    ).toBeInTheDocument();

    // 此时分类表格不应再渲染
    expect(screen.queryByTestId('category-row-晋升答辩')).not.toBeInTheDocument();

    // 按钮高亮切换
    expect(crosstabButton).toHaveAttribute('aria-pressed', 'true');
  });

  // (e) Refresh button re-triggers fetch
  it('(e) 点击刷新按钮会重新拉取 3 路数据', async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetchMock();
    render(<MetadataTab />);

    // 初次拉取 3 次
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const refreshButton = screen.getByRole('button', { name: /刷新/ });
    await user.click(refreshButton);

    // 再拉 3 次
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    // 验证再次调用了 topic-summary
    const summaryCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('action=topic-summary')
    );
    expect(summaryCalls.length).toBeGreaterThanOrEqual(2);
  });

  // (g) 点击分类行跳转
  it('(g) 点击分类行会跳转到知识库 tab 并携带分类过滤', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setupFetchMock();
    render(<MetadataTab onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByTestId('category-row-晋升答辩')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('category-row-晋升答辩'));
    expect(onNavigate).toHaveBeenCalledWith('knowledge', { group: 'category', name: '晋升答辩' });
  });

  // (h) 点击交叉表单元格跳转
  it('(h) 点击书 × 分类单元格会跳转到知识库 tab 并携带书名+分类过滤', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    setupFetchMock();
    render(<MetadataTab onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByTestId('category-row-晋升答辩')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /按书 × 分类/ }));
    await waitFor(() => {
      expect(screen.getByTestId('crosstab-cell-大厂晋升指南-晋升答辩')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('crosstab-cell-大厂晋升指南-晋升答辩'));
    expect(onNavigate).toHaveBeenCalledWith('knowledge', {
      group: 'category',
      name: '晋升答辩',
      book: '大厂晋升指南',
    });
  });

  // (f) 通用 count uses muted styling
  it('(f) 通用统计卡使用 muted 样式（虚线边框 + 次要前景色）', async () => {
    setupFetchMock();
    render(<MetadataTab />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-generic')).toHaveTextContent('36');
    });

    const genericCard = screen.getByTestId('stat-generic').closest('[class*="border-dashed"]');
    expect(genericCard).not.toBeNull();
    expect(genericCard?.className).toContain('border-dashed');
    expect(genericCard?.className).toContain('bg-muted/30');

    // 通用文字应是 muted-foreground
    expect(screen.getByTestId('stat-generic').className).toContain('text-muted-foreground');

    // 通用分类行在分类视图里也应被识别（带「兜底」标记）
    const genericRow = screen.getByTestId('category-row-通用');
    expect(within(genericRow).getByText('兜底')).toBeInTheDocument();

    // 切换到交叉表：通用 cell 也应带 dashed 边框
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /按书 × 分类/ }));
    await waitFor(() => {
      expect(screen.getByTestId('crosstab-book-大厂晋升指南')).toBeInTheDocument();
    });
    const genericCell = screen.getByTestId('crosstab-cell-大厂晋升指南-通用');
    expect(genericCell.className).toContain('border-dashed');
    expect(within(genericCell).getByText('（兜底）')).toBeInTheDocument();
  });
});
