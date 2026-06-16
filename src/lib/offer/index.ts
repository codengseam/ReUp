// src/lib/offer/index.ts
// Offer Probability Analysis — main entry point.

import type { OfferPredictionInput, OfferPredictionResult } from './types';
import { computeProbability, generateTopRisks, generateTopStrengths, generateImprovementActions } from './formula';
import { computeConfidence } from './confidence';

// Re-export all types
export type {
  Level,
  CompanyTier,
  FactorCategory,
  FactorStatus,
  ActualResult,
  OfferFactor,
  PredictionInterval,
  OfferRisk,
  OfferStrength,
  ImprovementAction,
  OfferPredictionInput,
  OfferPredictionResult,
} from './types';

// Re-export all factor functions
export {
  computeLevelFit,
  computeExperienceFit,
  computeCompanyTierScore,
  computeMarketFactor,
} from './factors';

// Re-export formula functions
export {
  computeProbability,
  generateTopRisks,
  generateTopStrengths,
  generateImprovementActions,
} from './formula';

// Re-export confidence
export { computeConfidence } from './confidence';

/**
 * Predict offer probability.
 * Main entry point that combines all computations.
 */
export function predictOffer(input: OfferPredictionInput): OfferPredictionResult {
  const { probability, confidence, predictionInterval, breakdown } = computeProbability(input);
  const computedConfidence = computeConfidence(input);
  const topRisks = generateTopRisks(breakdown);
  const topStrengths = generateTopStrengths(breakdown);
  const improvementActions = generateImprovementActions(breakdown);

  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    jdId: input.jdId,
    resumeId: input.resumeId,
    interviewSessionId: input.interviewSessionId,
    probability,
    confidence: computedConfidence,
    predictionInterval,
    breakdown,
    topRisks,
    topStrengths,
    improvementActions,
    modelVersion: 'rule-v1',
    llmTrace: {
      modelUsed: 'rule-v1',
      inputTokens: 0,
      outputTokens: 0,
      totalLatencyMs: 0,
    },
    createdAt: new Date().toISOString(),
  };
}