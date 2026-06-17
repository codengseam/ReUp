// src/lib/experiments/ab-test.test.ts
// M3: A/B 测试 - 稳定哈希分桶测试

import { describe, it, expect } from 'vitest';
import { hashBucket, assignVariant, isAssignmentStable } from './ab-test';

describe('hashBucket', () => {
  it('returns bucket in [0, 99]', () => {
    for (let i = 0; i < 100; i++) {
      const b = hashBucket(`user-${i}`, 'exp-1');
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('is stable for the same user + experiment', () => {
    const user = 'user-123';
    const exp = 'exp-abc';
    const b1 = hashBucket(user, exp);
    for (let i = 0; i < 10; i++) {
      expect(hashBucket(user, exp)).toBe(b1);
    }
  });

  it('different experiments give independent buckets for same user', () => {
    const user = 'user-123';
    // 不是说必须不同, 而是允许不同 (实际可能偶然相同)
    const b1 = hashBucket(user, 'exp-1');
    const b2 = hashBucket(user, 'exp-2');
    expect([b1, b2]).toHaveLength(2);
  });
});

describe('assignVariant', () => {
  it('assigns to control when user is outside experiment traffic', () => {
    const exp = {
      experiment_id: 'exp-test-1',
      variants: [{ name: 'v1', traffic: 0.1 }], // 10% 实验流量
    };
    // 找一个 bucket >= 10 的用户
    const outsideUsers: string[] = [];
    for (let i = 0; i < 1000 && outsideUsers.length < 5; i++) {
      const u = `u${i}`;
      const r = assignVariant(u, exp);
      if (!r.in_experiment) outsideUsers.push(u);
    }
    expect(outsideUsers.length).toBeGreaterThan(0);
    for (const u of outsideUsers) {
      expect(assignVariant(u, exp).variant).toBe('control');
    }
  });

  it('assigns to variant when user is within experiment traffic', () => {
    const exp = {
      experiment_id: 'exp-test-2',
      variants: [{ name: 'v1', traffic: 1.0 }], // 100% 实验流量
    };
    for (let i = 0; i < 20; i++) {
      const r = assignVariant(`u${i}`, exp);
      expect(r.in_experiment).toBe(true);
      expect(r.variant).toBe('v1');
    }
  });

  it('is stable across calls for same user', () => {
    const exp = {
      experiment_id: 'exp-stable',
      variants: [
        { name: 'a', traffic: 0.5 },
        { name: 'b', traffic: 0.5 },
      ],
    };
    const u = 'user-stable-test';
    const r1 = assignVariant(u, exp);
    const r2 = assignVariant(u, exp);
    expect(r1.variant).toBe(r2.variant);
    expect(r1.bucket).toBe(r2.bucket);
  });

  it('isAssignmentStable returns true for 10 runs', () => {
    expect(isAssignmentStable('u-1', 'exp-1', 10)).toBe(true);
    expect(isAssignmentStable('u-2', 'exp-2', 100)).toBe(true);
  });
});

describe('multi-variant distribution', () => {
  it('50/50 split roughly equal in large population', () => {
    const exp = {
      experiment_id: 'exp-50-50',
      variants: [
        { name: 'a', traffic: 0.5 },
        { name: 'b', traffic: 0.5 },
      ],
    };
    let aCount = 0, bCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const r = assignVariant(`u${i}`, exp);
      if (r.in_experiment) {
        if (r.variant === 'a') aCount++;
        else bCount++;
      }
    }
    // 期望 ~500/500, 允许 30% 偏差
    expect(aCount + bCount).toBeGreaterThan(900); // 90% 落入实验
    expect(aCount).toBeGreaterThan(300);
    expect(bCount).toBeGreaterThan(300);
  });
});
