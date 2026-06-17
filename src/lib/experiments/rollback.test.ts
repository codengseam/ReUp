// src/lib/experiments/rollback.test.ts
// M3: 自动回滚 - 三重防误判

import { describe, it, expect } from 'vitest';
import { welchTTest, checkShouldRollback } from './rollback';

describe('welchTTest', () => {
  it('returns p~1 for identical distributions', () => {
    const a = [0.5, 0.5, 0.5, 0.5, 0.5];
    const b = [0.5, 0.5, 0.5, 0.5, 0.5];
    const r = welchTTest(a, b);
    expect(r.p).toBeGreaterThan(0.5);
  });

  it('returns p<0.05 for very different distributions', () => {
    const a = [0.9, 0.9, 0.85, 0.95, 0.9, 0.88, 0.92, 0.9, 0.85, 0.95];
    const b = [0.3, 0.4, 0.35, 0.45, 0.3, 0.4, 0.35, 0.3, 0.4, 0.35];
    const r = welchTTest(a, b);
    expect(r.p).toBeLessThan(0.05);
  });

  it('handles small samples gracefully', () => {
    const r = welchTTest([0.5], [0.5]);
    expect(r.p).toBe(1);
  });
});

describe('checkShouldRollback', () => {
  const now = Math.floor(Date.now() / 1000);
  const startedLongAgo = now - 86400 * 5; // 5 天前

  it('does not rollback when control sample < 100', () => {
    const r = checkShouldRollback({
      experiment_id: 'exp-1',
      variant: 'v1',
      control_scores: Array(50).fill(0.8),
      variant_scores: Array(50).fill(0.3),
      experiment_started_at: startedLongAgo,
    });
    expect(r.should_rollback).toBe(false);
    expect(r.reason).toContain('样本量不足');
  });

  it('does not rollback during gray release period', () => {
    const recent = now - 3600; // 1 小时前
    const r = checkShouldRollback({
      experiment_id: 'exp-2',
      variant: 'v1',
      control_scores: Array(150).fill(0.8),
      variant_scores: Array(150).fill(0.3),
      experiment_started_at: recent,
    });
    expect(r.should_rollback).toBe(false);
    expect(r.in_gray_release).toBe(true);
    expect(r.reason).toContain('灰度期');
  });

  it('does not rollback when p > 0.05', () => {
    const r = checkShouldRollback({
      experiment_id: 'exp-3',
      variant: 'v1',
      control_scores: Array(150).fill(0).map((_, i) => 0.7 + Math.random() * 0.05),
      variant_scores: Array(150).fill(0).map((_, i) => 0.7 + Math.random() * 0.05),
      experiment_started_at: startedLongAgo,
    });
    // 随机数据不应回滚
    expect(r.should_rollback).toBe(false);
  });

  it('rolls back when variant is significantly worse', () => {
    const r = checkShouldRollback({
      experiment_id: 'exp-4',
      variant: 'v1',
      control_scores: Array(150).fill(0).map(() => 0.8 + Math.random() * 0.05),
      variant_scores: Array(150).fill(0).map(() => 0.3 + Math.random() * 0.05),
      experiment_started_at: startedLongAgo,
    });
    expect(r.should_rollback).toBe(true);
    expect(r.reason).toContain('显著');
    expect(r.p_value).toBeLessThan(0.05);
  });
});
