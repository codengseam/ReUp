// src/app/resume/page.tracking.test.tsx
// Verifies the resume page emits a page_view event on mount.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockSafeTrack = vi.fn();
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

// Stub the heavy analyzer so the page can mount cheaply.
vi.mock('@/components/shared/resume/ResumeAnalyzer', () => ({
  ResumeAnalyzer: () => <div data-testid="analyzer-stub" />,
}));

import ResumePage from './page';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ResumePage tracking', () => {
  it('emits page_view on mount', async () => {
    render(<ResumePage />);
    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({ type: 'page_view', page: '/resume' });
    });
  });
});
