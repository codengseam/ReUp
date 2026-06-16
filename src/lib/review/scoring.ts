// src/lib/review/scoring.ts
// 评分逻辑：维度权重、加权总分、Verdict 判定

import type { InterviewType, ReviewDimensions, Verdict } from './types';

/**
 * 根据面试类型返回各维度的权重。
 * 所有权重之和为 1.0。
 */
export function getDimensionWeights(type: InterviewType): Record<string, number> {
  switch (type) {
    case 'TECHNICAL':
      return {
        technicalDepth: 0.40,
        communication: 0.15,
        problemSolving: 0.25,
        projectMastery: 0.15,
        behavioralFit: 0.05,
      };
    case 'BEHAVIORAL':
      return {
        technicalDepth: 0.05,
        communication: 0.30,
        problemSolving: 0.10,
        projectMastery: 0.20,
        behavioralFit: 0.35,
      };
    case 'CASE':
      return {
        technicalDepth: 0.15,
        communication: 0.25,
        problemSolving: 0.25,
        projectMastery: 0.10,
        behavioralFit: 0.25,
      };
    case 'SYSTEM_DESIGN':
      return {
        technicalDepth: 0.20,
        communication: 0.15,
        problemSolving: 0.25,
        projectMastery: 0.10,
        behavioralFit: 0.05,
        systemDesign: 0.25,
      };
    case 'MIXED':
      return {
        technicalDepth: 0.25,
        communication: 0.20,
        problemSolving: 0.20,
        projectMastery: 0.15,
        behavioralFit: 0.15,
        systemDesign: 0.05,
      };
    default:
      return {
        technicalDepth: 0.25,
        communication: 0.20,
        problemSolving: 0.20,
        projectMastery: 0.15,
        behavioralFit: 0.15,
        systemDesign: 0.05,
      };
  }
}

/**
 * 计算加权总分，clamp 到 [0, 10]。
 */
export function computeOverallScore(dimensions: ReviewDimensions, weights: Record<string, number>): number {
  let score = 0;
  const dims = dimensions as unknown as Record<string, number | undefined>;
  for (const [key, weight] of Object.entries(weights)) {
    const dimValue = dims[key];
    if (typeof dimValue === 'number') {
      score += dimValue * weight;
    }
  }
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * 根据总分映射到 Verdict。
 *
 * 阈值：
 *  >= 9  → strong_hire
 *  >= 8  → hire
 *  >= 7  → lean_hire
 *  >= 5  → lean_no_hire
 *  >= 3  → no_hire
 *  < 3   → strong_no_hire
 */
export function getVerdict(score: number): Verdict {
  if (score >= 9) return 'strong_hire';
  if (score >= 8) return 'hire';
  if (score >= 7) return 'lean_hire';
  if (score >= 5) return 'lean_no_hire';
  if (score >= 3) return 'no_hire';
  return 'strong_no_hire';
}