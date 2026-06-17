// src/lib/review/fallback.ts
// 当 LLM 不可用时生成基础复盘（不依赖 AI）

import type { ReviewInput, ReviewResult, ReviewDimensions } from './types';
import { getVerdict } from './scoring';

/**
 * 生成一个不依赖 LLM 的基础复盘结果。
 * 用于 LLM 调用失败时的降级方案。
 */
export function generateFallbackReview(input: ReviewInput): ReviewResult {
  const rawScore = 3 + input.difficulty * 1.5;
  const score = Math.max(0, Math.min(10, Math.round(rawScore * 10) / 10));

  const dimensions: ReviewDimensions = {
    technicalDepth: score,
    communication: score,
    problemSolving: score,
    projectMastery: score,
    behavioralFit: score,
  };

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    overallScore: score,
    overallVerdict: getVerdict(score),
    summary: '基础复盘（AI 服务暂不可用）',
    dimensions,
    greatMoments: [],
    topIssues: [],
    perQuestionFeedback: [],
    actionableItems: [],
    trace: {
      modelUsed: 'fallback',
      inputTokens: 0,
      outputTokens: 0,
      totalLatencyMs: 0,
      ragChunksUsed: input.ragChunks?.length ?? 0,
    },
    createdAt: new Date().toISOString(),
  };
}