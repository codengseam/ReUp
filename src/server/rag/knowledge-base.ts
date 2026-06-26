// src/lib/knowledge-base.ts
// ReUp v2 Phase 1, K1-K2: knowledge-base combining vector-store + reranker.
// Spec: docs/superpowers/specs/2026-06-14-reup-v2-design.md §5.4
//
// Local pipeline:
//   1. `embed(query)` turns the text query into a dense vector (caller-provided).
//   2. `vector-store.search(queryVec, topK*3, opts)` over-fetches candidates.
//   3. (Optional) `reranker.rerank(query, candidates, topK)` re-orders the over-fetched
//      pool down to `topK` with a cross-encoder score.
// `hybridSearch` currently delegates to `semanticSearch` because the vector-store
// already blends dense (0.20) + keyword (0.15) + lexical (0.10) into its composite
// score; a separate BM25 path is intentionally not added here.
//
// The vector index is loaded lazily on first use via `ensureVectorStoreLoaded()`
// (see src/lib/rag-init.ts). Tests can inject a pre-loaded `VectorStore` through
// the `store` config field to skip the file load entirely.
//
// Implementation note: methods are exposed on a plain object with a
// self-referential `hybridSearch` so tests can `vi.spyOn(kb, 'semanticSearch')`
// and verify delegation (the spy replaces the property at call time).

import { type VectorStore, type SearchResult, type SearchOptions } from './vector-store';
import { ensureVectorStoreLoaded } from './rag-init';
import { rerank as defaultRerank, type Chunk, type ScoredChunk } from './reranker';

export interface KnowledgeBaseConfig {
  /** Function that turns a text query into a vector. Caller provides (BGE-M3 / DashScope / etc). */
  embed: (text: string) => Promise<number[]>;
  /** Optional rerank function. Defaults to the BGE reranker exported from `./reranker`. */
  rerank?: (query: string, candidates: Chunk[], topK: number) => Promise<ScoredChunk[]>;
  /** Inject a pre-loaded `VectorStore`. Default: lazy-load via
   *  `ensureVectorStoreLoaded()` on the first search call. */
  store?: VectorStore;
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

// Cross-encoder rerank 超时阈值。首次调用需懒加载 250MB BGE-reranker-v2-m3 模型，
// 超时则降级到 cosine 排序；singleton promise 在后台继续加载，后续请求命中后即走 cross-encoder。
const RERANK_TIMEOUT_MS = 3000;

export function createKnowledgeBase(config: KnowledgeBaseConfig): KnowledgeBase {
  if (!config || typeof config.embed !== 'function') {
    throw new Error('knowledge-base: config.embed is required and must be a function');
  }

  const doRerank = config.rerank ?? defaultRerank;

  // If the caller injected a store, reuse it; otherwise lazy-load on first
  // search. Concurrent searches share the same in-flight load promise.
  let storePromise: Promise<VectorStore> | null = null;
  function getStore(): Promise<VectorStore> {
    if (config.store) return Promise.resolve(config.store);
    if (!storePromise) storePromise = ensureVectorStoreLoaded();
    return storePromise;
  }

  async function semanticSearch(
    query: string,
    topK: number,
    opts?: SemanticSearchOptions
  ): Promise<ScoredChunk[]> {
    const store = await getStore();
    const queryVec = await config.embed(query);
    const searchOpts = buildSearchOptions(opts);
    const candidates = store.search(queryVec, topK * 3, searchOpts);

    if (candidates.length === 0) {
      return [];
    }

    if (opts?.skipRerank) {
      return candidates.slice(0, topK).map(toScoredChunk);
    }

    // 默认走 BGE cross-encoder 重排；3s 超时或加载失败时降级到 cosine 排序
    // （candidates 已按 vector-store composite 分数降序，slice 即 cosine 序）。
    // 首次调用触发 250MB 模型懒加载；singleton promise 在后台继续，后续请求命中后即走 cross-encoder。
    const start = Date.now();
    const rerankPromise = doRerank(query, candidates.map(toChunk), topK);
    // 吞掉超时后迟到的 rejection，避免 unhandledRejection；记录日志以便线上排查
    rerankPromise.catch((err) => {
      console.log('[RAG] Reranker late rejection (post-timeout):', err?.message ?? err);
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`reranker timeout ${RERANK_TIMEOUT_MS}ms`)),
        RERANK_TIMEOUT_MS
      );
    });
    try {
      const reranked = await Promise.race([rerankPromise, timeout]);
      console.log(
        `[RAG] Reranker hit (cross-encoder): ${Date.now() - start}ms, in=${candidates.length} out=${reranked.length}`
      );
      return reranked;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(
        `[RAG] Reranker fallback after ${Date.now() - start}ms (${reason}); using cosine order`
      );
      return candidates.slice(0, topK).map(toScoredChunk);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
