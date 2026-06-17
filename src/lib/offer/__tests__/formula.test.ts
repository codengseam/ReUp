import { describe, it, expect } from 'vitest';
import { computeProbability, generateTopRisks, generateTopStrengths, generateImprovementActions } from '../formula';
import { predictOffer } from '../index';
import type { OfferPredictionInput } from '../types';

function makeFullInput(): OfferPredictionInput {
  return {
    userId: 'user-1',
    jdId: 'jd-1',
    resumeId: 'resume-1',
    interviewSessionId: 'session-1',
    level: 'P6',
    yearsOfExperience: 5,
    matchScore: 7.5,
    interviewScore: 8.0,
    expectedSalary: 35000,
    companyInfo: {
      name: '字节跳动',
      tier: 'BAT/TMD',
      fundingStage: '已上市',
    },
    jdLevel: 'P6',
    jdMinYears: 3,
  };
}

function makeMinimalInput(): OfferPredictionInput {
  return {
    userId: 'user-2',
    level: 'P5',
    yearsOfExperience: 2,
  };
}

describe('computeProbability', () => {
  it('should return probability between 0.05 and 0.95 with full input', () => {
    const result = computeProbability(makeFullInput());
    expect(result.probability).toBeGreaterThanOrEqual(0.05);
    expect(result.probability).toBeLessThanOrEqual(0.95);
  });

  it('should return probability with minimal input (only level + years)', () => {
    const result = computeProbability(makeMinimalInput());
    expect(result.probability).toBeDefined();
    expect(typeof result.probability).toBe('number');
    expect(result.probability).toBeGreaterThanOrEqual(0.05);
    expect(result.probability).toBeLessThanOrEqual(0.95);
  });

  it('should have exactly 6 factors in breakdown', () => {
    const result = computeProbability(makeFullInput());
    expect(result.breakdown).toHaveLength(6);
  });

  it('should have predictionInterval within bounds', () => {
    const result = computeProbability(makeFullInput());
    expect(result.predictionInterval.low).toBeGreaterThanOrEqual(0.05);
    expect(result.predictionInterval.high).toBeLessThanOrEqual(0.95);
    expect(result.predictionInterval.low).toBeLessThanOrEqual(result.predictionInterval.high);
  });

  it('should produce valid probability when matchScore is undefined', () => {
    const input = makeMinimalInput();
    const result = computeProbability(input);
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeGreaterThanOrEqual(0.05);
    expect(result.probability).toBeLessThanOrEqual(0.95);
  });

  it('should have confidence between 0.3 and 0.95', () => {
    const result = computeProbability(makeFullInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it('should produce valid breakdown with status for each factor', () => {
    const result = computeProbability(makeFullInput());
    for (const factor of result.breakdown) {
      expect(factor.factor).toBeDefined();
      expect(factor.category).toBeDefined();
      expect(factor.weight).toBeGreaterThan(0);
      expect(factor.weight).toBeLessThanOrEqual(1);
      expect(factor.score).toBeGreaterThanOrEqual(0);
      expect(factor.score).toBeLessThanOrEqual(1);
      expect(factor.contribution).toBeGreaterThanOrEqual(0);
      expect(factor.contribution).toBeLessThanOrEqual(1);
      expect(['positive', 'neutral', 'negative']).toContain(factor.status);
    }
  });
});

describe('generateTopRisks', () => {
  it('should return 3 risks', () => {
    const { breakdown } = computeProbability(makeFullInput());
    const risks = generateTopRisks(breakdown);
    expect(risks).toHaveLength(3);
    for (const risk of risks) {
      expect(risk.risk).toBeDefined();
      expect(risk.impact).toBeDefined();
      expect(risk.howToMitigate).toBeDefined();
    }
  });
});

describe('generateTopStrengths', () => {
  it('should return 3 strengths', () => {
    const { breakdown } = computeProbability(makeFullInput());
    const strengths = generateTopStrengths(breakdown);
    expect(strengths).toHaveLength(3);
    for (const s of strengths) {
      expect(s.strength).toBeDefined();
      expect(s.impact).toBeDefined();
    }
  });
});

describe('generateImprovementActions', () => {
  it('should return actions for all factors', () => {
    const { breakdown } = computeProbability(makeFullInput());
    const actions = generateImprovementActions(breakdown);
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.action).toBeDefined();
      expect(a.potentialLift).toBeGreaterThanOrEqual(0);
      expect(['easy', 'medium', 'hard']).toContain(a.difficulty);
      expect(a.estimatedHours).toBeGreaterThan(0);
    }
  });
});

describe('predictOffer', () => {
  it('should return a complete OfferPredictionResult', () => {
    const result = predictOffer(makeFullInput());
    expect(result.id).toBeDefined();
    expect(result.userId).toBe('user-1');
    expect(result.probability).toBeGreaterThanOrEqual(0.05);
    expect(result.probability).toBeLessThanOrEqual(0.95);
    expect(result.confidence).toBeGreaterThanOrEqual(0.25);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
    expect(result.predictionInterval.low).toBeGreaterThanOrEqual(0.05);
    expect(result.predictionInterval.high).toBeLessThanOrEqual(0.95);
    expect(result.breakdown).toHaveLength(6);
    expect(result.topRisks).toHaveLength(3);
    expect(result.topStrengths).toHaveLength(3);
    expect(result.improvementActions.length).toBeGreaterThan(0);
    expect(result.modelVersion).toBe('rule-v1');
    expect(result.llmTrace.modelUsed).toBe('rule-v1');
    expect(result.createdAt).toBeDefined();
  });

  it('should work with minimal input', () => {
    const result = predictOffer(makeMinimalInput());
    expect(result.id).toBeDefined();
    expect(result.userId).toBe('user-2');
    expect(result.probability).toBeGreaterThanOrEqual(0.05);
    expect(result.probability).toBeLessThanOrEqual(0.95);
  });
});