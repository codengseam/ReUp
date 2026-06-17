// src/components/shared/resume/__tests__/StarRewritePanel.tracking.test.tsx
// Verifies STAR rewrite panel emits star_rewrite and error events.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockSafeTrack = vi.fn();
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

import { StarRewritePanel } from '../StarRewritePanel';
import type { ResumeDocument, MatchReport } from '@/features/resume/types';

const resume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张辰' },
  experience: [{ company: '蓝芯', role: 'SDE', period: '2023', bullets: ['a'] }],
  projects: [],
  skills: ['Java'],
  education: [],
  raw: '张辰',
};

const matchReport: MatchReport = { strengths: [], gaps: [], priorities: [] };

function sseResponse(frames: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StarRewritePanel tracking', () => {
  it('emits star_rewrite with sectionCount when stream completes', async () => {
    const frames = [
      'data: {"type":"chunk","section":"skills","delta":"Java, Spring","done":false}\n\n',
      'data: {"type":"chunk","section":"skills","delta":"","done":true}\n\n',
      'data: {"type":"done"}\n\n',
    ];
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(frames));
    vi.stubGlobal('fetch', fetchMock);

    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始改写/ }));
    });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'star_rewrite',
        data: { sectionCount: 1 },
      });
    });
  });

  it('emits error event when network fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);

    render(<StarRewritePanel resume={resume} matchReport={matchReport} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始改写/ }));
    });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          data: expect.objectContaining({ message: 'boom' }),
        }),
      );
    });
  });
});
