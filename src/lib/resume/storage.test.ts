// src/lib/resume/storage.test.ts
// ReUp v2 Phase 5 (G1): localStorage persistence tests for ResumeDocument.
// All localStorage access is mocked so tests run in pure isolation.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveResume,
  loadResume,
  clearResume,
  listSavedResumes,
  STORAGE_PREFIX,
  type SavedResumeMeta,
} from './storage';
import type { ResumeDocument } from './types';

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

beforeEach(() => {
  fakeStorage.clear();
  // Install on the JSDOM window before each test.
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage,
    configurable: true,
    writable: true,
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    meta: {
      version: 'reup.v2.phase3',
      source: 'text',
      createdAt: '2026-06-14T00:00:00.000Z',
    },
    basic: { name: 'Ada Lovelace' },
    experience: [],
    projects: [],
    skills: ['TypeScript'],
    education: [],
    raw: 'raw input',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// saveResume
// ---------------------------------------------------------------------------

describe('saveResume', () => {
  it('writes the doc JSON to the default storage key', () => {
    const doc = makeDoc();
    saveResume(doc);
    const raw = fakeStorage.getItem(`${STORAGE_PREFIX}default`);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(doc);
  });

  it('writes to a user-scoped key when userId is provided', () => {
    const doc = makeDoc();
    saveResume(doc, 'alice');
    expect(fakeStorage.getItem(`${STORAGE_PREFIX}alice`)).not.toBeNull();
    // Default slot remains empty.
    expect(fakeStorage.getItem(`${STORAGE_PREFIX}default`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadResume
// ---------------------------------------------------------------------------

describe('loadResume', () => {
  it('returns the parsed ResumeDocument when present', () => {
    const doc = makeDoc({ basic: { name: 'Grace Hopper' } });
    fakeStorage.setItem(`${STORAGE_PREFIX}default`, JSON.stringify(doc));
    const loaded = loadResume();
    expect(loaded).toEqual(doc);
  });

  it('returns null when no data has been saved', () => {
    const loaded = loadResume();
    expect(loaded).toBeNull();
  });

  it('returns null and logs when the stored JSON is malformed', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakeStorage.setItem(`${STORAGE_PREFIX}default`, '{not json');
    const loaded = loadResume();
    expect(loaded).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// clearResume
// ---------------------------------------------------------------------------

describe('clearResume', () => {
  it('removes the default key', () => {
    fakeStorage.setItem(`${STORAGE_PREFIX}default`, JSON.stringify(makeDoc()));
    clearResume();
    expect(fakeStorage.getItem(`${STORAGE_PREFIX}default`)).toBeNull();
  });

  it('removes a user-scoped key', () => {
    fakeStorage.setItem(`${STORAGE_PREFIX}bob`, JSON.stringify(makeDoc()));
    clearResume('bob');
    expect(fakeStorage.getItem(`${STORAGE_PREFIX}bob`)).toBeNull();
  });

  it('is a no-op when the key is absent', () => {
    expect(() => {
      clearResume('ghost');
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listSavedResumes
// ---------------------------------------------------------------------------

describe('listSavedResumes', () => {
  it('returns an empty array when no resumes are saved', () => {
    expect(listSavedResumes()).toEqual([]);
  });

  it('returns meta entries for every reup:resume:* key', () => {
    const doc1 = makeDoc({ meta: { ...makeDoc().meta, createdAt: '2026-01-01T00:00:00.000Z' } });
    const doc2 = makeDoc({ meta: { ...makeDoc().meta, createdAt: '2026-02-02T00:00:00.000Z' } });
    fakeStorage.setItem(`${STORAGE_PREFIX}default`, JSON.stringify(doc1));
    fakeStorage.setItem(`${STORAGE_PREFIX}alice`, JSON.stringify(doc2));
    // Some other app key — should be ignored
    fakeStorage.setItem('reup:other', 'irrelevant');
    fakeStorage.setItem('not-reup:foo', 'irrelevant');

    const list = listSavedResumes();
    expect(list).toHaveLength(2);
    const ids = list.map((e: SavedResumeMeta) => e.id).sort();
    expect(ids).toEqual(['alice', 'default']);
    for (const entry of list) {
      expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('skips entries that fail to parse', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakeStorage.setItem(`${STORAGE_PREFIX}good`, JSON.stringify(makeDoc()));
    fakeStorage.setItem(`${STORAGE_PREFIX}bad`, '{not json');
    const list = listSavedResumes();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('good');
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SSR safety
// ---------------------------------------------------------------------------

describe('SSR safety', () => {
  it('loadResume returns null when localStorage is unavailable', async () => {
    // Replace the module-level storage reference via a fresh import.
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
    });
    const mod = await import('./storage');
    expect(mod.loadResume()).toBeNull();
  });

  it('saveResume is a no-op when localStorage is unavailable', async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
    });
    const mod = await import('./storage');
    expect(() => {
      mod.saveResume(makeDoc());
    }).not.toThrow();
  });

  it('listSavedResumes returns [] when localStorage is unavailable', async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
    });
    const mod = await import('./storage');
    expect(mod.listSavedResumes()).toEqual([]);
  });
});
