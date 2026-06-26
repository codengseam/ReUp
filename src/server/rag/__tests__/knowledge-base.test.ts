// src/lib/knowledge-base.test.ts
// ReUp v2 Phase 1, K1-K2: knowledge-base unit tests with mocked dependencies.
// All tests mock the vector-store and reranker modules; no real data, no real model.
//
// TDD: tests written before implementation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VectorStore, SearchResult, SearchOptions } from '../vector-store';
import type { Chunk, ScoredChunk } from '../reranker';

// ---------------- Mocks (hoisted before imports) ----------------

const { mockSearch, mockEnsureVectorStoreLoaded } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockEnsureVectorStoreLoaded: vi.fn(),
}));

vi.mock('../rag-init', () => ({
  ensureVectorStoreLoaded: mockEnsureVectorStoreLoaded,
  _resetForTest: vi.fn(),
}));

const { mockRerank } = vi.hoisted(() => ({
  mockRerank: vi.fn(),
}));

vi.mock('../reranker', () => ({
  rerank: mockRerank,
}));

// The reranker loads @xenova/transformers via a runtime Function closure;
// vi.mock cannot intercept that. Provide a global shim so tests that
// accidentally hit the real reranker do not fail with "dynamic import callback".
interface ShimGlobal {
  __reupXenovaShim?: () => Promise<{
    pipeline: (task: 'text-classification', model: string) => Promise<unknown>;
  }>;
}

beforeEach(() => {
  (globalThis as unknown as ShimGlobal).__reupXenovaShim = async () => ({
    pipeline: vi.fn().mockResolvedValue({ score: 0.5 }),
  });
});

afterEach(() => {
  delete (globalThis as unknown as ShimGlobal).__reupXenovaShim;
});

// ---------------- Imports (must come after vi.mock) ----------------

import { createKnowledgeBase } from '../knowledge-base';
import type { KnowledgeBaseConfig, SemanticSearchOptions } from '../knowledge-base';

// ---------------- Helpers ----------------

function makeResult(
  id: string,
  score: number,
  text: string = `text-${id}`,
  metadata: Record<string, unknown> = {}
): SearchResult {
  return { id, score, text, metadata };
}

function makeScoredChunk(
  id: string,
  score: number,
  text: string = `text-${id}`,
  extra: Record<string, unknown> = {}
): ScoredChunk {
  return { id, text, score, ...extra };
}

function setupStore(): void {
  mockEnsureVectorStoreLoaded.mockReset();
  mockEnsureVectorStoreLoaded.mockResolvedValue({ search: mockSearch } as unknown as VectorStore);
}

function setupRerank(): void {
  mockRerank.mockReset();
  mockRerank.mockResolvedValue([]);
}

// ===================================================================
// config validation
// ===================================================================

describe('knowledge-base: config validation', () => {
  beforeEach(() => {
    setupStore();
    setupRerank();
  });

  it('throws a clear error when config is missing', () => {
    expect(() =>
      createKnowledgeBase(undefined as unknown as KnowledgeBaseConfig)
    ).toThrow(/embed is required/);
  });

  it('throws a clear error when embed is missing', () => {
    expect(() => createKnowledgeBase({} as KnowledgeBaseConfig)).toThrow(/embed is required/);
  });

  it('throws a clear error when embed is not a function', () => {
    expect(() =>
      createKnowledgeBase({
        embed: 'not-a-fn' as unknown as (text: string) => Promise<number[]>,
      })
    ).toThrow(/embed is required/);
  });
});

// ===================================================================
// semanticSearch()
// ===================================================================

