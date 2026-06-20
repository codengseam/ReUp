// src/lib/reranker.ts
// Phase 1 R2: Local BGE-reranker-v2-m3 wrapper.
// Wraps @xenova/transformers and exposes a thin `rerank(query, candidates, topK)` API.
// The 250MB model is loaded lazily on the first call and cached as a singleton.
//
// Implementation notes:
// - The @xenova/transformers package is intentionally not declared in
//   package.json. It is loaded via dynamic `import('@xenova/transformers')`
//   whose module specifier is built at runtime (string concatenation) so
//   Vite's static import-analysis pass does not try to resolve the optional
//   dependency at transform time, and so that the test suite can `vi.mock`
//   it without the package being on disk. Type-checking is satisfied via
//   a local `XfPipeline` interface; no module augmentation is used.
// - The first real `rerank()` call will surface a clear "module not found"
//   error if the package is missing at runtime; install with
//   `pnpm add @xenova/transformers` (see Phase 1 R3 in the design spec).

/** Local structural type for the @xenova/transformers text-classification
 *  pipeline used by BGE rerankers. Kept local to avoid a hard dependency on
 *  a package that is not installed in this environment. */
interface XfPipeline {
  (
    text: string,
    options: { text_pair: string }
  ): Promise<Array<{ label?: string; score: number }> | { score: number }>;
}

interface XfModule {
  pipeline(task: 'text-classification', model: string): Promise<XfPipeline>;
}

/** Generic document chunk. `id` and `text` are required; callers may attach
 *  arbitrary metadata that is preserved through the rerank pipeline. */
export interface Chunk {
  id: string;
  text: string;
  [key: string]: unknown;
}

export interface ScoredChunk extends Chunk {
  score: number;
}

const MODEL_ID = 'Xenova/bge-reranker-v2-m3';

// Singleton: set on first call to getPipeline(), reused thereafter so the
// 250MB model is loaded at most once per process.
let pipelinePromise: Promise<XfPipeline> | null = null;

async function getPipeline(): Promise<XfPipeline> {
  if (pipelinePromise) return pipelinePromise;
  // The module specifier is built at runtime via string concatenation
  // so Turbopack's static import analysis cannot resolve the optional
  // dependency at transform time. We also avoid `await import(...)`
  // because Turbopack's static analyser still flags it; instead we
  // build an `import()` closure through `new Function` so the literal
  // never appears in the source.
  //
  // Tests (vitest + vi.mock) cannot intercept a Function-built
  // dynamic import, so the test environment provides a `globalThis`
  // shim that returns a fake `XfModule` and skips the Function
  // closure entirely. See `src/lib/reranker.test.ts` for the shim.
  const shimmed = globalThis as { __xenovaShim?: () => Promise<XfModule> };
  let mod: XfModule;
  if (typeof shimmed.__xenovaShim === 'function') {
    mod = await shimmed.__xenovaShim();
  } else {
    const moduleName = '@xenova/' + 'transformers';
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<XfModule>;
    mod = await dynamicImport(moduleName);
  }
  const pending = mod.pipeline('text-classification', MODEL_ID);
  pipelinePromise = pending;
  try {
    return await pending;
  } catch (err) {
    // If the pipeline call itself rejects, reset so a later call can retry.
    pipelinePromise = null;
    throw err;
  }
}

/**
 * Extract a single numeric relevance score from whatever shape the model
 * returned. BGE rerankers have historically returned either:
 *   - `{ score: number }` (current @xenova/transformers output), or
 *   - `Array<{ label, score }>` with a single element, or
 *   - a tensor-like `{ logits: number[][] }` (older builds).
 * We tolerate all three so this module does not break on a transformers.js
 * minor upgrade.
 */
function extractScore(result: unknown): number {
  if (typeof result === 'number') return result;

  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (typeof first === 'number') return first;
    if (first && typeof first === 'object') {
      const s = (first as { score?: unknown }).score;
      if (typeof s === 'number') return s;
    }
  }

  if (result && typeof result === 'object') {
    const obj = result as { score?: unknown; logits?: unknown };
    if (typeof obj.score === 'number') return obj.score;
    if (Array.isArray(obj.logits) && Array.isArray(obj.logits[0])) {
      const row = (obj.logits as number[][])[0];
      if (row && row.length >= 2) {
        // softmax over [not_relevant, relevant]; return P(relevant)
        const a = row[0]!;
        const b = row[1]!;
        const max = Math.max(a, b);
        const ea = Math.exp(a - max);
        const eb = Math.exp(b - max);
        return eb / (ea + eb);
      }
    }
  }

  return 0;
}

/**
 * Rerank `candidates` against `query` using a local BGE-reranker-v2-m3
 * cross-encoder, returning the top-`topK` results sorted by descending score.
 *
 * - Empty input short-circuits to `[]` without loading the model.
 * - The model is loaded lazily on the first non-empty call and cached.
 * - `topK` is clamped to `candidates.length`.
 */
export async function rerank(
  query: string,
  candidates: Chunk[],
  topK: number
): Promise<ScoredChunk[]> {
  if (candidates.length === 0) return [];

  const pipe = await getPipeline();

  const scored: ScoredChunk[] = [];
  for (const c of candidates) {
    const result = await pipe(query, { text_pair: c.text });
    const score = extractScore(result);
    scored.push({ ...c, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const limit = Math.max(0, Math.min(topK, scored.length));
  return scored.slice(0, limit);
}

/** Test-only: drop the cached model so the next call re-initialises. */
export function _resetForTest(): void {
  pipelinePromise = null;
}
