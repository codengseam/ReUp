// src/server/rag/__tests__/category-filter.test.ts
// TDD RED: vector-store passesFilter must map intent-level category filters
// ('promotion' | 'interview') to the Chinese metadata.category values actually
// present in data/skill-vectors.json (职级体系 / 考察标准 / ...).
//
// Pre-fix behaviour: passesFilter uses strict equality, so a category filter of
// 'promotion' matches 0 of the 608 real chunks (whose metadata.category is
// always Chinese). These tests must fail against the current implementation.

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createVectorStore, type VectorStore } from '../vector-store';

interface FixtureRecord {
  id: string;
  text: string;
  retrieval_text: string;
  metadata: string;
  book: string;
  filename: string;
  doc_title: string;
  section_title: string;
  title_path: string;
  keyword_text: string;
  source_path: string;
  chunk_index: number;
  vector: number[];
  sparse_vector: Array<{ index: number; value: number }> | null;
}

interface FixtureFile {
  version: number;
  dimension: number;
  count: number;
  vectors: FixtureRecord[];
}

function mkRecord(
  id: string,
  category: string,
  vector: number[]
): FixtureRecord {
  return {
    id,
    text: `text-${id}-${category}`,
    retrieval_text: `retrieval-${id}`,
    metadata: JSON.stringify({ category, skillName: id, book: 'book-x' }),
    book: 'book-x',
    filename: `${id}.md`,
    doc_title: id,
    section_title: id,
    title_path: id,
    keyword_text: id,
    source_path: `${id}.md`,
    chunk_index: 0,
    vector,
    sparse_vector: null,
  };
}

const FIXTURE: FixtureFile = {
  version: 1,
  dimension: 4,
  count: 5,
  vectors: [
    mkRecord('p1', '职级体系', [1, 0, 0, 0]),
    mkRecord('p2', '晋升答辩', [0, 1, 0, 0]),
    mkRecord('i1', '考察标准', [0, 0, 1, 0]),
    mkRecord('i2', '面试概览', [0, 0, 0, 1]),
    mkRecord('u1', '其他', [1, 1, 0, 0]),
  ],
};

describe('category-filter: Chinese alias mapping', () => {
  let store: VectorStore;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'reup-cat-'));
    const path = join(tmpDir, 'vectors.json');
    writeFileSync(path, JSON.stringify(FIXTURE));
    store = createVectorStore();
    return store.load(path).then(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  it('promotion filter matches Chinese promotion categories', () => {
    const results = store.search([1, 0, 0, 0], 10, { category: 'promotion' });
    expect(results.map((r) => r.id).sort()).toEqual(['p1', 'p2']);
  });

  it('interview filter matches Chinese interview categories', () => {
    const results = store.search([1, 0, 0, 0], 10, { category: 'interview' });
    expect(results.map((r) => r.id).sort()).toEqual(['i1', 'i2']);
  });

  it('unknown category falls back to strict equality', () => {
    const results = store.search([1, 1, 0, 0], 10, {
      category: '其他' as 'promotion',
    });
    expect(results.map((r) => r.id)).toEqual(['u1']);
  });

  it('no category filter returns all records', () => {
    const results = store.search([1, 0, 0, 0], 10);
    expect(results.map((r) => r.id).sort()).toEqual([
      'i1',
      'i2',
      'p1',
      'p2',
      'u1',
    ]);
  });

  it('promotion filter does not leak interview chunks', () => {
    const results = store.search([1, 0, 0, 0], 10, { category: 'promotion' });
    expect(results.every((r) => r.id !== 'i1' && r.id !== 'i2')).toBe(true);
  });
});
