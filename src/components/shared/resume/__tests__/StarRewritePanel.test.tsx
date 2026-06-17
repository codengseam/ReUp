// src/components/shared/resume/__tests__/StarRewritePanel.test.tsx
// ReUp Phase 2 (Task 2.2): STAR contextual rewrite panel tests.
//
// Coverage:
//  1) Initial render: checkboxes default-checked, start button enabled,
//     no streaming yet
//  2) Toggling a checkbox updates the selection
//  3) "开始改写" POSTs to /api/resume/rewrite with the right body
//  4) SSE chunks incrementally update the right-pane (改写后) text
//  5) SSE { type: 'done' } fires onComplete with a RewriteResult
//  6) SSE { type: 'error' } surfaces an error message
//  7) Network failure surfaces an error message
//  8) "取消" aborts the in-flight request

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StarRewritePanel } from '../StarRewritePanel';
import type { ResumeDocument, MatchReport } from '@/features/resume/types';
import type { RewriteResult } from '@/features/resume/rewriter/contextual-rewriter';

// The panel now emits analytics events on rewrite completion; mock the
// helper so existing tests don't see the extra /api/analytics/track call.
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: vi.fn(),
  getSessionId: () => 'test-session',
}));

const resume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张辰', title: '高级后端工程师', yearsOfExperience: 6 },
  experience: [
    { company: '蓝芯科技', role: '高级后端工程师', period: '2023-03 - 至今', bullets: ['负责订单中台微服务架构升级'] },
  ],
  projects: [
    { name: '订单中台微服务升级', period: '2023-06 - 2023-12', bullets: ['把单体拆成 8 个微服务'] },
  ],
  skills: ['Java', 'Spring Cloud'],
  education: [],
  raw: '张辰 / 高级后端工程师 / 6年',
};

const matchReport: MatchReport = {
  strengths: [],
  gaps: [],
  priorities: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ReadableStream-like Response from a list of SSE frames. */
function sseResponse(frames: string[], ok: boolean = true): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status: ok ? 200 : 500 });
}

function mockFetchSSE(frames: string[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(sseResponse(frames));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockFetchError(message: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockRejectedValue(new Error(message));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function clickStart() {
  const btn = screen.getByRole('button', { name: /开始改写/ });
  fireEvent.click(btn);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StarRewritePanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders initial state with all sections selected and start button enabled', () => {
    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);
    expect(screen.getByRole('button', { name: /开始改写/ })).toBeEnabled();
    expect(screen.getByLabelText('选择 工作经历')).toBeChecked();
    expect(screen.getByLabelText('选择 项目经历')).toBeChecked();
    expect(screen.getByLabelText('选择 技能列表')).toBeChecked();
    // The original column should show the resume content
    expect(screen.getByText(/蓝芯科技/)).toBeInTheDocument();
  });

  it('toggles a section checkbox', () => {
    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);
    const skillsCb = screen.getByLabelText('选择 技能列表');
    expect(skillsCb).toBeChecked();
    fireEvent.click(skillsCb);
    expect(skillsCb).not.toBeChecked();
  });

  it('disables start button when no sections are selected', () => {
    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);
    fireEvent.click(screen.getByLabelText('选择 工作经历'));
    fireEvent.click(screen.getByLabelText('选择 项目经历'));
    fireEvent.click(screen.getByLabelText('选择 技能列表'));
    expect(screen.getByRole('button', { name: /开始改写/ })).toBeDisabled();
  });

  it('POSTs resume + matchReport + targetSections to /api/resume/rewrite on start', async () => {
    const fetchMock = mockFetchSSE(['data: {"type":"done"}\n\n']);
    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);

    await act(async () => { clickStart(); });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/resume/rewrite');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.resume).toEqual(resume);
    expect(body.matchReport).toEqual(matchReport);
    expect(body.targetSections).toEqual(['experience', 'projects', 'skills']);
    expect(body.stream).toBe(true);
  });

  it('aggregates SSE chunks and updates the right pane incrementally', async () => {
    const frames = [
      'data: {"type":"chunk","section":"experience","delta":"Hello","done":false}\n\n',
      'data: {"type":"chunk","section":"experience","delta":" world","done":false}\n\n',
      'data: {"type":"chunk","section":"experience","delta":"","done":true}\n\n',
      'data: {"type":"done"}\n\n',
    ];
    mockFetchSSE(frames);
    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);

    await act(async () => { clickStart(); });

    await waitFor(() => {
      // The right-pane should show the aggregated text
      expect(screen.getByText(/Hello world/)).toBeInTheDocument();
    });
  });

  it('fires onComplete with a RewriteResult when the stream finishes', async () => {
    const frames = [
      'data: {"type":"chunk","section":"skills","delta":"Java, Spring Cloud, Kubernetes","done":false}\n\n',
      'data: {"type":"chunk","section":"skills","delta":"","done":true}\n\n',
      'data: {"type":"done"}\n\n',
    ];
    mockFetchSSE(frames);

    const onComplete = vi.fn();
    render(
      <StarRewritePanel
        resume={resume}
        matchReport={matchReport}
        onComplete={onComplete}
      />,
    );

    await act(async () => { clickStart(); });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    const arg = onComplete.mock.calls[0]?.[0] as RewriteResult;
    expect(arg.original).toEqual(resume);
    expect(Array.isArray(arg.changes)).toBe(true);
    // The skills section was the only one with content, so we should have one change
    expect(arg.changes.length).toBeGreaterThan(0);
    const skill = arg.changes.find((c) => c.section === '技能列表');
    expect(skill).toBeDefined();
    expect(skill!.after).toContain('Kubernetes');
  });

  it('surfaces an SSE error frame as a UI error', async () => {
    const frames = [
      'data: {"type":"error","error":"boom"}\n\n',
      'data: {"type":"done"}\n\n',
    ];
    mockFetchSSE(frames);
    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);

    await act(async () => { clickStart(); });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('boom');
    });
  });

  it('surfaces a network error as a UI error', async () => {
    mockFetchError('network down');
    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);

    await act(async () => { clickStart(); });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('network down');
    });
  });

  it('cancels an in-flight stream when the cancel button is clicked', async () => {
    let aborted = false;
    // Slow stream that never resolves — we'll abort before it completes
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"chunk","section":"experience","delta":"hi","done":false}\n\n'));
        // Hold the stream open
        const interval = setInterval(() => {
          if (aborted) {
            clearInterval(interval);
            controller.close();
          }
        }, 50);
      },
    });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', () => { aborted = true; });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);

    await act(async () => { clickStart(); });

    // Click cancel
    const cancelBtn = await screen.findByRole('button', { name: /取消/ });
    await act(async () => { fireEvent.click(cancelBtn); });

    await waitFor(() => {
      expect(aborted).toBe(true);
    });
  });
});
