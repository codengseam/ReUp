// src/shared/utils/__tests__/analytics.test.ts
// Tests for frontend analytics SDK

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { track, type AnalyticsEvent } from '../analytics';

// Mock fetch
const mockFetch = vi.fn().mockResolvedValue({ ok: true });

// Mock sendBeacon
const mockSendBeaconImpl = vi.fn().mockReturnValue(true);

// Mock sessionStorage
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

// Capture last blob text sent via sendBeacon
let lastBlobText = '';

// Mock Blob to capture text content
class MockBlob {
  text: string;
  constructor(parts: BlobPart[]) {
    this.text = parts.join('');
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorageStore.clear();
  lastBlobText = '';

  // Mock Blob constructor
  Object.defineProperty(globalThis, 'Blob', {
    value: MockBlob,
    writable: true,
    configurable: true,
  });

  // Setup browser globals
  Object.defineProperty(globalThis, 'window', {
    value: {},
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      sendBeacon: vi.fn((_url: string, blob: { text: string }) => {
        lastBlobText = blob.text;
        return mockSendBeaconImpl();
      }),
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'fetch', {
    value: mockFetch,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
    configurable: true,
  });
});

function parseSentBody(): Record<string, unknown> {
  // Check sendBeacon first
  if (lastBlobText) {
    return JSON.parse(lastBlobText) as Record<string, unknown>;
  }
  // Check fetch fallback
  if (mockFetch.mock.calls.length > 0) {
    const body = mockFetch.mock.calls[0]?.[1]?.body as string | undefined;
    if (body) {
      return JSON.parse(body) as Record<string, unknown>;
    }
  }
  throw new Error('No payload sent');
}

describe('track', () => {
  it('sends page_view event via sendBeacon', () => {
    track({ type: 'page_view', page: '/resume' });

    const payload = parseSentBody();
    expect(mockSendBeaconImpl).toHaveBeenCalledTimes(1);
    expect(payload.events).toEqual([
      { type: 'page_view', page: '/resume' },
    ]);
    expect(payload.sessionId).toBeTruthy();
    expect(typeof payload.sessionId).toBe('string');
    expect(payload.timestamp).toBeTruthy();
  });

  it('sends resume_upload event with data', () => {
    track({ type: 'resume_upload', data: { format: 'pdf', fileSize: 1024 } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'resume_upload', data: { format: 'pdf', fileSize: 1024 } },
    ]);
  });

  it('sends jd_parse event with source', () => {
    track({ type: 'jd_parse', data: { source: 'paste' } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'jd_parse', data: { source: 'paste' } },
    ]);
  });

  it('sends match_analysis event with score', () => {
    track({ type: 'match_analysis', data: { score: 85 } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'match_analysis', data: { score: 85 } },
    ]);
  });

  it('sends star_rewrite event with sectionCount', () => {
    track({ type: 'star_rewrite', data: { sectionCount: 3 } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'star_rewrite', data: { sectionCount: 3 } },
    ]);
  });

  it('sends interview_coach_start event', () => {
    track({ type: 'interview_coach_start', data: { hasJd: true } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'interview_coach_start', data: { hasJd: true } },
    ]);
  });

  it('sends interview_coach_end event', () => {
    track({ type: 'interview_coach_end', data: { messageCount: 10 } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'interview_coach_end', data: { messageCount: 10 } },
    ]);
  });

  it('sends transcript_upload event', () => {
    track({ type: 'transcript_upload', data: { source: 'voice' } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'transcript_upload', data: { source: 'voice' } },
    ]);
  });

  it('sends export event', () => {
    track({ type: 'export', data: { format: 'pdf' } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'export', data: { format: 'pdf' } },
    ]);
  });

  it('sends error event', () => {
    track({ type: 'error', data: { message: 'test error', stack: 'Error: test\n  at foo' } });

    const payload = parseSentBody();
    expect(payload.events).toEqual([
      { type: 'error', data: { message: 'test error', stack: 'Error: test\n  at foo' } },
    ]);
  });

  it('posts to /api/analytics/track', () => {
    track({ type: 'page_view', page: '/home' });

    const nav = (globalThis as Record<string, unknown>).navigator as { sendBeacon: ReturnType<typeof vi.fn> };
    expect(nav.sendBeacon).toHaveBeenCalledWith(
      '/api/analytics/track',
      expect.any(Object),
    );
  });

  it('falls back to fetch when sendBeacon is unavailable', () => {
    // Remove sendBeacon
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    track({ type: 'page_view', page: '/home' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/analytics/track',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('falls back to fetch when sendBeacon returns false', () => {
    mockSendBeaconImpl.mockReturnValue(false);
    // Reset lastBlobText so we don't try to parse from sendBeacon
    lastBlobText = '';

    track({ type: 'page_view', page: '/home' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/analytics/track',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }),
    );
  });

  it('reuses the same sessionId across multiple calls', () => {
    track({ type: 'page_view', page: '/page1' });
    const payload1 = parseSentBody();
    const sessionId1 = payload1.sessionId as string;

    lastBlobText = '';

    track({ type: 'page_view', page: '/page2' });
    const payload2 = parseSentBody();
    const sessionId2 = payload2.sessionId as string;

    expect(sessionId1).toBe(sessionId2);
    expect(sessionId1).toBeTruthy();
  });

  it('is a no-op when window is undefined (SSR)', () => {
    // Remove window
    const originalWindow = (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).window;

    track({ type: 'page_view', page: '/ssr' });

    expect(mockSendBeaconImpl).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();

    // Restore
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it('silently handles errors from fetch', () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    // Should not throw
    expect(() => {
      track({ type: 'page_view', page: '/home' });
    }).not.toThrow();
  });
});