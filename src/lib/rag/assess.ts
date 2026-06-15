// src/lib/rag/assess.ts
// 1:1 迁移自 rag.ts:953-1010 + HOT_QUERIES（从 rag.ts:1192-1208）

import type { RAGResult } from './types';

// 置信度评估（纯数值计算，无需LLM）。
// 阶段 4：改为线性打分（结果数 + 最高分加权） + 0..1 数值 score。
// 热门问题（已纳入 HOT_QUERIES / QUICK_ENTRIES / EXAMPLE_QUERIES 的问题）即使 RAG 召回一般，
// 也能由 LLM 凭借通用知识给出可靠回答，直接给高置信度，避免对常见问题误触发"转人工"。
export interface ConfidenceThresholds {
  high: number;
  medium: number;
}

const DEFAULT_THRESHOLDS: ConfidenceThresholds = { high: 0.50, medium: 0.25 };

export function assessConfidence(
  results: RAGResult[],
  query?: string,
  thresholds?: ConfidenceThresholds
): { level: 'high' | 'medium' | 'low'; reason?: string; score: number } {
  const t = thresholds ?? DEFAULT_THRESHOLDS;

  if (query && isHotQuery(query)) {
    return { level: 'high', score: 0.9 };
  }

  if (results.length === 0) {
    return { level: 'low', score: 0.1, reason: 'no_results' };
  }

  const top = results[0]?.score ?? 0;
  // 线性打分：召回数量 (0..1, topK=5 封顶) × 0.5 + 最高分 × 0.5，结果夹紧到 [0,1]
  const score = Math.min(1, (results.length / 5) * 0.5 + top * 0.5);

  if (score >= t.high) {
    return { level: 'high', score };
  }
  if (score >= t.medium) {
    return { level: 'medium', score, reason: 'partial_match' };
  }
  return { level: 'low', score, reason: 'weak_match' };
}

// 热门问题判定：直接文本相似（包含/包含于），命中即视为热门
// HOT_QUERIES 已涵盖 QUICK_ENTRIES / INPUT_SUGGESTIONS_DB / EXAMPLE_QUERIES.goodExample 的核心场景
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

  // 关键词重叠兜底：用户问题的核心关键词命中 ≥ 2 个热门关键词，即视为热门变体
  // 解决 "P7升P8" / "P7到P8应该怎么做" 等不完全匹配但语义等价的情况
  const hotKeywords = ['p7', 'p8', 'p6', 'p9', '晋升', '升职', '答辩', '绩效', '亮点', '面试', '自我介绍', '反问', '总监', '开会', '跳槽', '技术负责人', '领域专家', '三重境界', '答辩没过', '转场', '挖掘'];
  let hit = 0;
  for (const kw of hotKeywords) {
    if (q.includes(kw)) hit++;
    if (hit >= 2) return true;
  }
  return false;
}

// ========== 热门问题 ==========
// 涵盖 QUICK_ENTRIES / INPUT_SUGGESTIONS_DB / EXAMPLE_QUERIES.goodExample 中所有被产品定义为"标准提问"的问题
export const HOT_QUERIES: ReadonlyArray<{ id: number; text: string; category: 'promotion' | 'interview' }> = [
  { id: 1, text: '我绩效很好，为什么没晋升？', category: 'promotion' },
  { id: 2, text: '我的经历没有亮点怎么办？', category: 'interview' },
  { id: 3, text: '面试被问住不会回答怎么圆？', category: 'interview' },
  { id: 4, text: '升了总监天天开会怎么办？', category: 'promotion' },
  { id: 5, text: '怎么自我介绍最加分？', category: 'interview' },
  { id: 6, text: '面试最后问什么问题？', category: 'interview' },
  { id: 7, text: '如何在现有业务中继续提升？', category: 'promotion' },
  { id: 8, text: '该学什么技术才能晋升？', category: 'promotion' },
  // ===== 优秀提问案例库 (EXAMPLE_QUERIES.goodExample) =====
  { id: 9, text: '我P6做了2年核心业务，绩效连续2次A，但晋升答辩没过，可能是什么原因？', category: 'promotion' },
  { id: 10, text: '作为技术负责人，我该学什么方向才能从P7升到P8？', category: 'promotion' },
  { id: 11, text: '我做的业务很稳定但不出彩，如何在晋升中体现价值？', category: 'promotion' },
  { id: 12, text: '面试时被问到不懂的技术栈，怎么优雅地转场？', category: 'interview' },
  { id: 13, text: '简历上的项目比较平淡，怎么挖掘出亮点？', category: 'interview' },
  { id: 14, text: '面试最后反问环节，问什么问题能给面试官留下好印象？', category: 'interview' },
];
