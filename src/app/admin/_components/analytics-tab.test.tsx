// src/app/admin/_components/analytics-tab.test.tsx
// ReUp Phase 3 Task 3.4: 后台统计 Tab 组件测试。
//
// 覆盖点（参考 docs/superpowers/specs/2026-06-17-spec-infra-logging-analytics.md）：
//   (a) 初次渲染 loading 状态
//   (b) 拉取成功后 4 张 KPI 卡显示真实数值
//   (c) 时间范围选择器触发重新拉取（URL 带 start 参数）
//   (d) 错误状态：fetch 抛错时显示错误提示
//   (e) 服务端返回 500 时显示错误信息

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalyticsTab from './analytics-tab';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------- Fixtures ----------------

const TREND_FIXTURE = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-05-${String(i + 1).padStart(2, '0')}`,
  count: 5 + (i % 7),
}));

const FULL_OVERVIEW = {
  totalUsers: 0,
  resumeUploads: 12,
  jdParses: 8,
  matchAnalyses: 6,
  starRewrites: 4,
  interviewSessions: 10,
  transcriptUploads: 3,
  exports: { pdf: 5, docx: 2, md: 1 },
  errorRate: 2.5,
  period: { start: 'all', end: 'now' },
  traceId: 'trace-abc-123',
  topEvents: [
    { type: 'resume_upload', count: 12 },
    { type: 'interview_coach_start', count: 10 },
    { type: 'jd_parse', count: 8 },
    { type: 'match_analysis', count: 6 },
    { type: 'star_rewrite', count: 4 },
  ],
  dailyTrend: TREND_FIXTURE,
  recentEvents: [
    { type: 'page_view', timestamp: Date.now() - 1_000, data: { page: '/admin' } },
    { type: 'resume_upload', timestamp: Date.now() - 60_000, data: { format: 'pdf' } },
    { type: 'match_analysis', timestamp: Date.now() - 120_000, data: { score: 88 } },
  ],
};

function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

function setupFetchMock(handler: (url: string) => Response): ReturnType<typeof vi.fn> {
  const fn = vi.fn((url: string) => Promise.resolve(handler(String(url))));
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  return fn;
}

describe('AnalyticsTab', () => {
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
  it('(a) 初次渲染显示 loading 状态，KPI 卡显示占位符', async () => {
    const fetchMock = setupFetchMock(() => mockJsonResponse(FULL_OVERVIEW));
    render(<AnalyticsTab />);

    // 4 个 KPI 占位符
    expect(screen.getByTestId('kpi-total')).toHaveTextContent('-');
    expect(screen.getByTestId('kpi-users')).toHaveTextContent('-');
    expect(screen.getByTestId('kpi-top')).toHaveTextContent('-');
    expect(screen.getByTestId('kpi-7d')).toHaveTextContent('-');

    // 等待首次拉取完成，避免污染下一个 case
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  // (b) Renders KPI cards with real values
  it('(b) 拉取完成后 4 张 KPI 卡显示真实数值', async () => {
    setupFetchMock(() => mockJsonResponse(FULL_OVERVIEW));
    render(<AnalyticsTab />);

    const expectedTotal =
      FULL_OVERVIEW.resumeUploads +
      FULL_OVERVIEW.jdParses +
      FULL_OVERVIEW.matchAnalyses +
      FULL_OVERVIEW.starRewrites +
      FULL_OVERVIEW.interviewSessions +
      FULL_OVERVIEW.transcriptUploads +
      (FULL_OVERVIEW.exports.pdf + FULL_OVERVIEW.exports.docx + FULL_OVERVIEW.exports.md);

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total')).toHaveTextContent(String(expectedTotal));
    });
    // 独立用户数（接口总是 0，但需要渲染）
    expect(screen.getByTestId('kpi-users')).toHaveTextContent('0');
    // Top 事件 = topEvents[0]，是 "resume_upload"
    expect(screen.getByTestId('kpi-top')).toHaveTextContent(/简历上传/);
    // 最近 7 日事件数 = dailyTrend 末尾 7 个 bucket 之和
    const last7 = FULL_OVERVIEW.dailyTrend.slice(-7);
    const last7Sum = last7.reduce((s, p) => s + p.count, 0);
    expect(screen.getByTestId('kpi-7d')).toHaveTextContent(String(last7Sum));
  });

  // (c) Time range change triggers re-fetch with start param
  it('(c) 切换时间范围到 24h 会重新拉取，URL 带 start 参数', async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetchMock(() => mockJsonResponse(FULL_OVERVIEW));
    render(<AnalyticsTab />);

    // 首次拉取
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(firstUrl).toMatch(/^\/api\/admin\/analytics/);
    // 第一次不应带 start（默认 all）
    expect(firstUrl).not.toMatch(/[?&]start=/);

    // 打开 Select 找到「最近 24 小时」并点击
    const trigger = screen.getByTestId('range-trigger');
    await user.click(trigger);
    const option = await screen.findByTestId('range-24h');
    await user.click(option);

    // 触发第二次拉取
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const secondUrl = String(fetchMock.mock.calls[1]?.[0] ?? '');
    expect(secondUrl).toMatch(/[?&]start=/);
  });

  // (d) Network error → shows error state
  it('(d) fetch 网络异常时显示错误提示', async () => {
    setupFetchMock(() => {
      throw new Error('network down');
    });
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('analytics-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('analytics-error').textContent).toMatch(/network down/);
  });

  // (e) HTTP 500 → shows error message
  it('(e) 服务端返回 500 时显示错误信息', async () => {
    setupFetchMock(() => mockJsonResponse({ error: '获取统计数据失败' }, false));
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('analytics-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('analytics-error').textContent).toMatch(/获取统计数据失败/);
  });
});
