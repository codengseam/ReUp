// src/server/rag/__tests__/fallback-text-search.test.ts
// TDD RED: when the BGE-M3 embedder fails (e.g. model cache missing),
// search.semanticSearch must degrade to a pure-text keyword fallback instead
// of returning an empty array.
//
// Pre-fix behaviour: semanticSearch catches the embedder error and returns [],
// so a query that should match knowledge-base chunks returns 0 references.
// These tests must fail against the current implementation.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted before imports because search.ts eagerly calls createKnowledgeBase)
// ---------------------------------------------------------------------------

const { mockSemanticSearch, mockGetAllRecords } = vi.hoisted(() => ({
  mockSemanticSearch: vi.fn(),
  mockGetAllRecords: vi.fn(),
}));

vi.mock('@/server/llm/llm-client', () => ({
  LLMClient: class {
    invoke = vi.fn();
  },
}));

vi.mock('@/server/rag/embedder', () => ({
  createEmbedder: () => ({
    embed: vi.fn().mockRejectedValue(new Error('embedder: failed to load pipeline')),
    isReady: () => false,
  }),
}));

vi.mock('@/server/rag/knowledge-base', () => ({
  createKnowledgeBase: () => ({
    semanticSearch: mockSemanticSearch,
    getAllRecords: mockGetAllRecords,
  }),
}));

vi.mock('@/server/rag/rag-init', () => ({
  ensureVectorStoreLoaded: vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { semanticSearch } from '@/server/rag/search';

// ---------------------------------------------------------------------------
// Fixtures: chunks with Chinese categories + Chinese text
// ---------------------------------------------------------------------------

interface MockRecord {
  id: string;
  text: string;
  category: string;
  metadata: Record<string, unknown>;
}

const CHUNKS: MockRecord[] = [
  {
    id: 'p1',
    text: '晋升答辩需要准备PPT和项目复盘，重点展示业绩',
    category: '晋升答辩',
    metadata: { skillName: '晋升答辩' },
  },
  {
    id: 'p2',
    text: '职级体系从P5到P9分为不同等级，对应不同能力要求',
    category: '职级体系',
    metadata: { skillName: '职级体系' },
  },
  {
    id: 'i1',
    text: '面试考察标准包括算法能力、行为问答和系统设计',
    category: '考察标准',
    metadata: { skillName: '考察标准' },
  },
];

beforeEach(() => {
  mockSemanticSearch.mockReset();
  mockGetAllRecords.mockReset();
  // knowledgeBase.semanticSearch throws because the embedder cannot load.
  mockSemanticSearch.mockRejectedValue(new Error('embedder unavailable'));
  mockGetAllRecords.mockReturnValue(CHUNKS);
});

describe('fallback text search on embedder failure', () => {
  it('returns non-empty results instead of [] when embedder fails', async () => {
    const results = await semanticSearch('如何准备晋升答辩', 5, 0.15, 'promotion');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returned chunk text contains a query keyword', async () => {
    const results = await semanticSearch('如何准备晋升答辩', 5, 0.15, 'promotion');
    expect(results.some((r) => r.content.includes('答辩'))).toBe(true);
  });

  it('applies promotion category filter (excludes interview chunks)', async () => {
    const results = await semanticSearch('如何准备晋升答辩', 5, 0.15, 'promotion');
    expect(results.every((r) => r.docId !== 'i1')).toBe(true);
  });

  it('returns empty when no chunk matches query keywords', async () => {
    const results = await semanticSearch('xyzqwerty', 5, 0.15, 'promotion');
    expect(results).toEqual([]);
  });

  it('results carry score and docId fields', async () => {
    const results = await semanticSearch('如何准备晋升答辩', 5, 0.15, 'promotion');
    for (const r of results) {
      expect(typeof r.score).toBe('number');
      expect(typeof r.docId).toBe('string');
      expect(r.score).toBeGreaterThan(0);
    }
  });
});
