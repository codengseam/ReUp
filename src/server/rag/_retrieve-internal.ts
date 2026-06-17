// src/lib/rag/_retrieve-internal.ts
// 主检索流程（拆分前 rag.ts:1024-1136）
// 缓存依赖（searchCache / getCacheKey / getCached / setCache）从参数注入，便于测试

import { recordRAGRetrieve } from '@/server/db/admin-stats';
import type { CacheEntry } from './cache';
import { hybridSearch, rerankResults, compressContext, generateHydeAnswer, semanticSearch } from './search';
import { routeQueryViaLLM, inferQueryCategoryViaLLM, rewriteQueryViaLLM } from './route';
import { formatContext, buildCitations } from './suggestions';
import type { RAGResponse, RAGResult } from './types';
import { ensureVectorStoreLoaded } from '@/server/rag/rag-init';

/**
 * 缓存依赖注入接口（与 cache.ts 的实现兼容）。
 * 这样做的好处：
 * 1. 单元测试可传入 mock cache，不需要污染全局状态
 * 2. 将来若想用 Redis 等外部缓存，可在不修改 retrieve 主体的情况下替换实现
 */
export interface RetrieveCache {
  searchCache: Map<string, CacheEntry<RAGResult[]>>;
  getCacheKey: (
    query: string,
    chatHistory?: Array<{ role: string; content: string }>,
    params?: Record<string, unknown>
  ) => string;
  getCached: <T>(cache: Map<string, CacheEntry<T>>, key: string) => T | null;
  setCache: <T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs?: number) => void;
}

/**
 * 阶段 2：调用方如果已经通过 classifyIntent 拿到 rewrite / route / category，
 * 可以通过 precomputed 直接传进来，避免 retrieve 内部重复触发 3 个 LLM 调用。
 * 任意字段缺省时回退到原有 LLM 调用，行为与不传 precomputed 完全一致。
 */
export interface PrecomputedIntent {
  rewrittenQuery?: string;
  strategy?: 'direct' | 'multiquery' | 'hyde';
  subQueries?: string[];
  categoryFilter?: 'promotion' | 'interview' | 'all';
}

export async function retrieve(
  query: string,
  topK: number = 5,
  chatHistory?: Array<{ role: string; content: string }>,
  params?: Record<string, unknown>,
  cache?: RetrieveCache,
  precomputed?: PrecomputedIntent
): Promise<RAGResponse> {
  void recordRAGRetrieve();

  // 缓存依赖未注入时退回到与原行为一致的「无缓存」模式
  const effectiveCache: RetrieveCache | null = cache ?? null;

  const minScore = (params?.minScore as number) ?? 0.2;
  const maxChars = (params?.maxChars as number) ?? 3000;
  const semanticWeight = (params?.semanticWeight as number) ?? 0.7;
  const hydeEnabled = (params?.hydeEnabled as boolean) ?? true;
  const rerankEnabled = (params?.rerankEnabled as boolean) ?? true;
  const cacheTTLMinutes = (params?.cacheTTL as number) ?? 5;

  // 0. 确保向量索引已加载（spec §5.2：rag/_retrieve-internal.ts 必须显式触发 load）
  await ensureVectorStoreLoaded();

  // 1. 检查缓存
  const cacheKey = effectiveCache
    ? effectiveCache.getCacheKey(query, chatHistory, params)
    : '';
  const cached = effectiveCache ? effectiveCache.getCached(effectiveCache.searchCache, cacheKey) : null;
  if (cached) {
    console.log('[RAG] Cache hit for:', query.substring(0, 30));
    return {
      results: cached,
      context: formatContext(cached),
      status: 'generating',
      citations: buildCitations(cached),
    };
  }

  // 2. LLM查询重写（precomputed 优先；未提供时调用 LLM）
  const rewrittenQuery =
    precomputed?.rewrittenQuery ?? (await rewriteQueryViaLLM(query, chatHistory || []));

  // 3. LLM查询路由（precomputed 优先）
  const route = precomputed?.strategy
    ? {
        strategy: precomputed.strategy,
        rewrittenQuery,
        subQueries: precomputed.subQueries,
        confidence: 1.0,
      }
    : await routeQueryViaLLM(rewrittenQuery, chatHistory || []);
  console.log(`[RAG] Strategy: ${route.strategy}, confidence: ${route.confidence}, rewritten: ${route.rewrittenQuery.substring(0, 30)}`);

  // 4. LLM元数据过滤: 推断查询类别（precomputed 优先）
  const categoryFilter =
    precomputed?.categoryFilter ?? (await inferQueryCategoryViaLLM(route.rewrittenQuery));

  // 5. 根据策略执行检索
  let allResults: RAGResult[] = [];

  switch (route.strategy) {
    case 'direct': {
      allResults = await hybridSearch(route.rewrittenQuery, topK, minScore, categoryFilter, semanticWeight);
      break;
    }
    case 'multiquery': {
      const subQueries = route.subQueries || [route.rewrittenQuery];
      const subResults = await Promise.all(
        subQueries.map(q => hybridSearch(q, Math.ceil(topK / subQueries.length) + 1, minScore, categoryFilter, semanticWeight))
      );
      allResults = subResults.flat();
      break;
    }
    case 'hyde': {
      if (!hydeEnabled) {
        // HyDE 被禁用，降级为 direct 策略
        allResults = await hybridSearch(route.rewrittenQuery, topK, minScore, categoryFilter, semanticWeight);
        break;
      }
      const [directResults, hydeAnswer] = await Promise.all([
        hybridSearch(route.rewrittenQuery, topK, minScore, categoryFilter, semanticWeight),
        generateHydeAnswer(route.rewrittenQuery),
      ]);
      allResults = [...directResults];
      if (hydeAnswer) {
        const hydeResults = await semanticSearch(hydeAnswer, topK, minScore, categoryFilter);
        allResults = [...allResults, ...hydeResults];
      }
      break;
    }
  }

  // 6. 去重合并(按content前100字符去重，保留最高分)
  const mergedMap = new Map<string, RAGResult>();
  for (const result of allResults) {
    const key = result.content.trim().substring(0, 100);
    const existing = mergedMap.get(key);
    if (!existing || result.score > existing.score) {
      mergedMap.set(key, result);
    }
  }
  let results = Array.from(mergedMap.values());

  // 7. LLM重排序（条件执行）
  if (rerankEnabled) {
    results = await rerankResults(results, route.rewrittenQuery);
  }

  // 8. 上下文压缩
  results = compressContext(results.slice(0, topK * 2), maxChars);

  // 9. Top-K截取
  results = results.slice(0, topK);

  // 10. 缓存结果
  if (results.length > 0 && effectiveCache) {
    effectiveCache.setCache(effectiveCache.searchCache, cacheKey, results, cacheTTLMinutes * 60 * 1000);
  }

  // 11. 格式化输出
  const context = formatContext(results);
  const citations = buildCitations(results);

  return {
    results,
    context,
    status: 'generating',
    citations,
    rewrittenQuery: route.rewrittenQuery !== query ? route.rewrittenQuery : undefined,
    strategy: route.strategy,
  };
}