describe('knowledge-base: semanticSearch()', () => {
  beforeEach(() => {
    setupStore();
    setupRerank();
    mockSearch.mockReset();
  });

  it('calls embed() exactly once with the raw query', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });
    await kb.semanticSearch('hello world', 5);

    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith('hello world');
  });

  it('calls vector-store.search() with the embedded vector and topK * 3', async () => {
    const queryVec = [0.1, 0.2, 0.3];
    const embed = vi.fn().mockResolvedValue(queryVec);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });
    await kb.semanticSearch('q', 5);

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith(queryVec, 15, expect.any(Object));
  });

  it('returns top-K after rerank (mock rerank returns 5 from 15 input)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const candidates: SearchResult[] = Array.from({ length: 15 }, (_, i) =>
      makeResult(`cand-${i}`, 0.9 - i * 0.05)
    );
    mockSearch.mockReturnValue(candidates);

    // Override the default rerank to return only 5 results
    const rerankResult: ScoredChunk[] = Array.from({ length: 5 }, (_, i) =>
      makeScoredChunk(`r-${i}`, 0.99 - i * 0.01)
    );
    mockRerank.mockResolvedValueOnce(rerankResult);

    const kb = createKnowledgeBase({ embed });
    const result = await kb.semanticSearch('q', 5);

    expect(result).toHaveLength(5);
    expect(result).toEqual(rerankResult);

    // Rerank must have been called with the query and the 15 candidates
    expect(mockRerank).toHaveBeenCalledTimes(1);
    const rerankCall = mockRerank.mock.calls[0]!;
    expect(rerankCall[0]).toBe('q');
    expect(rerankCall[2]).toBe(5);
    const rerankCandidates = rerankCall[1] as Chunk[];
    expect(rerankCandidates).toHaveLength(15);
    expect(rerankCandidates[0]).toMatchObject({ id: 'cand-0' });
    expect(rerankCandidates[14]).toMatchObject({ id: 'cand-14' });
  });

  it('returns top-K without rerank when opts.skipRerank=true (skip rerank call)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const candidates: SearchResult[] = Array.from({ length: 15 }, (_, i) =>
      makeResult(`cand-${i}`, 0.9 - i * 0.05, `text-${i}`)
    );
    mockSearch.mockReturnValue(candidates);

    const kb = createKnowledgeBase({ embed, rerank: mockRerank });
    const result = await kb.semanticSearch('q', 5, { skipRerank: true });

    expect(mockRerank).not.toHaveBeenCalled();
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual(['cand-0', 'cand-1', 'cand-2', 'cand-3', 'cand-4']);
    expect(result[0]).toEqual({
      id: 'cand-0',
      text: 'text-0',
      score: 0.9,
    });
  });

  it('passes through category=promotion to vector-store', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });
    await kb.semanticSearch('q', 5, { category: 'promotion' });

    const callOpts = mockSearch.mock.calls[0]![2] as SearchOptions;
    expect(callOpts.category).toBe('promotion');
  });

  it('passes through category=interview to vector-store', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });
    await kb.semanticSearch('q', 5, { category: 'interview' });

    const callOpts = mockSearch.mock.calls[0]![2] as SearchOptions;
    expect(callOpts.category).toBe('interview');
  });

  it('passes through skillName to vector-store', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });
    await kb.semanticSearch('q', 5, { skillName: 's-1' });

    const callOpts = mockSearch.mock.calls[0]![2] as SearchOptions;
    expect(callOpts.skillName).toBe('s-1');
  });

  it('passes through book to vector-store', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });
    await kb.semanticSearch('q', 5, { book: 'book-a' });

    const callOpts = mockSearch.mock.calls[0]![2] as SearchOptions;
    expect(callOpts.book).toBe('book-a');
  });

  it('ignores category values other than promotion/interview', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });
    const opts = { category: 'invalid' } as unknown as SemanticSearchOptions;
    await kb.semanticSearch('q', 5, opts);

    const callOpts = mockSearch.mock.calls[0]![2] as SearchOptions;
    expect(callOpts.category).toBeUndefined();
  });

  it('returns empty when vector-store.search() returns empty (no rerank call)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed, rerank: mockRerank });
    const result = await kb.semanticSearch('q', 5);

    expect(result).toEqual([]);
    expect(mockRerank).not.toHaveBeenCalled();
  });

  it('converts SearchResult to ScoredChunk shape correctly (uses result.score)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const candidates: SearchResult[] = [
      makeResult('a', 0.95, 'text-a', { category: 'promotion', book: 'book-a' }),
      makeResult('b', 0.7, 'text-b', { category: 'interview', book: 'book-b' }),
    ];
    mockSearch.mockReturnValue(candidates);

    const kb = createKnowledgeBase({ embed, rerank: mockRerank });
    const result = await kb.semanticSearch('q', 5, { skipRerank: true });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'a',
      text: 'text-a',
      score: 0.95,
      category: 'promotion',
      book: 'book-a',
    });
    expect(result[1]).toEqual({
      id: 'b',
      text: 'text-b',
      score: 0.7,
      category: 'interview',
      book: 'book-b',
    });
  });

  it('uses default rerank from reranker module when config.rerank not provided', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([makeResult('a', 0.5, 'text-a')]);
    mockRerank.mockResolvedValueOnce([makeScoredChunk('a', 0.5, 'text-a')]);

    const kb = createKnowledgeBase({ embed });
    const result = await kb.semanticSearch('q', 1);

    expect(mockRerank).toHaveBeenCalledTimes(1);
    expect(result).toEqual([makeScoredChunk('a', 0.5, 'text-a')]);
  });

  it('uses config.rerank when provided (overrides default)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const customRerank = vi.fn().mockResolvedValue([makeScoredChunk('custom', 0.99)]);
    mockSearch.mockReturnValue([makeResult('a', 0.5, 'text-a')]);

    const kb = createKnowledgeBase({ embed, rerank: customRerank });
    const result = await kb.semanticSearch('q', 1);

    expect(customRerank).toHaveBeenCalledTimes(1);
    expect(mockRerank).not.toHaveBeenCalled();
    expect(result).toEqual([makeScoredChunk('custom', 0.99)]);
  });

  it('passes candidates with metadata spread to rerank (preserves arbitrary fields)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const candidates: SearchResult[] = [
      makeResult('a', 0.9, 'text-a', { category: 'promotion', custom: 'value' }),
    ];
    mockSearch.mockReturnValue(candidates);
    mockRerank.mockResolvedValueOnce([
      { id: 'a', text: 'text-a', score: 0.9, category: 'promotion', custom: 'value' },
    ]);

    const kb = createKnowledgeBase({ embed });
    await kb.semanticSearch('q', 1);

    const rerankCandidates = mockRerank.mock.calls[0]![1] as Chunk[];
    expect(rerankCandidates[0]).toEqual({
      id: 'a',
      text: 'text-a',
      category: 'promotion',
      custom: 'value',
    });
  });
});

