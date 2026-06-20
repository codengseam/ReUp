// src/lib/embedder.test.ts
// Phase 1.5: Vitest unit tests for src/lib/embedder.ts (BGE-M3 local embedder).
//
// Mirrors the shim pattern from src/lib/reranker.test.ts: production
// embedder loads `@xenova/transformers` via a Function-built closure
// `new Function('m', 'return import(m)')` so Turbopack's static import
// analyser cannot resolve the optional dependency. Vitest's `vi.mock`
// cannot intercept a Function-built import, so tests install
// `globalThis.__xenovaShim` and the production code checks for it
// before falling through to the closure. We delete the shim in
// `afterEach` and reset the module cache in `beforeEach` so the
// pipeline singleton is rebuilt for every test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPipeline, mockReset } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
  mockReset: vi.fn(),
}));

interface ShimGlobal {
  __xenovaShim?: () => Promise<{
    pipeline: (task: 'feature-extraction', model: string) => Promise<unknown>;
  }>;
}

beforeEach(() => {
  (globalThis as unknown as ShimGlobal).__xenovaShim = async () => ({
    pipeline: mockPipeline,
  });
});

afterEach(() => {
  delete (globalThis as unknown as ShimGlobal).__xenovaShim;
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env.BGE_M3_DIM;
});

interface FakeTensor {
  data: Float32Array;
  dims?: number[];
  tolist?: () => number[][];
}

/** Build a fake pipeline that returns a flat Float32Array of length `dim`
 *  whose values are `0.1 * (i % 10) + 0.0…`. */
function makeFakePipeline(dim: number): (text: string, opts: unknown) => Promise<FakeTensor> {
  return async (text: string, _opts: unknown) => {
    void text;
    const data = new Float32Array(dim);
    for (let i = 0; i < dim; i++) data[i] = ((i % 10) + 1) / 10;
    return { data, dims: [1, dim] };
  };
}

describe('embedder', () => {
  beforeEach(() => {
    mockPipeline.mockReset();
    mockReset.mockReset();
    // Default: pipeline() returns the inner pipeline function (mirrors real
    // @xenova/transformers behaviour where pipeline() is called once and
    // returns a callable).
    mockPipeline.mockImplementation(async () => makeFakePipeline(1024));
  });

  it('embed(text) returns a 1024-dim Float32-like number array via shim', async () => {
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('hello world');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1024);
    for (const v of result) {
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('embed(empty string) returns a 1024-dim zero vector (no throw)', async () => {
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('');
    expect(result).toHaveLength(1024);
    for (const v of result) {
      expect(v).toBe(0);
    }
    // Model must NOT be loaded for empty input.
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('embed(whitespace-only) returns a 1024-dim zero vector', async () => {
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('   \n\t  ');
    expect(result).toHaveLength(1024);
    for (const v of result) {
      expect(v).toBe(0);
    }
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('embed pipeline error → throws EmbedderError', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(async () => {
      throw new Error('boom');
    });
    const { createEmbedder, EmbedderError } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    await expect(embedder.embed('some text')).rejects.toBeInstanceOf(EmbedderError);
  });

  it('embed respects MODEL_DIM env override (default 1024)', async () => {
    // shim returns an 8-dim vector; no env override → result padded to 1024
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(async () => makeFakePipeline(8));
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('short');
    expect(result).toHaveLength(1024);
  });

  it('embed respects BGE_M3_DIM env override (custom dim)', async () => {
    process.env.BGE_M3_DIM = '8';
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(async () => makeFakePipeline(8));
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('short');
    expect(result).toHaveLength(8);
  });

  it('embed(config.dim) overrides default dim', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(async () => makeFakePipeline(16));
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder({ dim: 16 });
    const result = await embedder.embed('something');
    expect(result).toHaveLength(16);
  });

  it('isReady() flips to true after first successful embed', async () => {
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    expect(embedder.isReady()).toBe(false);
    await embedder.embed('first call');
    expect(embedder.isReady()).toBe(true);
  });

  it('isReady() stays false when only empty inputs were seen', async () => {
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    await embedder.embed('');
    await embedder.embed('   ');
    expect(embedder.isReady()).toBe(false);
  });

  it('caches the pipeline across calls (singleton)', async () => {
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    await embedder.embed('first');
    await embedder.embed('second');
    await embedder.embed('third');
    // pipeline() called once (to create the inner callable), inner callable
    // called 3 times. We assert that pipeline() is called only once.
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('handles plain-array output (no tolist, no dims)', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(
      async () =>
        async (text: string, _opts: unknown) => {
          void text;
          const arr = new Array(1024).fill(0).map((_, i) => ((i % 5) + 1) / 10);
          return arr;
        }
    );
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('plain array');
    expect(result).toHaveLength(1024);
    expect(result[0]).toBeCloseTo(0.1, 5);
  });

  it('handles {data: number[]} output shape', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(
      async () =>
        async (text: string, _opts: unknown) => {
          void text;
          const data = new Array(1024).fill(0).map((_, i) => ((i % 7) + 1) / 10);
          return { data };
        }
    );
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('data shape');
    expect(result).toHaveLength(1024);
    expect(result[0]).toBeCloseTo(0.1, 5);
  });

  it('handles tolist() output (nested array)', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(
      async () =>
        async (text: string, _opts: unknown) => {
          void text;
          const inner = new Array(1024).fill(0).map((_, i) => ((i % 11) + 1) / 10);
          return {
            data: new Float32Array(inner),
            dims: [1, 1024],
            tolist: () => [inner],
          };
        }
    );
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('tolist');
    expect(result).toHaveLength(1024);
    expect(typeof result[0]).toBe('number');
  });

  it('truncates over-dim tensor output to configured dim', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(async () => makeFakePipeline(2048));
    const { createEmbedder } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    const result = await embedder.embed('over-dim');
    expect(result).toHaveLength(1024);
  });

  it('throws EmbedderError when pipeline returns an empty tensor', async () => {
    mockPipeline.mockReset();
    mockPipeline.mockImplementation(
      async () =>
        async (text: string, _opts: unknown) => {
          void text;
          return { data: new Float32Array(0), dims: [1, 0] };
        }
    );
    const { createEmbedder, EmbedderError } = await import('@/lib/embedder');
    const embedder = createEmbedder();
    await expect(embedder.embed('empty tensor')).rejects.toBeInstanceOf(EmbedderError);
  });
});
