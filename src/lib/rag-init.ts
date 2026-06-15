// src/lib/rag-init.ts
// ReUp v2 Phase 1.5: lazy load + memoize the pre-bundled vector index
// (`data/skill-vectors.json`) so any caller that needs to run a search gets
// a ready-to-use `VectorStore`.
//
// Design (spec §5.2):
// - `ensureVectorStoreLoaded()` returns a `Promise<VectorStore>` resolved
//   with a `VectorStore` whose internal `Float32Array` index is built.
// - The first call performs the file load; subsequent calls return the
//   same instance (memoized). Concurrent calls share the same in-flight
//   promise, so the file is read at most once per process.
// - The path is read from `process.env.REUP_VECTORS_PATH` if set,
//   otherwise `data/skill-vectors.json` under `process.cwd()`.
// - If the load fails the memo is cleared so a later call can retry.

import path from 'path';
import { createVectorStore, type VectorStore } from './vector-store';

const DEFAULT_VECTORS_FILE = 'data/skill-vectors.json';

function resolveVectorsPath(): string {
  const override = process.env.REUP_VECTORS_PATH;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override;
  }
  return path.join(process.cwd(), DEFAULT_VECTORS_FILE);
}

let memoized: Promise<VectorStore> | null = null;

/** Get (or create) a loaded `VectorStore`. Memoized: the file is read at
 *  most once per process. Concurrent callers receive the same in-flight
 *  promise so the underlying file is parsed only once. */
export async function ensureVectorStoreLoaded(): Promise<VectorStore> {
  if (memoized) return memoized;
  const promise = (async () => {
    const store = createVectorStore();
    await store.load(resolveVectorsPath());
    return store;
  })();
  memoized = promise;
  // Clear memo on failure so the next caller can retry.
  promise.catch(() => {
    if (memoized === promise) memoized = null;
  });
  return promise;
}

/** Test-only: drop the cached store so the next call re-loads. */
export function _resetForTest(): void {
  memoized = null;
}
