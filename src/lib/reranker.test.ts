// src/lib/reranker.test.ts
// Phase 1 R1: Vitest unit tests for src/lib/reranker.ts.
// All tests use a mocked @xenova/transformers — no real model load.
//
// The production reranker loads `@xenova/transformers` via a runtime
// `new Function('m', 'return import(m)')` closure to defeat
// Turbopack's static import analyser (the package is intentionally
// not installed). Vitest's `vi.mock` cannot intercept a closure-built
// import, so the test shim installs `globalThis.__reupXenovaShim` —
// the production code checks for it before falling through to the
// Function closure. We delete the shim in `afterEach` so production
// code paths remain unchanged.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPipeline } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
}));

interface ShimGlobal {
  __reupXenovaShim?: () => Promise<{
    pipeline: (task: 'text-classification', model: string) => Promise<unknown>;
  }>;
}

beforeEach(() => {
  (globalThis as unknown as ShimGlobal).__reupXenovaShim = async () => ({
    pipeline: mockPipeline,
  });
});

afterEach(() => {
  delete (globalThis as unknown as ShimGlobal).__reupXenovaShim;
  vi.restoreAllMocks();
});

import { rerank, _resetForTest, type Chunk } from '@/lib/reranker';

// Fixed per-candidate score table; tests set up the mock to return these
// values for the corresponding `text_pair` strings (the candidate's `text`).
const SCORE_TABLE: Record<string, number> = {
  alpha: 0.1,
  bravo: 0.9,
  charlie: 0.5,
  delta: 0.3,
  echo: 0.7,
};

function makeMockPipeline(): (
  _query: string,
  options: { text_pair: string }
) => Promise<{ score: number }> {
  return async (_query, options) => {
    const score = SCORE_TABLE[options.text_pair];
    if (typeof score !== 'number') {
      throw new Error(`mock: no score for text_pair=${JSON.stringify(options.text_pair)}`);
    }
    return { score };
  };
}

function chunk(id: string): Chunk {
  return { id, text: id };
}

function chunks(...ids: string[]): Chunk[] {
  return ids.map(chunk);
}

describe('rerank()', () => {
  beforeEach(() => {
    _resetForTest();
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(makeMockPipeline() as never);
  });

  it('returns scored list in correct descending order', async () => {
    const result = await rerank('query', chunks('alpha', 'bravo', 'charlie', 'delta', 'echo'), 5);

    expect(result.map((r) => r.id)).toEqual(['bravo', 'echo', 'charlie', 'delta', 'alpha']);
    expect(result.map((r) => r.score)).toEqual([0.9, 0.7, 0.5, 0.3, 0.1]);
  });

  it('returns [] for empty candidates', async () => {
    const result = await rerank('query', [], 5);
    expect(result).toEqual([]);
    // Model must NOT be loaded for empty input.
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('returns the single candidate at top when only one is given', async () => {
    const result = await rerank('query', chunks('bravo'), 5);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('bravo');
    expect(result[0]?.score).toBe(0.9);
  });

  it('respects topK (5 candidates, topK=2 -> 2 results)', async () => {
    const result = await rerank('query', chunks('alpha', 'bravo', 'charlie', 'delta', 'echo'), 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['bravo', 'echo']);
  });

  it('triggers lazy model load on first call (model not yet loaded)', async () => {
    expect(mockPipeline).not.toHaveBeenCalled();
    await rerank('query', chunks('bravo'), 1);
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('caches the model after first call (second call does not re-init)', async () => {
    await rerank('query', chunks('alpha', 'bravo'), 2);
    await rerank('query', chunks('charlie', 'delta', 'echo'), 3);
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('returns scores as finite numbers (not NaN, not undefined)', async () => {
    const result = await rerank('query', chunks('alpha', 'bravo', 'charlie'), 3);
    for (const r of result) {
      expect(typeof r.score).toBe('number');
      expect(Number.isFinite(r.score)).toBe(true);
      expect(Number.isNaN(r.score)).toBe(false);
    }
  });

  it('preserves arbitrary metadata fields on the chunk', async () => {
    const withMeta: Chunk[] = [
      { id: 'a', text: 'alpha', category: 'promotion' },
      { id: 'b', text: 'bravo', category: 'interview' },
    ];
    const result = await rerank('query', withMeta, 2);
    expect(result[0]?.id).toBe('b');
    expect(result[0]?.category).toBe('interview');
  });

  it('handles model output shaped as Array<{score}> (legacy transformers.js builds)', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(
      (async (_q: string, opts: { text_pair: string }) => [
        { label: 'LABEL_1', score: SCORE_TABLE[opts.text_pair] ?? 0 },
      ]) as never
    );
    const result = await rerank('query', chunks('alpha', 'bravo'), 2);
    expect(result.map((r) => r.id)).toEqual(['bravo', 'alpha']);
    expect(result.map((r) => r.score)).toEqual([0.9, 0.1]);
  });

  it('handles model output shaped as {logits: number[][]} (older tensor builds)', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(
      (async (_q: string, opts: { text_pair: string }) => {
        const raw = SCORE_TABLE[opts.text_pair] ?? 0;
        // logits[0][1] (relevant) > logits[0][0] (not relevant) when score > 0.5
        const a = 1 - raw; // not_relevant
        const b = raw; // relevant
        return { logits: [[a, b]] };
      }) as never
    );
    const result = await rerank('query', chunks('alpha', 'bravo'), 2);
    // bravo (raw=0.9) > alpha (raw=0.1) -> bravo first
    expect(result[0]?.id).toBe('bravo');
    expect(result[0]?.score).toBeGreaterThan(0.5);
    expect(result[1]?.id).toBe('alpha');
    expect(result[1]?.score).toBeLessThan(0.5);
  });

  it('falls back to score=0 when the model output shape is unrecognised', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(
      (async () => ({ unexpected: 'shape' })) as never
    );
    const result = await rerank('query', chunks('alpha', 'bravo'), 2);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.score === 0)).toBe(true);
  });

  it('handles a raw-number model output (numeric path)', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(
      (async (_q: string, opts: { text_pair: string }) => SCORE_TABLE[opts.text_pair] ?? 0) as never
    );
    const result = await rerank('query', chunks('alpha', 'bravo'), 2);
    expect(result.map((r) => r.id)).toEqual(['bravo', 'alpha']);
    expect(result.map((r) => r.score)).toEqual([0.9, 0.1]);
  });

  it('handles an Array<number> model output (legacy numeric tensor)', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(
      (async (_q: string, opts: { text_pair: string }) => [SCORE_TABLE[opts.text_pair] ?? 0]) as never
    );
    const result = await rerank('query', chunks('alpha', 'bravo'), 2);
    expect(result.map((r) => r.id)).toEqual(['bravo', 'alpha']);
    expect(result.map((r) => r.score)).toEqual([0.9, 0.1]);
  });

  it('exposes _resetForTest() to clear the cached model', async () => {
    await rerank('query', chunks('alpha'), 1);
    expect(mockPipeline).toHaveBeenCalledTimes(1);
    _resetForTest();
    // After reset, the next call must re-invoke pipeline().
    mockPipeline.mockResolvedValue(makeMockPipeline() as never);
    await rerank('query', chunks('bravo'), 1);
    expect(mockPipeline).toHaveBeenCalledTimes(2);
  });
});
