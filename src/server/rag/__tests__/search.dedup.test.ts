// src/server/rag/__tests__/search.dedup.test.ts
// Unit tests for the weighted fusion + doc_id dedup + Top-K logic in search.ts.
//
// Mocks embedder / knowledge-base / llm-client / rag-init so the real
// `hybridSearch` and `retrieve` run deterministically against a controllable
// `knowledgeBase.semanticSearch`. The mock differentiates the semantic pass
// (first call inside hybridSearch) from the keyword-augmented pass (second
// call) by call index — the order is deterministic because Promise.all
// evaluates the array left-to-right synchronously.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `semanticSearchMock` is referenced inside the hoisted vi.mock() factory
// below, so it must itself be hoisted (vi.hoisted) to avoid the temporal-dead-
// zone error that a plain `const` would hit when the factory runs at
// module-load time (search.ts calls createKnowledgeBase() eagerly).
const { semanticSearchMock } = vi.hoisted(() => ({
  semanticSearchMock: vi.fn(),
}));

vi.mock('@/server/llm/llm-client', () => ({
  LLMClient: class {
    invoke = vi.fn();
  },
}));

vi.mock('@/server/rag/embedder', () => ({
  createEmbedder: () => ({
    embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
    isReady: () => true,
  }),
}));

vi.mock('@/server/rag/knowledge-base', () => ({
  createKnowledgeBase: () => ({
    semanticSearch: semanticSearchMock,
  }),
}));

