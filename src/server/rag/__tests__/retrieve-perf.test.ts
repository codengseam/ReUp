// src/server/rag/__tests__/retrieve-perf.test.ts
// Regression test for chat output speed: retrieve() should not trigger extra
// LLM calls (keyword extraction / rerank / hyde) when using precomputed intent.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@/server/llm/llm-client', () => ({
  LLMClient: class {
    invoke = invokeMock;
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
    semanticSearch: vi.fn().mockResolvedValue([
      {
        id: 'c1',
        text: '测试原文知识点',
        score: 0.9,
        category: 'promotion',
        skillName: 'p8-lingyu-zhuanjia',
      },
    ]),
  }),
}));

vi.mock('@/server/rag/rag-init', () => ({
  ensureVectorStoreLoaded: vi.fn().mockResolvedValue({}),
}));

import { retrieve } from '@/server/rag/_retrieve-internal';
import type { RetrieveCache, PrecomputedIntent } from '@/server/rag/_retrieve-internal';
import type { RAGResult } from '@/server/rag/types';

function makeMockCache(): RetrieveCache {
  const map = new Map<string, { data: RAGResult[]; expiry: number; lastAccess: number }>();
  return {
    searchCache: map as unknown as RetrieveCache['searchCache'],
    getCacheKey: (query: string) => `mock-${query}`,
    getCached: (_cache, _key) => null,
    setCache: (_cache, _key, _data, _ttlMs) => {},
  };
}

describe('retrieve performance regression', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('does not call LLM for keyword extraction / rerank / hyde with precomputed direct intent', async () => {
    const precomputed: PrecomputedIntent = {
      strategy: 'direct',
      categoryFilter: 'promotion',
      rewrittenQuery: '如何从P7升到P8',
    };

    const result = await retrieve(
      '如何从P7升到P8',
      5,
      [],
      { semanticWeight: 0.7 },
      makeMockCache(),
      precomputed
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      content: '测试原文知识点',
      category: 'promotion',
    });
    // 关键断言：precomputed direct 路径下不应该再触发任何 LLM.invoke
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
