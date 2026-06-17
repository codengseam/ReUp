// src/shared/utils/__tests__/analytics-helpers.test.ts
// Tests for safeTrack + getSessionId helpers

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeTrack, getSessionId } from '../analytics-helpers';

const mockTrack = vi.fn();

vi.mock('../analytics', () => ({
  track: (event: unknown) => mockTrack(event),
}));

const sessionStorageStore = new Map<string, string>();
const mockSessionStorage = {
  getItem: vi.fn((key: string) => sessionStorageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageStore.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    sessionStorageStore.delete(key);
  }),
  clear: vi.fn(() => {
    sessionStorageStore.clear();
  }),
};

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorageStore.clear();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
    configurable: true,
  });
});

describe('safeTrack', () => {
  it('forwards the event to the SDK track function', () => {
    safeTrack({ type: 'page_view', page: '/foo' });
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith({ type: 'page_view', page: '/foo' });
  });

  it('does not throw if track itself throws', () => {
    mockTrack.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => safeTrack({ type: 'page_view', page: '/foo' })).not.toThrow();
  });

  it('preserves all 10 event types from the SDK type union', () => {
    // A defensive smoke test ensuring the wrapper doesn't strip
    // typed payload fields.
    const events = [
      { type: 'page_view', page: '/p' },
      { type: 'resume_upload', data: { format: 'pdf', fileSize: 1024 } },
      { type: 'jd_parse', data: { source: 'paste' } },
      { type: 'match_analysis', data: { score: 80 } },
      { type: 'star_rewrite', data: { sectionCount: 3 } },
      { type: 'interview_coach_start', data: { hasJd: true } },
      { type: 'interview_coach_end', data: { messageCount: 5 } },
      { type: 'transcript_upload', data: { source: 'text' } },
      { type: 'export', data: { format: 'pdf' } },
      { type: 'error', data: { message: 'oops' } },
    ] as const;
    for (const event of events) {
      safeTrack(event);
    }
    expect(mockTrack).toHaveBeenCalledTimes(10);
  });
});

describe('getSessionId', () => {
  it('returns an empty string when sessionStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(getSessionId()).toBe('');
  });

  it('lazily creates a session id and reuses it', () => {
    const id1 = getSessionId();
    const id2 = getSessionId();
    expect(id1).toBeTruthy();
    expect(id1).toBe(id2);
    expect(mockSessionStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
