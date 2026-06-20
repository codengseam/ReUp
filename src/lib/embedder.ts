// src/lib/embedder.ts
// Local BGE-M3 embedder wrapper.
//
// Replaces the deterministic hash-based pseudo-vector embedder previously
// used in `src/lib/rag/search.ts` with a real dense embedding via
// @xenova/transformers. BGE-M3 outputs 1024-dim vectors and matches the
// pre-bundled `data/skill-vectors.json` cosine store.
//
// Implementation notes (mirror src/lib/reranker.ts):
// - The @xenova/transformers package is intentionally not declared in
//   package.json. It is loaded via dynamic `import('@xenova/transformers')`
//   whose module specifier is built at runtime (string concatenation) so
//   Vite/Turbopack's static import-analysis pass does not try to resolve
//   the optional dependency at transform time. Type-checking is satisfied
//   via a local `XfFeaturePipeline` interface; no module augmentation is
//   used.
// - The first real `embed()` call will surface a clear "module not found"
//   error if the package is missing at runtime; install with
//   `pnpm add @xenova/transformers` (see Phase 1 R3 in the design spec).
// - The pipeline is cached as a module-level singleton; the model is loaded
//   lazily on the first non-empty call. Empty / whitespace-only input
// short-circuits to a zero vector without loading the model.

import { getCached, setCache, type CacheEntry } from '@/lib/rag/cache';

/** Local structural type for the @xenova/transformers feature-extraction
 *  pipeline used by BGE-M3. Kept local to avoid a hard dependency on a
 *  package that is not installed in this environment. */
interface XfFeaturePipeline {
  (text: string, options: { pooling: 'mean'; normalize: true }): Promise<unknown>;
}

interface XfModule {
  pipeline(task: 'feature-extraction', model: string): Promise<XfFeaturePipeline>;
}

/** Default BGE-M3 output dimension. Matches `data/skill-vectors.json`. */
export const EMBEDDING_DIM = 1024;

/** Default model id served by @xenova/transformers' HF hub proxy. */
export const MODEL_ID = 'Xenova/bge-m3';

// In-process embedding cache: BGE-M3 inference is deterministic for the same
// input text, so repeated queries / chunks avoid reloading the model.
const embedCache = new Map<string, CacheEntry<number[]>>();
const EMBED_CACHE_TTL_MS = 30 * 60 * 1000;

function embedCacheKey(text: string): string {
  return text;
}

/** Thrown when the embedder fails to initialise or the model returns an
 *  unusable tensor. Callers should treat the request as a transient failure
 *  (the caller in `src/lib/rag/search.ts` already catches and falls back). */
export class EmbedderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EmbedderError';
  }
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  /** True if the underlying model has finished loading at least once. */
  isReady(): boolean;
}

export interface EmbedderConfig {
  /** Override model id (default 'Xenova/bge-m3'). */
  model?: string;
  /** Override output dim (default 1024, or BGE_M3_DIM env). Tests use this. */
  dim?: number;
}

// Singleton: set on first call to getPipeline(), reused thereafter so the
// ~2GB BGE-M3 model is loaded at most once per process.
let pipelinePromise: Promise<XfFeaturePipeline> | null = null;
let loadedDim: number | null = null;

async function getPipeline(modelId: string): Promise<XfFeaturePipeline> {
  if (pipelinePromise) return pipelinePromise;
  // The module specifier is built at runtime via string concatenation
  // so Turbopack's static import analysis cannot resolve the optional
  // dependency at transform time. We also avoid `await import(...)`
  // because Turbopack's static analyser still flags it; instead we
  // build an `import()` closure through `new Function` so the literal
  // never appears in the source.
  //
  // Tests (vitest + vi.mock) cannot intercept a Function-built dynamic
  // import, so the test environment provides a `globalThis` shim that
  // returns a fake `XfModule` and skips the Function closure entirely.
  // See `src/lib/embedder.test.ts` for the shim.
  const shimmed = globalThis as { __xenovaShim?: () => Promise<XfModule> };
  let mod: XfModule;
  if (typeof shimmed.__xenovaShim === 'function') {
    mod = await shimmed.__xenovaShim();
  } else {
    const moduleName = '@xenova/' + 'transformers';
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<XfModule>;
    mod = await dynamicImport(moduleName);
  }
  const pending = mod.pipeline('feature-extraction', modelId);
  pipelinePromise = pending;
  try {
    return await pending;
  } catch (err) {
    // If the pipeline call itself rejects, reset so a later call can retry.
    pipelinePromise = null;
    throw err;
  }
}