vi.mock('@/server/rag/rag-init', () => ({
  ensureVectorStoreLoaded: vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { hybridSearch } from '@/server/rag/search';
import {
  retrieve,
  type RetrieveCache,
  type PrecomputedIntent,
} from '@/server/rag/_retrieve-internal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockChunk {
  id: string;
  text: string;
  score: number;
  category?: string;
  skillName?: string;
}

/**
 * Wire the knowledge-base mock so the first `semanticSearch` call (the semantic
 * pass inside hybridSearch) returns `semantic`, and the second call (the
 * keyword-augmented pass) returns `keyword`.
 */
function setupTwoPass(semantic: MockChunk[], keyword: MockChunk[]): void {
  let idx = 0;
  semanticSearchMock.mockImplementation(() => {
    const batch = idx === 0 ? semantic : keyword;
    idx++;
    return Promise.resolve(batch);
  });
}

function makeMockCache(): RetrieveCache {
  const map = new Map();
  return {
    searchCache: map as unknown as RetrieveCache['searchCache'],
    getCacheKey: (q: string) => `mock-${q}`,
    getCached: () => null,
    setCache: () => {},
  };
}

function precomputed(
  strategy: PrecomputedIntent['strategy'],
  extra: Partial<PrecomputedIntent> = {},
): PrecomputedIntent {
  return { strategy, rewrittenQuery: 'test query', categoryFilter: 'all', ...extra };
}

// ---------------------------------------------------------------------------
// Tests: hybridSearch fusion + dedup
// ---------------------------------------------------------------------------

describe('hybridSearch weighted fusion + dedup', () => {
  beforeEach(() => {
    semanticSearchMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('merges results that share the same docId into a single fused entry', async () => {
    setupTwoPass(
      [{ id: 'd1', text: 'shared content', score: 0.8 }],
      [{ id: 'd1', text: 'shared content', score: 0.95 }],
    );

    const results = await hybridSearch('test', 5, 0.2, undefined, 0.7);

    expect(results).toHaveLength(1);
    expect(results[0]!.docId).toBe('d1');
    // fused score combines both passes (not just one raw score)
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it('dedups by content first-100-chars prefix when docId is missing', async () => {
    const prefix = 'X'.repeat(100);
    setupTwoPass(
      [{ id: '', text: prefix + 'extra-a', score: 0.8 }],
      [{ id: '', text: prefix + 'extra-b', score: 0.9 }],
    );

    const results = await hybridSearch('test', 5, 0.2, undefined, 0.7);

    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain(prefix);
  });

  it('preserves (not zeroes) scores when all semantic scores are equal', async () => {
    // Two semantic results with identical scores → min-max normalise hits the
    // `max === min` branch and keeps the raw scores, so the fused score must be
    // 0.7 * 0.5 = 0.35, NOT 0 (which is what would happen if equal scores were
    // normalised to zero).
    setupTwoPass(
      [
        { id: 'a', text: 'content a', score: 0.5 },
        { id: 'b', text: 'content b', score: 0.5 },
      ],
      [],
    );

    const results = await hybridSearch('test', 5, 0.2, undefined, 0.7);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.score).toBeCloseTo(0.35, 5);
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it('applies weighted fusion: score = w*semantic + (1-w)*keyword', async () => {
    // Single result each → min-max keeps raw scores (max === min branch).
    const semantic: MockChunk[] = [{ id: 'a', text: 'content a', score: 0.5 }];
    const keyword: MockChunk[] = [{ id: 'a', text: 'content a', score: 1.0 }];

    // w = 0.7 → 0.7*0.5 + 0.3*1.0 = 0.65
    setupTwoPass(semantic, keyword);
    const r07 = await hybridSearch('test', 5, 0.2, undefined, 0.7);
    expect(r07[0]!.score).toBeCloseTo(0.65, 5);

    // w = 0.3 → 0.3*0.5 + 0.7*1.0 = 0.85
    setupTwoPass(semantic, keyword);
    const r03 = await hybridSearch('test', 5, 0.2, undefined, 0.3);
    expect(r03[0]!.score).toBeCloseTo(0.85, 5);
  });
});

// ---------------------------------------------------------------------------
// Tests: retrieve Top-K + higher-score-kept dedup
// ---------------------------------------------------------------------------

describe('retrieve Top-K + dedup merge', () => {
  beforeEach(() => {
    semanticSearchMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('enforces Top-K=5 (slices fused results down to topK)', async () => {
    // 8 distinct docIds from the semantic pass, nothing from the keyword pass.
    const distinct: MockChunk[] = Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`,
      text: `content ${i}`,
      score: 0.9 - i * 0.05,
    }));
    setupTwoPass(distinct, []);

    const res = await retrieve('test', 5, [], undefined, makeMockCache(), precomputed('direct'));

    expect(res.results).toHaveLength(5);
    // sorted descending by fused score
    const scores = res.results.map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]!).toBeGreaterThanOrEqual(scores[i]!);
    }
  });

  it('keeps the higher-scored result when two passes return the same docId', async () => {
    // Multiquery strategy → hybridSearch runs once per sub-query. Arrange the
    // knowledge-base mock so the two semantic passes return the same docId with
    // different scores; retrieve's dedup (`result.score > existing.score`) must
    // keep the higher one.
    //
    // Deterministic call order (Promise.all evaluates left-to-right):
    //   0: semantic for sub-query 1 → d1 @ 0.5  (fuses to 0.7*0.5 = 0.35)
    //   1: keyword  for sub-query 1 → []
    //   2: semantic for sub-query 2 → d1 @ 0.9  (fuses to 0.7*0.9 = 0.63)
    //   3: keyword  for sub-query 2 → []
    let idx = 0;
    semanticSearchMock.mockImplementation(() => {
      const batch =
        idx === 0
          ? [{ id: 'd1', text: 'shared content', score: 0.5 }]
          : idx === 2
            ? [{ id: 'd1', text: 'shared content', score: 0.9 }]
            : [];
      idx++;
      return Promise.resolve(batch);
    });

    const res = await retrieve('test', 5, [], undefined, makeMockCache(), precomputed('multiquery', {
      subQueries: ['q1', 'q2'],
    }));

    expect(res.results).toHaveLength(1);
    expect(res.results[0]!.docId).toBe('d1');
    // 0.7 * 0.9 = 0.63 (the higher one), not 0.7 * 0.5 = 0.35
    expect(res.results[0]!.score).toBeCloseTo(0.63, 5);
  });
});
