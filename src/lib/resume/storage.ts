// src/lib/resume/storage.ts
// ReUp v2 Phase 5 (G1): localStorage persistence for the parsed ResumeDocument.
//
// Design notes:
//  - All functions are SSR-safe: when `localStorage` is not defined
//    (e.g. during server rendering or unit tests in a Node-only env),
//    they return null / no-op rather than throwing.
//  - The key prefix is namespaced as `reup:resume:<userId>` so multiple
//    users on the same browser (or future named profiles) can coexist
//    without collision and so unrelated localStorage keys are ignored.
//  - Malformed JSON does not throw — we log and return null so the UI can
//    fall back to "no saved resume" rather than crash.

import type { ResumeDocument } from './types';

export const STORAGE_PREFIX = 'reup:resume:';
const DEFAULT_USER = 'default';

function buildKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  // `localStorage` is not always typed on `globalThis`; narrow at runtime.
  const ls: unknown = (globalThis as { localStorage?: Storage }).localStorage;
  if (typeof ls === 'undefined' || ls === null) return null;
  return ls as Storage;
}

/**
 * Persist a parsed resume under `reup:resume:<userId>`. No-op on the server.
 */
export function saveResume(doc: ResumeDocument, userId: string = DEFAULT_USER): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(buildKey(userId), JSON.stringify(doc));
  } catch (err) {
    // Quota exceeded, private mode, etc. — don't break the UI.
    console.error('[resume/storage] saveResume failed:', err);
  }
}

/**
 * Load a previously-saved resume, or `null` if none exists / data is corrupt.
 */
export function loadResume(userId: string = DEFAULT_USER): ResumeDocument | null {
  const ls = getStorage();
  if (!ls) return null;
  const raw = ls.getItem(buildKey(userId));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'meta' in parsed) {
      return parsed as ResumeDocument;
    }
    console.error('[resume/storage] loadResume: stored value is not a ResumeDocument');
    return null;
  } catch (err) {
    console.error('[resume/storage] loadResume: malformed JSON', err);
    return null;
  }
}

/**
 * Remove the saved resume for a given user (default: `default`).
 */
export function clearResume(userId: string = DEFAULT_USER): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.removeItem(buildKey(userId));
  } catch (err) {
    console.error('[resume/storage] clearResume failed:', err);
  }
}

/** Lightweight metadata about a saved resume (for listings). */
export interface SavedResumeMeta {
  id: string;
  createdAt: string;
  name?: string;
}

/**
 * List metadata for every saved resume currently in localStorage.
 * Entries with malformed JSON are silently skipped (with a console.error).
 */
export function listSavedResumes(): SavedResumeMeta[] {
  const ls = getStorage();
  if (!ls) return [];
  const out: SavedResumeMeta[] = [];
  for (let i = 0; i < ls.length; i += 1) {
    const key = ls.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    const id = key.slice(STORAGE_PREFIX.length);
    const raw = ls.getItem(key);
    if (raw === null) continue;
    try {
      const doc = JSON.parse(raw) as Partial<ResumeDocument>;
      const meta: SavedResumeMeta = {
        id,
        createdAt: doc.meta?.createdAt ?? '',
        name: doc.basic?.name,
      };
      out.push(meta);
    } catch (err) {
      console.error('[resume/storage] listSavedResumes: skipping malformed entry', key, err);
    }
  }
  return out;
}
