// src/lib/offer/confidence.ts
// Offer Probability Analysis — confidence score computation.

import type { OfferPredictionInput } from './types';

/**
 * Compute the confidence score for a prediction.
 *
 * Base: 0.4
 * +0.2 if has matchScore
 * +0.15 if has interviewScore
 * +0.15 if has resumeId
 * +0.1 if has jdId
 * -0.1 if missing companyInfo
 * -0.05 if no jdLevel
 * Clamped to [0.25, 0.95]
 */
export function computeConfidence(input: OfferPredictionInput): number {
  let confidence = 0.4;

  if (input.matchScore !== undefined) confidence += 0.2;
  if (input.interviewScore !== undefined) confidence += 0.15;
  if (input.resumeId) confidence += 0.15;
  if (input.jdId) confidence += 0.1;
  if (!input.companyInfo) confidence -= 0.1;
  if (!input.jdLevel) confidence -= 0.05;

  return Math.max(0.25, Math.min(0.95, confidence));
}