// src/components/shared/interview/__tests__/InterviewChat.tracking.test.tsx
// Verifies interview coach start / end events.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockSafeTrack = vi.fn();
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

import InterviewChat from '../InterviewChat';

function mockStartSuccess() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/interview/coach/start') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          sessionId: 'sess-1',
          openingQuestion: '请介绍一下你自己',
        }),
      });
    }
    if (url === '/api/interview/coach/report') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          overallScore: 80,
          phaseScores: { selfIntro: 80, projectDeepDive: 80, techAssessment: 80, behavioral: 80 },
          strengths: [], weaknesses: [], suggestions: [], summary: 'ok',
        }),
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InterviewChat tracking', () => {
  it('emits interview_coach_start on 开始面试 click', async () => {
    mockStartSuccess();
    render(<InterviewChat />);

    mockSafeTrack.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始面试/ }));
    });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'interview_coach_start',
        data: { hasJd: false },
      });
    });
  });

  it('emits error event when /start fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('HTTP 500'),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<InterviewChat />);

    mockSafeTrack.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始面试/ }));
    });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      );
    });
  });
});
