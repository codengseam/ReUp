// 阶段 4 Task 4.2：assessConfidence 单元测试
// 覆盖：HOT_QUERY 命中 0.9 / 无结果 0.1 / 线性打分（结果数 + 最高分加权）

import { describe, it, expect } from 'vitest';
import { assessConfidence, isHotQuery } from '@/lib/rag/assess';
import type { RAGResult } from '@/lib/rag/types';

const mk = (score: number, n = 1): RAGResult[] =>
  Array.from({ length: n }, (_, i) => ({ content: `c${i}`, score, docId: `d${i}` }));

describe('assessConfidence - 阶段 4 线性打分', () => {
  it('HOT_QUERY 命中 → high + score 0.9', () => {
    const r = assessConfidence(mk(0.5, 2), '我绩效很好，为什么没晋升？');
    expect(r.level).toBe('high');
    expect(r.score).toBe(0.9);
  });

  it('HOT_QUERY 命中（无 RAG 结果也高）', () => {
    const r = assessConfidence([], '面试被问住不会回答怎么圆？');
    expect(r.level).toBe('high');
    expect(r.score).toBe(0.9);
  });

  it('无 RAG 结果且非热门 → low + score 0.1 + reason no_results', () => {
    const r = assessConfidence([], '一段完全冷门的提问 xyz');
    expect(r.level).toBe('low');
    expect(r.score).toBe(0.1);
    expect(r.reason).toBe('no_results');
  });

  it('1 条结果 + 高分 (0.9) → score=(1/5)*0.5+0.9*0.5=0.55 → high（默认阈值 high≥0.50）', () => {
    const r = assessConfidence(mk(0.9, 1), '冷门');
    expect(r.level).toBe('high');
    expect(r.score).toBeCloseTo(0.55, 2);
  });

  it('5 条结果 + 0.6 最高分 → score=(5/5)*0.5+0.6*0.5=0.80 → high', () => {
    const r = assessConfidence(mk(0.6, 5), '冷门');
    expect(r.level).toBe('high');
    expect(r.score).toBeCloseTo(0.8, 2);
  });

  it('3 条结果 + 0.5 最高分 → score=(3/5)*0.5+0.5*0.5=0.55 → high（默认阈值 high≥0.50）', () => {
    const r = assessConfidence(mk(0.5, 3), '冷门');
    expect(r.level).toBe('high');
    expect(r.score).toBeCloseTo(0.55, 2);
  });

  it('2 条结果 + 0.3 最高分 → score=(2/5)*0.5+0.3*0.5=0.35 → medium（默认阈值 medium≥0.25）', () => {
    const r = assessConfidence(mk(0.3, 2), '冷门');
    expect(r.level).toBe('medium');
    expect(r.score).toBeCloseTo(0.35, 2);
    expect(r.reason).toBe('partial_match');
  });

  it('结果数 > 5 不会让 score 越界（被 Math.min 夹紧到 1）', () => {
    const r = assessConfidence(mk(1, 8), '冷门');
    expect(r.score).toBeLessThanOrEqual(1);
    // 期望 (8/5)*0.5=0.8 + 1*0.5=0.5 = 1.3 → min 1
    expect(r.score).toBe(1);
    expect(r.level).toBe('high');
  });

  it('results[0]?.score 为 0 时不崩', () => {
    const r = assessConfidence([{ content: 'x', score: 0 }], '冷门');
    expect(r.score).toBe(0.1); // (1/5)*0.5 + 0 = 0.1
    expect(r.level).toBe('low');
    expect(r.reason).toBe('weak_match');
  });

  it('不传 query 时，HOT_QUERY 逻辑不触发（按纯结果打分）', () => {
    const r = assessConfidence(mk(0.6, 5));
    expect(r.level).toBe('high');
    expect(r.score).toBeCloseTo(0.8, 2);
  });
});

describe('isHotQuery', () => {
  it('完全匹配热门问题', () => {
    expect(isHotQuery('我绩效很好，为什么没晋升？')).toBe(true);
  });

  it('空字符串返回 false', () => {
    expect(isHotQuery('')).toBe(false);
  });

  it('完全不相关的问题返回 false', () => {
    expect(isHotQuery('今天天气怎么样')).toBe(false);
  });
});
