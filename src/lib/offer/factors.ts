// src/lib/offer/factors.ts
// Offer Probability Analysis — factor calculation functions.

import type { Level, CompanyTier } from './types';

/**
 * Level fit: how well candidate level matches JD level.
 * Mapping:
 *   校招→校招: 1.0, 校招→P5: 0.5
 *   P5→P5: 1.0, P5→P6: 0.5
 *   P6→P5: 0.7, P6→P6: 1.0, P6→P7: 0.4
 *   P7→P6: 0.7, P7→P7: 1.0
 *   Default if jdLevel is missing: 0.7
 */
export function computeLevelFit(candidateLevel: Level, jdLevel?: string): number {
  if (!jdLevel) return 0.7;

  const map: Record<string, Record<string, number>> = {
    '校招': { '校招': 1.0, 'P5': 0.5 },
    'P5': { 'P5': 1.0, 'P6': 0.5 },
    'P6': { 'P5': 0.7, 'P6': 1.0, 'P7': 0.4 },
    'P7': { 'P6': 0.7, 'P7': 1.0 },
    'P8': { 'P7': 0.7, 'P8': 1.0 },
  };

  return map[candidateLevel]?.[jdLevel] ?? 0.5;
}

/**
 * Experience fit: years match using sigmoid-like function.
 * If no jdMinYears, return 0.8.
 * Otherwise: clamp(years / jdMinYears, 0, 2) / 2, clamped to [0, 1].
 */
export function computeExperienceFit(years: number, jdMinYears?: number): number {
  if (jdMinYears === undefined) return 0.8;
  const ratio = Math.max(0, Math.min(2, years / jdMinYears)) / 2;
  return Math.max(0, Math.min(1, ratio));
}

/**
 * Company tier score based on candidate level and company tier.
 * P7+ → BAT/TMD: 0.9, P5-P6 → BAT/TMD: 0.7
 * P5-P6 → 独角兽: 0.85
 * 校招 → 独角兽: 0.75
 * Default if no tier: 0.7
 */
export function computeCompanyTierScore(candidateLevel: Level, tier?: CompanyTier): number {
  if (!tier) return 0.7;

  const isSenior = candidateLevel === 'P7' || candidateLevel === 'P8';

  if (tier === 'BAT/TMD') return isSenior ? 0.9 : 0.7;
  if (tier === '独角兽') {
    if (candidateLevel === '校招') return 0.75;
    return 0.85;
  }

  return 0.7;
}

/**
 * Market factor — always returns 0.5 (neutral market) for now.
 */
export function computeMarketFactor(): number {
  return 0.5;
}