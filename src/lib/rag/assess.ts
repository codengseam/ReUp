// src/lib/rag/assess.ts
// 1:1 迁移自 rag.ts:953-1010 + HOT_QUERIES（从 rag.ts:1192-1208）

import type { RAGResult } from './types';

// 置信度评估（纯数值计算，无需LLM）。
// 阶段 4：改为线性打分（结果数 + 最高分加权） + 0..1 数值 score。
// 热门问题（已纳入 HOT_QUERIES 的问题）即使 RAG 召回一般，
// 也能由 LLM 凭借通用知识给出可靠回答，直接给高置信度，避免对常见问题误触发"转人工"。
export function assessConfidence(
  results: RAGResult[],
  query?: string
): { level: 'high' | 'medium' | 'low'; reason?: string; score: number } {
  if (query && isHotQuery(query)) {
    return { level: 'high', score: 0.9 };
  }

  if (results.length === 0) {
    return { level: 'low', score: 0.1, reason: 'no_results' };
  }

  const top = results[0]?.score ?? 0;
  // 线性打分：召回数量 (0..1, topK=5 封顶) × 0.5 + 最高分 × 0.5，结果夹紧到 [0,1]
  const score = Math.min(1, (results.length / 5) * 0.5 + top * 0.5);

  if (score >= 0.7) {
    return { level: 'high', score };
  }
  if (score >= 0.4) {
    return { level: 'medium', score, reason: 'partial_match' };
  }
  return { level: 'low', score, reason: 'weak_match' };
}

// 热门问题判定：直接文本相似（包含/包含于），命中即视为热门
// HOT_QUERIES 已涵盖 QUICK_ENTRIES / INPUT_SUGGESTIONS_DB / EXAMPLE_QUERIES 的核心场景
export function isHotQuery(query: string): boolean {
  const q = (query || '').trim().toLowerCase();
  if (!q) return false;

  for (const hot of HOT_QUERIES) {
    const t = hot.text.trim().toLowerCase();
    if (!t) continue;
    if (q === t) return true;
    // 用户问题是热门问题的子串，或热门问题包含用户问题
    if (q.includes(t) || t.includes(q)) return true;
  }

  return false;
}

// ========== 热门问题 ==========
// 框架通用化后清空，由调用方基于自身知识库自行注入热门问题。
export const HOT_QUERIES: ReadonlyArray<{ id: number; text: string; category: string }> = [];
