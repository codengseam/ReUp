// src/lib/eval/golden-dataset.test.ts
// M2: Golden 测试集 CRUD 测试

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetDbForTest } from '@/lib/db/connection';
import {
  insertGoldenTest,
  getAllGoldenTests,
  getGoldenTestById,
  getGoldenTestCount,
  deleteGoldenTest,
} from './golden-dataset';

beforeEach(() => {
  process.env.LOOP_ENGINEERING_DB = ':memory:';
  _resetDbForTest();
});

afterEach(() => {
  _resetDbForTest();
});

describe('golden-dataset', () => {
  it('inserts and retrieves golden tests', () => {
    const id = insertGoldenTest({
      query: '如何准备晋升答辩？',
      expected_answer: '晋升答辩需要准备PPT和演讲稿',
      expected_faithfulness: 0.9,
      expected_relevancy: 0.85,
      context_docs: '["doc-1","doc-2"]',
      category: 'promotion',
      difficulty: 'medium',
      tags: '["晋升","答辩"]',
    });
    expect(id).toBeGreaterThan(0);
    const tests = getAllGoldenTests();
    expect(tests).toHaveLength(1);
    expect(tests[0].query).toBe('如何准备晋升答辩？');
    expect(tests[0].expected_faithfulness).toBe(0.9);
    expect(tests[0].category).toBe('promotion');
  });

  it('getGoldenTestCount returns correct count', () => {
    expect(getGoldenTestCount()).toBe(0);
    insertGoldenTest({
      query: 'q1', expected_answer: 'a1',
      expected_faithfulness: 1, expected_relevancy: 1,
      context_docs: null, category: 'general', difficulty: 'easy', tags: null,
    });
    expect(getGoldenTestCount()).toBe(1);
    insertGoldenTest({
      query: 'q2', expected_answer: 'a2',
      expected_faithfulness: 0.5, expected_relevancy: 0.6,
      context_docs: null, category: 'general', difficulty: 'medium', tags: null,
    });
    expect(getGoldenTestCount()).toBe(2);
  });

  it('getGoldenTestById returns the test or null', () => {
    const id = insertGoldenTest({
      query: 'q1', expected_answer: 'a1',
      expected_faithfulness: 1, expected_relevancy: 1,
      context_docs: null, category: null, difficulty: 'easy', tags: null,
    });
    const t = getGoldenTestById(id);
    expect(t?.query).toBe('q1');
    expect(getGoldenTestById(99999)).toBeNull();
  });

  it('deleteGoldenTest removes the row', () => {
    const id = insertGoldenTest({
      query: 'q1', expected_answer: 'a1',
      expected_faithfulness: 1, expected_relevancy: 1,
      context_docs: null, category: null, difficulty: 'easy', tags: null,
    });
    expect(getGoldenTestCount()).toBe(1);
    deleteGoldenTest(id);
    expect(getGoldenTestCount()).toBe(0);
  });
});
