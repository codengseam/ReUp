// src/lib/eval/judge-calibrator.test.ts
// M2: Pearson 相关系数 + 校准流程 (mock LLM)

import { describe, it, expect, vi } from 'vitest';

vi.mock('./ragas', () => ({
  evaluateFaithfulness: vi.fn().mockImplementation((answer: string) => {
    // 模拟一个跟 human 标注高度相关的 judge
    if (answer.includes('good')) return Promise.resolve({ score: 0.9, claims: [] });
    if (answer.includes('medium')) return Promise.resolve({ score: 0.6, claims: [] });
    if (answer.includes('bad')) return Promise.resolve({ score: 0.2, claims: [] });
    return Promise.resolve({ score: 0.5, claims: [] });
  }),
  evaluateAnswerRelevancy: vi.fn().mockImplementation((answer: string) => {
    if (answer.includes('good')) return Promise.resolve({ score: 0.85, reason: '' });
    if (answer.includes('medium')) return Promise.resolve({ score: 0.55, reason: '' });
    if (answer.includes('bad')) return Promise.resolve({ score: 0.15, reason: '' });
    return Promise.resolve({ score: 0.5, reason: '' });
  }),
}));

import { pearsonCorrelation, calibrateJudge } from './judge-calibrator';
import { insertGoldenTest } from './golden-dataset';
import { _resetDbForTest } from '@/lib/db/connection';

describe('pearsonCorrelation', () => {
  it('returns 1 for perfect positive correlation', () => {
    const r = pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(r).toBeCloseTo(1, 5);
  });

  it('returns -1 for perfect negative correlation', () => {
    const r = pearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1]);
    expect(r).toBeCloseTo(-1, 5);
  });

  it('returns 0 for no correlation', () => {
    const r = pearsonCorrelation([1, 2, 3, 4], [1, 1, 1, 1]);
    expect(r).toBe(0);
  });

  it('returns 0 for empty arrays', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
  });
});

describe('calibrateJudge', () => {
  it('returns skipped_reason when sample < 10', async () => {
    process.env.LOOP_ENGINEERING_DB = ':memory:';
    _resetDbForTest();
    for (let i = 0; i < 5; i++) {
      insertGoldenTest({
        query: `q${i}`,
        expected_answer: 'good',
        expected_faithfulness: 0.9,
        expected_relevancy: 0.8,
        context_docs: null,
        category: null,
        difficulty: 'easy',
        tags: null,
      });
    }
    const result = await calibrateJudge();
    expect(result.sample_count).toBe(5);
    expect(result.is_calibrated).toBe(false);
    expect(result.skipped_reason).toContain('样本不足');
  });

  it('is_calibrated=true when both correlations > 0.7', async () => {
    process.env.LOOP_ENGINEERING_DB = ':memory:';
    _resetDbForTest();
    // 插入 12 条: human faith/relev 跟 mock judge 高度正相关
    const answers = ['good', 'good', 'good', 'good', 'medium', 'medium', 'medium', 'bad', 'bad', 'bad', 'good', 'medium'];
    const faiths = [0.9, 0.9, 0.85, 0.95, 0.6, 0.6, 0.5, 0.2, 0.15, 0.1, 0.9, 0.55];
    const relevs = [0.85, 0.8, 0.9, 0.85, 0.55, 0.5, 0.6, 0.15, 0.2, 0.1, 0.85, 0.55];
    answers.forEach((ans, i) => {
      insertGoldenTest({
        query: `q${i}`,
        expected_answer: ans,
        expected_faithfulness: faiths[i],
        expected_relevancy: relevs[i],
        context_docs: null,
        category: null,
        difficulty: 'easy',
        tags: null,
      });
    });
    const result = await calibrateJudge();
    expect(result.sample_count).toBe(12);
    expect(result.faithfulness_correlation).toBeGreaterThan(0.7);
    expect(result.answer_relevancy_correlation).toBeGreaterThan(0.7);
    expect(result.is_calibrated).toBe(true);
  });
});
