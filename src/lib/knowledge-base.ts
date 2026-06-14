// src/lib/knowledge-base.ts
// ReUp v2 Phase 1, K1-K2: knowledge-base combining vector-store + reranker.
// Spec: docs/superpowers/specs/2026-06-14-reup-v2-design.md §5.4
//
// Replaces the old Coze-based `KnowledgeClient` with a local pipeline:
//   1. `embed(query)` turns the text query into a dense vector (caller-provided).
//   2. `vector-store.search(queryVec, topK*3, opts)` over-fetches candidates.
//   3. (Optional) `reranker.rerank(query, candidates, topK)` re-orders the over-fetched
//      pool down to `topK` with a cross-encoder score.
// `hybridSearch` currently delegates to `semanticSearch` because the vector-store
// already blends dense (0.20) + keyword (0.15) + lexical (0.10) into its composite
// score; a separate BM25 path is intentionally not added here.
//
// Implementation note: methods are exposed on a plain object with a
// self-referential `hybridSearch` so tests can `vi.spyOn(kb, 'semanticSearch')`
// and verify delegation (the spy replaces the property at call time).

import { createVectorStore } from './vector-store';
import type { SearchResult, SearchOptions } from './vector-store';
import { rerank as defaultRerank } from './reranker';
import type { Chunk, ScoredChunk } from './reranker';

export interface KnowledgeBaseConfig {
  /** Function that turns a text query into a vector. Caller provides (BGE-M3 / DashScope / etc). */
  embed: (text: string) => Promise<number[]>;
  /** Optional rerank function. Defaults to the BGE reranker exported from `./reranker`. */
  rerank?: (query: string, candidates: Chunk[], topK: number) => Promise<ScoredChunk[]>;
}

export interface SemanticSearchOptions extends SearchOptions {
  /** Skip the rerank step (e.g. for low-latency paths). Default false. */
  skipRerank?: boolean;
}

export interface KnowledgeBase {
  semanticSearch(query: string, topK: number, opts?: SemanticSearchOptions): Promise<ScoredChunk[]>;
  hybridSearch(query: string, topK: number, opts?: SemanticSearchOptions): Promise<ScoredChunk[]>;
}

function toChunk(r: SearchResult): Chunk {
  return {
    id: r.id,
    text: r.text,
    ...r.metadata,
  };
}

function toScoredChunk(r: SearchResult): ScoredChunk {
  return {
    id: r.id,
    text: r.text,
    score: r.score,
    ...r.metadata,
  };
}

/**
 * Build a `SearchOptions` payload for vector-store.search().
 * `category` is restricted to the `'promotion' | 'interview'` union; other
 * values are ignored so a stray runtime value cannot crash the store.
 */
function buildSearchOptions(opts?: SemanticSearchOptions): SearchOptions {
  const out: SearchOptions = {};
  if (opts?.category === 'promotion' || opts?.category === 'interview') {
    out.category = opts.category;
  }
  if (opts?.skillName !== undefined) {
    out.skillName = opts.skillName;
  }
  if (opts?.book !== undefined) {
    out.book = opts.book;
  }
  return out;
}

export function createKnowledgeBase(config: KnowledgeBaseConfig): KnowledgeBase {
  if (!config || typeof config.embed !== 'function') {
    throw new Error('knowledge-base: config.embed is required and must be a function');
  }

  const doRerank = config.rerank ?? defaultRerank;
  const store = createVectorStore();

  async function semanticSearch(
    query: string,
    topK: number,
    opts?: SemanticSearchOptions
  ): Promise<ScoredChunk[]> {
    const queryVec = await config.embed(query);
    const searchOpts = buildSearchOptions(opts);
    const candidates = store.search(queryVec, topK * 3, searchOpts);

    if (candidates.length === 0) {
      return [];
    }

    if (opts?.skipRerank) {
      return candidates.slice(0, topK).map(toScoredChunk);
    }

    return doRerank(query, candidates.map(toChunk), topK);
  }

  // Self-referential object: `hybridSearch` looks up `semanticSearch` on `kb`
  // at call time, so a test that does `vi.spyOn(kb, 'semanticSearch')` will see
  // the spy invoked when `hybridSearch` is called.
  const kb: KnowledgeBase = {
    semanticSearch,
    async hybridSearch(query, topK, opts) {
      return kb.semanticSearch(query, topK, opts);
    },
  };

  return kb;
}
