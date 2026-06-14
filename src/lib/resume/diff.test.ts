// src/lib/resume/diff.test.ts
// Phase 5 — E2 line-level LCS diff (RED first)
//
// 覆盖:
//  1) identical strings → all 'unchanged'
//  2) empty original → all 'added'
//  3) empty rewritten → all 'removed'
//  4) common prefix/suffix trim
//  5) classic 5-line example: 2 removed + 1 added for "1 added, 1 removed, 1 changed"
//
// 设计要点: computeLineDiff 输出顺序保持 "original 顺序为主, 新增行追加到尾部"。

import { describe, it, expect } from 'vitest';
import { computeLineDiff } from './diff';

describe('computeLineDiff', () => {
  it('returns all unchanged lines when original and rewritten are identical', () => {
    const text = 'alpha\nbeta\ngamma';
    const result = computeLineDiff(text, text);
    expect(result.every((d) => d.type === 'unchanged')).toBe(true);
    expect(result.map((d) => d.text)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns all added lines when original is empty', () => {
    const rewritten = 'new line 1\nnew line 2';
    const result = computeLineDiff('', rewritten);
    expect(result.every((d) => d.type === 'added')).toBe(true);
    expect(result.map((d) => d.text)).toEqual(['new line 1', 'new line 2']);
  });

  it('returns all removed lines when rewritten is empty', () => {
    const original = 'old line 1\nold line 2';
    const result = computeLineDiff(original, '');
    expect(result.every((d) => d.type === 'removed')).toBe(true);
    expect(result.map((d) => d.text)).toEqual(['old line 1', 'old line 2']);
  });

  it('returns empty array when both inputs are empty', () => {
    expect(computeLineDiff('', '')).toEqual([]);
  });

  it('preserves a common prefix as unchanged', () => {
    // original: 1, 2, 3, 4
    // rewritten: 1, 2, 3-modified, 4
    const original = '1\n2\n3\n4';
    const rewritten = '1\n2\n3-modified\n4';
    const result = computeLineDiff(original, rewritten);
    const types = result.map((d) => d.type);
    // 1, 2, 4 unchanged; 3 removed; 3-modified added
    expect(types).toEqual(['unchanged', 'unchanged', 'removed', 'added', 'unchanged']);
    expect(result.map((d) => d.text)).toEqual(['1', '2', '3', '3-modified', '4']);
  });

  it('preserves a common suffix as unchanged', () => {
    const original = 'header\nbody\nfooter';
    const rewritten = 'header\nnew-body\nfooter';
    const result = computeLineDiff(original, rewritten);
    expect(result.map((d) => d.type)).toEqual([
      'unchanged',
      'removed',
      'added',
      'unchanged',
    ]);
    expect(result.map((d) => d.text)).toEqual(['header', 'body', 'new-body', 'footer']);
  });

  it('handles a 5-line example with 1 added, 1 removed, 1 changed → 2 removed + 1 added', () => {
    // original:   A, B, C, D, E
    // rewritten:  A, B, C2, E  (C -> C2; D removed)
    // expected:   A=unchanged, B=unchanged, C=removed, C2=added, E=unchanged
    //            (= 1 added + 1 removed for the change, but here D is fully removed
    //             and C is replaced; classic 1 added 1 removed 1 changed = 2 removed 1 added)
    const original = 'A\nB\nC\nD\nE';
    const rewritten = 'A\nB\nC2\nE';
    const result = computeLineDiff(original, rewritten);

    const removed = result.filter((d) => d.type === 'removed').map((d) => d.text);
    const added = result.filter((d) => d.type === 'added').map((d) => d.text);
    const unchanged = result.filter((d) => d.type === 'unchanged').map((d) => d.text);

    expect(removed).toEqual(['C', 'D']);
    expect(added).toEqual(['C2']);
    expect(unchanged).toEqual(['A', 'B', 'E']);
  });

  it('handles a pure insertion (no removals)', () => {
    const original = 'line1\nline3';
    const rewritten = 'line1\nline2\nline3';
    const result = computeLineDiff(original, rewritten);
    expect(result.map((d) => d.type)).toEqual(['unchanged', 'added', 'unchanged']);
    expect(result.map((d) => d.text)).toEqual(['line1', 'line2', 'line3']);
  });

  it('handles a pure deletion (no additions)', () => {
    const original = 'line1\nline2\nline3';
    const rewritten = 'line1\nline3';
    const result = computeLineDiff(original, rewritten);
    expect(result.map((d) => d.type)).toEqual(['unchanged', 'removed', 'unchanged']);
    expect(result.map((d) => d.text)).toEqual(['line1', 'line2', 'line3']);
  });

  it('preserves a trailing newline-less single line', () => {
    const original = 'only line';
    const rewritten = 'only line';
    const result = computeLineDiff(original, rewritten);
    expect(result).toEqual([{ type: 'unchanged', text: 'only line' }]);
  });

  it('does not collapse repeated identical lines into a single match (LCS finds the optimal edit)', () => {
    // Two identical "x" lines: original has 2, rewritten has 3.
    // LCS length is 2; we should see 1 added "x" + 2 unchanged "x".
    const original = 'x\nx';
    const rewritten = 'x\nx\nx';
    const result = computeLineDiff(original, rewritten);
    const added = result.filter((d) => d.type === 'added');
    const unchanged = result.filter((d) => d.type === 'unchanged');
    expect(unchanged.length).toBe(2);
    expect(added.length).toBe(1);
    expect(added[0]?.text).toBe('x');
  });
});
