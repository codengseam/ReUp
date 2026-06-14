// src/lib/resume/privacy.ts
// ReUp v2 Phase 5 (G3): privacy mode toggle.
//
// Privacy mode ("local-only") is a deploy- or user-controlled flag that
// disables any cloud upload of the user's resume content. Two sources of
// truth are OR'd together:
//   1. The build-time / runtime env var `NEXT_PUBLIC_PRIVACY_MODE=local-only`
//      lets a deploy force privacy mode on (e.g. for an on-prem install).
//   2. A per-browser toggle in localStorage, so the user can opt in
//      without touching infra.
//
// All access is SSR-safe.

export const STORAGE_KEY = 'reup:privacy-mode';
export const PRIVACY_VALUE = 'local-only';

export type PrivacyMode = 'local-only' | 'cloud-ok';

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  const ls: unknown = (globalThis as { localStorage?: Storage }).localStorage;
  if (typeof ls === 'undefined' || ls === null) return null;
  return ls as Storage;
}

function readEnvFlag(): boolean {
  // `NEXT_PUBLIC_*` is inlined at build time, so this branch is reachable
  // both in the browser and in server components.
  const v = process.env.NEXT_PUBLIC_PRIVACY_MODE;
  return v === PRIVACY_VALUE;
}

/**
 * `true` when either the deploy env flag OR the localStorage toggle is set
 * to "local-only". False otherwise (including SSR with no localStorage).
 */
export function isPrivacyMode(): boolean {
  if (readEnvFlag()) return true;
  const ls = getStorage();
  if (!ls) return false;
  try {
    return ls.getItem(STORAGE_KEY) === PRIVACY_VALUE;
  } catch {
    return false;
  }
}

/**
 * Persist the user-facing toggle. The env flag is read-only and is not
 * affected by this call.
 */
export function setPrivacyMode(enabled: boolean): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    if (enabled) {
      ls.setItem(STORAGE_KEY, PRIVACY_VALUE);
    } else {
      ls.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.error('[resume/privacy] setPrivacyMode failed:', err);
  }
}
