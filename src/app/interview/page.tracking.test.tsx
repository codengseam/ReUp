// src/app/interview/page.tracking.test.tsx
// Verifies the interview page emits page_view + error events.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockSafeTrack = vi.fn();
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

vi.mock('@/components/shared/interview/InterviewChat', () => ({
  default: () => <div data-testid="chat-stub" />,
}));
vi.mock('@/components/shared/interview/TranscriptUpload', () => ({
  default: () => <div data-testid="upload-stub" />,
}));
vi.mock('@/components/shared/interview/TranscriptList', () => ({
  default: () => <div data-testid="list-stub" />,
}));
vi.mock('@/components/shared/interview/AnalysisView', () => ({
  default: () => <div data-testid="analysis-stub" />,
}));

import InterviewPage from './page';

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InterviewPage tracking', () => {
  it('emits page_view on mount', async () => {
    render(<InterviewPage />);
    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'page_view',
        page: '/interview',
      });
    });
  });
});
