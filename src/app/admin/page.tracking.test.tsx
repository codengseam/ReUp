// src/app/admin/page.tracking.test.tsx
// Verifies the admin page emits page_view on mount.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockSafeTrack = vi.fn();
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

// Stub the heavy tab components.
vi.mock('./_components/dashboard-tab', () => ({ default: () => null }));
vi.mock('./_components/knowledge-tab', () => ({ default: () => null }));
vi.mock('./_components/framework-skills-tab', () => ({ default: () => null }));
vi.mock('./_components/prompt-tab', () => ({ default: () => null }));
vi.mock('./_components/model-tab', () => ({ default: () => null }));
vi.mock('./_components/rag-tab', () => ({ default: () => null }));
vi.mock('./_components/metadata-tab', () => ({ default: () => null }));
vi.mock('./_components/analytics-tab', () => ({ default: () => null }));
vi.mock('./_components/runtime-config-tab', () => ({ default: () => null }));

import AdminPage from './page';

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminPage tracking', () => {
  it('emits page_view on mount', async () => {
    // Default unauthenticated: the page will show a login form.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configured: true, authenticated: false }),
    }));
    render(<AdminPage />);
    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'page_view',
        page: '/admin',
      });
    });
  });
});