// ===================================================================
// hybridSearch()
// ===================================================================

describe('knowledge-base: hybridSearch()', () => {
  beforeEach(() => {
    setupStore();
    setupRerank();
    mockSearch.mockReset();
  });

  it('delegates to semanticSearch() (verify with property spy)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([makeResult('a', 0.5, 'text-a')]);
    mockRerank.mockResolvedValueOnce([makeScoredChunk('a', 0.5, 'text-a')]);

    const kb = createKnowledgeBase({ embed });

    // Manual spy: replace the property on the object so the self-referential
    // `hybridSearch` (which looks up `kb.semanticSearch` at call time) hits the spy.
    const originalSemanticSearch = kb.semanticSearch;
    const spy = vi.fn(originalSemanticSearch);
    kb.semanticSearch = spy;

    try {
      await kb.hybridSearch('q', 1);
    } finally {
      kb.semanticSearch = originalSemanticSearch;
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('q', 1, undefined);
  });

  it('passes opts through to semanticSearch()', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReturnValue([]);

    const kb = createKnowledgeBase({ embed });

    const originalSemanticSearch = kb.semanticSearch;
    const spy = vi.fn(originalSemanticSearch);
    kb.semanticSearch = spy;

    const opts: SemanticSearchOptions = { category: 'promotion', skillName: 's-1', skipRerank: true };
    try {
      await kb.hybridSearch('q', 5, opts);
    } finally {
      kb.semanticSearch = originalSemanticSearch;
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('q', 5, opts);
  });
});

// ===================================================================
// reranker timeout / reject fallback (3s timeout → cosine order)
// ===================================================================

describe('knowledge-base: reranker timeout/reject fallback', () => {
  beforeEach(() => {
    setupStore();
    setupRerank();
    mockSearch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to cosine order when reranker times out (3s) and clears the timer', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const candidates: SearchResult[] = Array.from({ length: 15 }, (_, i) =>
      makeResult(`cand-${i}`, 0.9 - i * 0.05, `text-${i}`)
    );
    mockSearch.mockReturnValue(candidates);
    // rerank resolves only after 4s — well past the 3s timeout
    mockRerank.mockReturnValueOnce(new Promise((r) => setTimeout(r, 4000)));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    const kb = createKnowledgeBase({ embed });
    const promise = kb.semanticSearch('q', 5);
    // advance past the 3s reranker timeout so the timeout branch rejects
    await vi.advanceTimersByTimeAsync(3001);
    const result = await promise;

    // cosine order: first 5 candidates by descending composite score
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual(['cand-0', 'cand-1', 'cand-2', 'cand-3', 'cand-4']);
    expect(result[0]).toEqual({ id: 'cand-0', text: 'text-0', score: 0.9 });

    // fallback log emitted
    const fallbackMessages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(fallbackMessages.some((m) => m.includes('Reranker fallback'))).toBe(true);

    // timeout timer was cleared in the finally block
    expect(clearSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('falls back to cosine order when reranker rejects (immediate)', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const candidates: SearchResult[] = Array.from({ length: 15 }, (_, i) =>
      makeResult(`cand-${i}`, 0.9 - i * 0.05, `text-${i}`)
    );
    mockSearch.mockReturnValue(candidates);
    mockRerank.mockRejectedValueOnce(new Error('boom'));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const kb = createKnowledgeBase({ embed });
    const result = await kb.semanticSearch('q', 5);

    // cosine order
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual(['cand-0', 'cand-1', 'cand-2', 'cand-3', 'cand-4']);

    // fallback log emitted
    const fallbackMessages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(fallbackMessages.some((m) => m.includes('Reranker fallback'))).toBe(true);

    logSpy.mockRestore();
  });
});