/** Read a numeric value out of whatever the @xenova/transformers
 *  feature-extraction pipeline returned. We tolerate three shapes:
 *    1. A plain JS array of numbers (length === dim).
 *    2. A `{ data: number[] | Float32Array }` object.
 *    3. A Tensor with `data: Float32Array` (and optional `tolist()` and `dims`).
 *  Returns `null` if no numeric series can be recovered. */
function readNumericSeries(raw: unknown): number[] | null {
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    // Nested [batch, dim] form.
    if (Array.isArray(raw[0])) {
      const inner = raw[0] as unknown[];
      if (inner.every((n) => typeof n === 'number')) {
        return inner as number[];
      }
    }
    if (raw.every((n) => typeof n === 'number')) {
      return raw as number[];
    }
  }

  if (typeof raw === 'object') {
    const obj = raw as {
      data?: unknown;
      tolist?: () => unknown;
      dims?: unknown;
    };

    // Tensor-like with tolist() — preferred path on real @xenova/transformers.
    if (typeof obj.tolist === 'function') {
      try {
        const listed = obj.tolist();
        if (Array.isArray(listed) && Array.isArray(listed[0])) {
          const inner = listed[0] as unknown[];
          if (inner.every((n) => typeof n === 'number')) {
            return inner as number[];
          }
        }
      } catch {
        // fall through to the data path
      }
    }

    if (obj.data != null) {
      const data = obj.data as { length: number } & Record<string, unknown>;
      if (typeof data.length === 'number' && data.length > 0) {
        const out: number[] = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
          out[i] = Number(data[i] as number);
        }
        return out;
      }
    }
  }

  return null;
}

/** Pad with zeros or truncate a numeric series to the target dimension. */
function fitDimension(vec: number[], dim: number): number[] {
  if (vec.length === dim) return vec;
  if (vec.length > dim) return vec.slice(0, dim);
  const padded = new Array<number>(dim).fill(0);
  for (let i = 0; i < vec.length; i++) padded[i] = vec[i] ?? 0;
  return padded;
}

function resolveDim(configDim: number | undefined): number {
  if (typeof configDim === 'number' && Number.isFinite(configDim) && configDim > 0) {
    return Math.floor(configDim);
  }
  const envRaw = process.env.BGE_M3_DIM;
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return EMBEDDING_DIM;
}

function resolveModelId(configModel: string | undefined): string {
  if (typeof configModel === 'string' && configModel.trim().length > 0) {
    return configModel;
  }
  return MODEL_ID;
}

/**
 * Build a thin `Embedder` instance backed by a lazily-loaded BGE-M3 model.
 *
 * - Empty / whitespace-only input short-circuits to a zero vector of length
 *   `dim` without loading the model.
 * - The model is loaded lazily on the first non-empty call and cached.
 * - Output is always padded / truncated to `dim` (default 1024).
 */
export function createEmbedder(config?: EmbedderConfig): Embedder {
  const dim = resolveDim(config?.dim);
  const modelId = resolveModelId(config?.model);
  let ready = false;

  return {
    async embed(text: string): Promise<number[]> {
      if (typeof text !== 'string' || text.trim().length === 0) {
        return new Array<number>(dim).fill(0);
      }

      const key = embedCacheKey(text);
      const cached = getCached(embedCache, key);
      if (cached) {
        return cached;
      }

      let pipe: XfFeaturePipeline;
      try {
        pipe = await getPipeline(modelId);
      } catch (err) {
        throw new EmbedderError(
          `embedder: failed to load pipeline: ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }
      let raw: unknown;
      try {
        raw = await pipe(text, { pooling: 'mean', normalize: true });
      } catch (err) {
        throw new EmbedderError(
          `embedder: pipeline inference failed: ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }

      const series = readNumericSeries(raw);
      if (!series || series.length === 0) {
        throw new EmbedderError('embedder: pipeline returned an empty tensor');
      }
      loadedDim = series.length;
      ready = true;
      const vector = fitDimension(series, dim);
      setCache(embedCache, key, vector, EMBED_CACHE_TTL_MS);
      return vector;
    },

    isReady(): boolean {
      return ready;
    },
  };
}

/** Test-only: drop the cached model and reset readiness so the next call
 *  re-initialises. Mirrors `_resetForTest` in src/lib/reranker.ts. */
export function _resetForTest(): void {
  pipelinePromise = null;
  loadedDim = null;
  embedCache.clear();
}

/** Test-only: read the dimension the loaded pipeline actually produced on
 *  the most recent call (before fitDimension padding/truncation). */
export function _lastLoadedDim(): number | null {
  return loadedDim;
}
