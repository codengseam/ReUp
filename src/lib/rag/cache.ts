// src/lib/rag/cache.ts
// LRU 缓存 + 简单 hash + 缓存 key

import type { RAGResult } from './types';

interface CacheEntry<T> {
  data: T;
  expiry: number;
  lastAccess: number;
}

const MAX_CACHE_SIZE = 500;

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export function getCacheKey(
  query: string,
  chatHistory?: Array<{ role: string; content: string }>,
  params?: Record<string, unknown>
): string {
  const historyStr = chatHistory
    ?.slice(-3)
    .map(m => m.role.charAt(0) + ':' + simpleHash(m.content))
    .join('|') || '';
  const paramStr = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join('&')
    : '';
  return `${simpleHash(query)}::${historyStr}::${paramStr}`;
}

export function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) {
    entry.lastAccess = Date.now();
    return entry.data;
  }
  if (entry) cache.delete(key);
  return null;
}

export function setCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  data: T,
  ttlMs = 5 * 60 * 1000
): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now >= v.expiry) cache.delete(k);
  }
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestAccess = Infinity;
    for (const [k, v] of cache) {
      if (v.lastAccess < oldestAccess) {
        oldestAccess = v.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, expiry: now + ttlMs, lastAccess: now });
}

export const searchCache = new Map<string, CacheEntry<RAGResult[]>>();

export type { CacheEntry };
