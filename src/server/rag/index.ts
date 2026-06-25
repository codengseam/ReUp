// src/lib/rag/index.ts
// 公开 API：与原 src/lib/rag.ts 行为一致
// 各子模块：types / cache / search / route / safety / assess / suggestions / _retrieve-internal

import { searchCache, getCacheKey, getCached, setCache } from './cache';
import { retrieve as _retrieve, type RetrieveCache, type PrecomputedIntent } from './_retrieve-internal';
import type { RAGResponse } from './types';

// 类型导出
export type { RAGResult, RAGResponse, Citation, SafetyCheckResult } from './types';
export type { RetrieveCache, PrecomputedIntent } from './_retrieve-internal';

// 子模块聚合 re-export（保持原 src/lib/rag.ts 的所有命名导出向后兼容）
export {
  inputGuard,
  outputGuard,
  hallucinationCheck,
  contentSafetyCheck,
  outputSafetyCheck,
} from './safety';

export { assessConfidence, isHotQuery, HOT_QUERIES } from './assess';
export { formatContext, buildCitations, getInputSuggestions, SUGGESTION_DB } from './suggestions';

export { getCacheKey, getCached, setCache, searchCache } from './cache';
export type { CacheEntry } from './cache';

// 主入口：注入默认 cache 实现
export async function retrieve(
  query: string,
  topK: number = 5,
  chatHistory?: Array<{ role: string; content: string }>,
  params?: Record<string, unknown>,
  precomputed?: PrecomputedIntent
): Promise<RAGResponse> {
  return _retrieve(
    query,
    topK,
    chatHistory,
    params,
    {
      searchCache,
      getCacheKey,
      getCached,
      setCache,
    } satisfies RetrieveCache,
    precomputed
  );
}

/**
 * 给一个 Promise 加上超时。
 * - 超时触发时 reject 一个带 label 的 Error
 * - 主 promise 结束后清掉定时器
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 兼容旧的 `RAGResult` 命名空间（部分旧代码可能用 namespace import）
export type { Citation as CitationT } from './types';
