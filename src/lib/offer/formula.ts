// src/lib/offer/formula.ts
// Offer Probability Analysis — probability calculation formula.

import type {
  OfferFactor,
  OfferPredictionInput,
  PredictionInterval,
  OfferRisk,
  OfferStrength,
  ImprovementAction,
  FactorStatus,
  FactorCategory,
} from './types';
import {
  computeLevelFit,
  computeExperienceFit,
  computeCompanyTierScore,
  computeMarketFactor,
} from './factors';

/**
 * Main formula: probability = weighted sum of factors.
 * Weights: match 0.35, interview 0.25, levelFit 0.15, companyTier 0.10, market 0.10, experience 0.05
 */
export function computeProbability(input: OfferPredictionInput): {
  probability: number;
  confidence: number;
  predictionInterval: PredictionInterval;
  breakdown: OfferFactor[];
} {
  // Normalize scores to 0-1
  const matchScore = input.matchScore !== undefined ? input.matchScore / 10 : 0.5;
  const interviewScore = input.interviewScore !== undefined ? input.interviewScore / 10 : 0.5;
  const levelFit = computeLevelFit(input.level, input.jdLevel);
  const companyTier = computeCompanyTierScore(input.level, input.companyInfo?.tier);
  const market = computeMarketFactor();
  const experience = computeExperienceFit(input.yearsOfExperience, input.jdMinYears);

  // Weights
  const weights = {
    match: 0.35,
    interview: 0.25,
    levelFit: 0.15,
    companyTier: 0.10,
    market: 0.10,
    experience: 0.05,
  };

  const weightedMatch = matchScore * weights.match;
  const weightedInterview = interviewScore * weights.interview;
  const weightedLevelFit = levelFit * weights.levelFit;
  const weightedCompanyTier = companyTier * weights.companyTier;
  const weightedMarket = market * weights.market;
  const weightedExperience = experience * weights.experience;

  const probability = weightedMatch + weightedInterview + weightedLevelFit + weightedCompanyTier + weightedMarket + weightedExperience;

  // Confidence
  let confidence = 0.4;
  if (input.matchScore !== undefined) confidence += 0.2;
  if (input.interviewScore !== undefined) confidence += 0.15;
  if (input.resumeId) confidence += 0.15;
  if (input.jdId) confidence += 0.1;
  if (!input.companyInfo) confidence -= 0.1;
  if (!input.jdLevel) confidence -= 0.05;
  confidence = Math.max(0.3, Math.min(0.95, confidence));

  // Breakdown
  const rawFactors: Array<{
    factor: string;
    category: FactorCategory;
    weight: number;
    score: number;
    contribution: number;
    evidence: string;
  }> = [
    {
      factor: '简历与岗位匹配度',
      category: 'match',
      weight: weights.match,
      score: matchScore,
      contribution: weightedMatch,
      evidence: input.matchScore !== undefined
        ? `匹配度评分 ${input.matchScore}/10`
        : '无匹配度数据',
    },
    {
      factor: '面试表现',
      category: 'performance',
      weight: weights.interview,
      score: interviewScore,
      contribution: weightedInterview,
      evidence: input.interviewScore !== undefined
        ? `面试评分 ${input.interviewScore}/10`
        : '无面试数据',
    },
    {
      factor: '级别匹配度',
      category: 'qualification',
      weight: weights.levelFit,
      score: levelFit,
      contribution: weightedLevelFit,
      evidence: `候选人 ${input.level}${input.jdLevel ? ` → JD ${input.jdLevel}` : ''}`,
    },
    {
      factor: '公司背景',
      category: 'match',
      weight: weights.companyTier,
      score: companyTier,
      contribution: weightedCompanyTier,
      evidence: input.companyInfo
        ? `${input.companyInfo.name} (${input.companyInfo.tier})`
        : '无公司信息',
    },
    {
      factor: '市场环境',
      category: 'market',
      weight: weights.market,
      score: market,
      contribution: weightedMarket,
      evidence: '当前市场中性',
    },
    {
      factor: '经验年限匹配',
      category: 'qualification',
      weight: weights.experience,
      score: experience,
      contribution: weightedExperience,
      evidence: `${input.yearsOfExperience}年经验${input.jdMinYears !== undefined ? ` / JD要求${input.jdMinYears}年` : ''}`,
    },
  ];

  const breakdown: OfferFactor[] = rawFactors.map((f) => {
    const threshold = f.weight * 0.3;
    let status: FactorStatus;
    if (f.contribution > f.weight * 0.7) {
      status = 'positive';
    } else if (f.contribution < threshold) {
      status = 'negative';
    } else {
      status = 'neutral';
    }
    return { ...f, status };
  });

  // Prediction interval
  const intervalLow = Math.max(0.05, probability - 0.15);
  const intervalHigh = Math.min(0.95, probability + 0.15);
  const predictionInterval: PredictionInterval = { low: intervalLow, high: intervalHigh };

  return { probability, confidence, predictionInterval, breakdown };
}

