// src/lib/resume/privacy.test.ts
// ReUp v2 Phase 5 (G3): privacy mode toggle tests.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { isPrivacyMode, setPrivacyMode, STORAGE_KEY } from './privacy';

// ---------------------------------------------------------------------------
// In-memory localStorage mock
// ---------------------------------------------------------------------------

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  };
}

const fakeStorage = createMemoryStorage();
const ORIGINAL_ENV = process.env.NEXT_PUBLIC_PRIVACY_MODE;

beforeEach(() => {
  fakeStorage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage,
    configurable: true,
    writable: true,
  });
  delete process.env.NEXT_PUBLIC_PRIVACY_MODE;
});

afterEach(() => {
  // Restore real localStorage so the next test file starts clean.
  if (typeof globalThis.localStorage !== 'undefined') {
    // jsdom ships a real Storage instance; if our fake is still attached,
    // replace it with a fresh jsdom-style one via Object.defineProperty.
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }
  if (ORIGINAL_ENV === undefined) {
    delete process.env.NEXT_PUBLIC_PRIVACY_MODE;
  } else {
    process.env.NEXT_PUBLIC_PRIVACY_MODE = ORIGINAL_ENV;
  }
});

// ---------------------------------------------------------------------------
// isPrivacyMode
// ---------------------------------------------------------------------------

describe('isPrivacyMode', () => {
  it('returns false by default (no env, no localStorage)', () => {
    expect(isPrivacyMode()).toBe(false);
  });

  it('returns true when localStorage holds "local-only"', () => {
    fakeStorage.setItem(STORAGE_KEY, 'local-only');
    expect(isPrivacyMode()).toBe(true);
  });

  it('returns false for any non-"local-only" stored value', () => {
    fakeStorage.setItem(STORAGE_KEY, 'cloud-ok');
    expect(isPrivacyMode()).toBe(false);
  });

  it('returns true when the deploy env var is "local-only"', async () => {
    process.env.NEXT_PUBLIC_PRIVACY_MODE = 'local-only';
    vi.resetModules();
    const mod = await import('./privacy');
    expect(mod.isPrivacyMode()).toBe(true);
  });

  it('env var takes precedence (off, but env says on → on)', () => {
    process.env.NEXT_PUBLIC_PRIVACY_MODE = 'local-only';
    expect(isPrivacyMode()).toBe(true);
  });

  it('is SSR-safe: returns false when localStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('./privacy');
    expect(mod.isPrivacyMode()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setPrivacyMode
// ---------------------------------------------------------------------------

describe('setPrivacyMode', () => {
  it('writes "local-only" when enabled', () => {
    setPrivacyMode(true);
    expect(fakeStorage.getItem(STORAGE_KEY)).toBe('local-only');
  });

  it('removes the key when disabled', () => {
    fakeStorage.setItem(STORAGE_KEY, 'local-only');
    setPrivacyMode(false);
    expect(fakeStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('is a no-op when localStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('./privacy');
    expect(() => {
      mod.setPrivacyMode(true);
      mod.setPrivacyMode(false);
    }).not.toThrow();
  });
});
