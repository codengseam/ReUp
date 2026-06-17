// src/lib/review/__tests__/scoring.test.ts
// 面试复盘评分逻辑单元测试

import { describe, it, expect } from 'vitest';
import { getDimensionWeights, computeOverallScore, getVerdict } from '@/features/review/scoring';
import type { InterviewType, ReviewDimensions } from '@/features/review/types';

// ── getDimensionWeights ─────────────────────────────────────

describe('getDimensionWeights', () => {
  it('returns correct weights for TECHNICAL', () => {
    const w = getDimensionWeights('TECHNICAL');
    expect(w).toEqual({
      technicalDepth: 0.40,
      communication: 0.15,
      problemSolving: 0.25,
      projectMastery: 0.15,
      behavioralFit: 0.05,
    });
    // Sum should be 1.0
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });

  it('returns correct weights for BEHAVIORAL', () => {
    const w = getDimensionWeights('BEHAVIORAL');
    expect(w).toEqual({
      technicalDepth: 0.05,
      communication: 0.30,
      problemSolving: 0.10,
      projectMastery: 0.20,
      behavioralFit: 0.35,
    });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });

  it('returns correct weights for CASE', () => {
    const w = getDimensionWeights('CASE');
    expect(w).toEqual({
      technicalDepth: 0.15,
      communication: 0.25,
      problemSolving: 0.25,
      projectMastery: 0.10,
      behavioralFit: 0.25,
    });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });

  it('returns correct weights for SYSTEM_DESIGN', () => {
    const w = getDimensionWeights('SYSTEM_DESIGN');
    expect(w).toEqual({
      technicalDepth: 0.20,
      communication: 0.15,
      problemSolving: 0.25,
      projectMastery: 0.10,
      behavioralFit: 0.05,
      systemDesign: 0.25,
    });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });

  it('returns correct weights for MIXED', () => {
    const w = getDimensionWeights('MIXED');
    expect(w).toEqual({
      technicalDepth: 0.25,
      communication: 0.20,
      problemSolving: 0.20,
      projectMastery: 0.15,
      behavioralFit: 0.15,
      systemDesign: 0.05,
    });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });

  it('all weights sum to 1.0 for every interview type', () => {
    const types: InterviewType[] = ['TECHNICAL', 'BEHAVIORAL', 'CASE', 'SYSTEM_DESIGN', 'MIXED'];
    for (const type of types) {
      const w = getDimensionWeights(type);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    }
  });
});

// ── computeOverallScore ─────────────────────────────────────

describe('computeOverallScore', () => {
  const weights = getDimensionWeights('TECHNICAL');

  it('computes weighted average correctly', () => {
    const dims: ReviewDimensions = {
      technicalDepth: 8,
      communication: 7,
      problemSolving: 9,
      projectMastery: 6,
      behavioralFit: 5,
    };
    // 8*0.40 + 7*0.15 + 9*0.25 + 6*0.15 + 5*0.05 = 3.2 + 1.05 + 2.25 + 0.9 + 0.25 = 7.65
    const score = computeOverallScore(dims, weights);
    expect(score).toBe(7.7); // rounded to 1 decimal
  });

  it('returns 10 when all dimensions are 10', () => {
    const dims: ReviewDimensions = {
      technicalDepth: 10,
      communication: 10,
      problemSolving: 10,
      projectMastery: 10,
      behavioralFit: 10,
    };
    const score = computeOverallScore(dims, weights);
    expect(score).toBe(10);
  });

  it('returns 0 when all dimensions are 0', () => {
    const dims: ReviewDimensions = {
      technicalDepth: 0,
      communication: 0,
      problemSolving: 0,
      projectMastery: 0,
      behavioralFit: 0,
    };
    const score = computeOverallScore(dims, weights);
    expect(score).toBe(0);
  });

  it('clamps to 10 when weighted sum exceeds 10', () => {
    const dims: ReviewDimensions = {
      technicalDepth: 15,
      communication: 15,
      problemSolving: 15,
      projectMastery: 15,
      behavioralFit: 15,
    };
    const score = computeOverallScore(dims, weights);
    expect(score).toBe(10);
  });

  it('clamps to 0 when weighted sum is negative', () => {
    const dims: ReviewDimensions = {
      technicalDepth: -5,
      communication: -5,
      problemSolving: -5,
      projectMastery: -5,
      behavioralFit: -5,
    };
    const score = computeOverallScore(dims, weights);
    expect(score).toBe(0);
  });

  it('handles missing systemDesign dimension gracefully', () => {
    const sysDesignWeights = getDimensionWeights('SYSTEM_DESIGN');
    const dims: ReviewDimensions = {
      technicalDepth: 8,
      communication: 7,
      problemSolving: 6,
      projectMastery: 5,
      behavioralFit: 5,
    };
    const score = computeOverallScore(dims, sysDesignWeights);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it('includes systemDesign when present in dimensions', () => {
    const sysDesignWeights = getDimensionWeights('SYSTEM_DESIGN');
    const dims: ReviewDimensions = {
      technicalDepth: 8,
      communication: 7,
      problemSolving: 6,
      projectMastery: 5,
      behavioralFit: 5,
      systemDesign: 9,
    };
    // 8*0.20 + 7*0.15 + 6*0.25 + 5*0.10 + 5*0.05 + 9*0.25 = 1.6 + 1.05 + 1.5 + 0.5 + 0.25 + 2.25 = 7.15
    const score = computeOverallScore(dims, sysDesignWeights);
    expect(score).toBe(7.2); // rounded
  });
});

// ── getVerdict ──────────────────────────────────────────────

describe('getVerdict', () => {
  it('returns strong_hire for score >= 9', () => {
    expect(getVerdict(9.0)).toBe('strong_hire');
    expect(getVerdict(9.5)).toBe('strong_hire');
    expect(getVerdict(10)).toBe('strong_hire');
  });

  it('returns hire for 8.0 <= score < 9.0', () => {
    expect(getVerdict(8.0)).toBe('hire');
    expect(getVerdict(8.5)).toBe('hire');
    expect(getVerdict(8.9)).toBe('hire');
  });

  it('returns lean_hire for 7.0 <= score < 8.0', () => {
    expect(getVerdict(7.0)).toBe('lean_hire');
    expect(getVerdict(7.5)).toBe('lean_hire');
    expect(getVerdict(7.9)).toBe('lean_hire');
  });

  it('returns lean_no_hire for 5.0 <= score < 7.0', () => {
    expect(getVerdict(5.0)).toBe('lean_no_hire');
    expect(getVerdict(6.0)).toBe('lean_no_hire');
    expect(getVerdict(6.9)).toBe('lean_no_hire');
  });

  it('returns no_hire for 3.0 <= score < 5.0', () => {
    expect(getVerdict(3.0)).toBe('no_hire');
    expect(getVerdict(4.0)).toBe('no_hire');
    expect(getVerdict(4.9)).toBe('no_hire');
  });

  it('returns strong_no_hire for score < 3.0', () => {
    expect(getVerdict(2.9)).toBe('strong_no_hire');
    expect(getVerdict(1.0)).toBe('strong_no_hire');
    expect(getVerdict(0)).toBe('strong_no_hire');
    expect(getVerdict(-5)).toBe('strong_no_hire');
  });
});