/**
 * Generate top risks: bottom 3 factors by score.
 */
export function generateTopRisks(breakdown: OfferFactor[]): OfferRisk[] {
  const sorted = [...breakdown].sort((a, b) => a.score - b.score);
  const bottom3 = sorted.slice(0, 3);

  return bottom3.map((f) => {
    const impact = Math.round((1 - f.score) * f.weight * 100);
    const mitigations: Record<string, string> = {
      '简历与岗位匹配度': '优化简历，突出与JD相关的项目经验和技能',
      '面试表现': '使用ReUp进行模拟面试练习，针对薄弱环节改进',
      '级别匹配度': '考虑申请更匹配的级别，或积累更多相关经验',
      '公司背景': '积累更多行业知名公司的工作经验',
      '市场环境': '关注市场招聘趋势，选择招聘旺季投递',
      '经验年限匹配': '积累更多相关工作经验，或通过项目展示能力',
    };
    return {
      risk: f.factor,
      impact,
      howToMitigate: mitigations[f.factor] ?? '针对该因素进行改进',
    };
  });
}

/**
 * Generate top strengths: top 3 factors by score.
 */
export function generateTopStrengths(breakdown: OfferFactor[]): OfferStrength[] {
  const sorted = [...breakdown].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);

  return top3.map((f) => ({
    strength: f.factor,
    impact: Math.round(f.score * 100),
  }));
}

/**
 * Generate improvement actions from breakdown.
 * For each risk factor, generate an action.
 */
export function generateImprovementActions(breakdown: OfferFactor[]): ImprovementAction[] {
  const sorted = [...breakdown].sort((a, b) => a.score - b.score);
  const actions: ImprovementAction[] = [];

  const actionMap: Record<string, { action: string; difficulty: 'easy' | 'medium' | 'hard'; estimatedHours: number }> = {
    '简历与岗位匹配度': { action: '优化简历突出与JD相关的技能和项目经验', difficulty: 'easy', estimatedHours: 2 },
    '面试表现': { action: '使用ReUp进行3次模拟面试，重点练习薄弱环节', difficulty: 'medium', estimatedHours: 6 },
    '级别匹配度': { action: '评估当前级别定位，考虑申请更匹配的岗位', difficulty: 'medium', estimatedHours: 4 },
    '公司背景': { action: '积累行业知名公司工作经验或参与开源项目', difficulty: 'hard', estimatedHours: 80 },
    '市场环境': { action: '关注招聘旺季，提前准备简历和面试', difficulty: 'easy', estimatedHours: 1 },
    '经验年限匹配': { action: '通过项目经验展示能力，弥补年限不足', difficulty: 'medium', estimatedHours: 8 },
  };

  for (const f of sorted) {
    const map = actionMap[f.factor];
    if (!map) continue;
    const potentialLift = Math.round((1 - f.score) * f.weight * 0.5 * 100) / 100;
    actions.push({
      action: map.action,
      potentialLift,
      difficulty: map.difficulty,
      estimatedHours: map.estimatedHours,
    });
  }

  return actions;
}