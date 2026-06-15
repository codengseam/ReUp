// src/lib/admin-knowledge.test.ts
// ReUp v2 Phase 1.5: admin knowledge tab read-only stats + full-text search.
// TDD: tests written before implementation.
//
// The module under test reads `data/skill-vectors.json` from
// `process.cwd()`. We redirect cwd to a tmp directory containing a 3-record
// fixture so the tests stay fast and deterministic. The `VectorStore`
// argument is only used for `getVectorBuffer().length / getDimension()` —
// we provide a hand-rolled fake.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { VectorStore } from './vector-store';

// ---------------- Fixture (3 records, dim=4) ----------------

const FIXTURE = {
  version: 1,
  dimension: 4,
  count: 3,
  vectors: [
    {
      id: 'a',
      text: '晋升答辩准备清单：项目复盘 + 业绩量化 + 答辩话术',
      retrieval_text: '晋升 答辩 准备 清单 项目 复盘 业绩 量化',
      metadata: JSON.stringify({
        category: 'promotion',
        skillName: '晋升答辩',
        book: '大厂晋升指南',
      }),
      book: '大厂晋升指南',
      filename: 'file-a.md',
      doc_title: '晋升答辩',
      section_title: '答辩准备',
      title_path: '晋升答辩/答辩准备',
      keyword_text: '晋升 答辩 项目 复盘 业绩 量化',
      source_path: '大厂晋升指南/file-a.md',
      chunk_index: 0,
      vector: [1, 0, 0, 0],
      sparse_vector: null,
    },
    {
      id: 'b',
      text: '技术面试现场：算法题、行为面、系统设计三轮考察要点',
      retrieval_text: '技术 面试 现场 算法 行为 系统设计',
      metadata: JSON.stringify({
        category: 'interview',
        skillName: '面试现场',
        book: '面试现场',
      }),
      book: '面试现场',
      filename: 'file-b.md',
      doc_title: '面试现场',
      section_title: '三轮考察',
      title_path: '面试现场/三轮考察',
      keyword_text: '面试 现场 算法 行为 系统设计',
      source_path: '面试现场/file-b.md',
      chunk_index: 0,
      vector: [0, 1, 0, 0],
      sparse_vector: null,
    },
    {
      id: 'c',
      text: '晋升通道与职级体系：P6 到 P7 的能力差异与材料撰写',
      retrieval_text: '晋升 通道 职级 体系 能力 差异',
      metadata: JSON.stringify({
        category: 'promotion',
        skillName: '晋升答辩',
        book: '大厂晋升指南',
      }),
      book: '大厂晋升指南',
      filename: 'file-c.md',
      doc_title: '晋升通道',
      section_title: 'P6-P7 差异',
      title_path: '晋升通道/P6-P7 差异',
      keyword_text: '晋升 通道 职级 体系 能力 差异',
      source_path: '大厂晋升指南/file-c.md',
      chunk_index: 1,
      vector: [-1, 0, 0, 0],
      sparse_vector: null,
    },
  ],
};

// ---------------- Tmp workspace setup ----------------

let tmpDir: string;
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), 'admin-knowledge-test-'));
  mkdirSync(join(tmpDir, 'data'), { recursive: true });
  writeFileSync(join(tmpDir, 'data', 'skill-vectors.json'), JSON.stringify(FIXTURE), 'utf8');
  process.chdir(tmpDir);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------- Test fake store ----------------

function makeFakeStore(dim: number, count: number): VectorStore {
  const buf = new Float32Array(count * dim);
  return {
    load: async () => undefined,
    search: () => [],
    getVectorBuffer: () => buf,
    getLastDenseScores: () => new Map(),
    getVectorByIndex: () => Array.from(buf.slice(0, dim)),
    getIdByIndex: () => 'fake',
    getDimension: () => dim,
  };
}

// ---------------- Imports (after fixtures) ----------------

import {
  getKnowledgeStats,
  searchKnowledge,
  listByGroup,
} from './admin-knowledge';

// ---------------- Tests ----------------

describe('admin-knowledge: getKnowledgeStats', () => {
  it('returns total=3 and dimension=4 from the store, with groups sorted desc by count', async () => {
    const store = makeFakeStore(4, 3);
    const stats = await getKnowledgeStats(store);

    expect(stats.total).toBe(3);
    expect(stats.dimension).toBe(4);

    // book: 大厂晋升指南=2, 面试现场=1
    expect(stats.byBook).toEqual([
      { name: '大厂晋升指南', count: 2 },
      { name: '面试现场', count: 1 },
    ]);

    // category: promotion=2, interview=1
    expect(stats.byCategory).toEqual([
      { name: 'promotion', count: 2 },
      { name: 'interview', count: 1 },
    ]);

    // skillName: 晋升答辩=2, 面试现场=1
    expect(stats.bySkill).toEqual([
      { name: '晋升答辩', count: 2 },
      { name: '面试现场', count: 1 },
    ]);
  });
});

describe('admin-knowledge: searchKnowledge', () => {
  it('returns matching chunks for a CJK query, ordered by lexical match score', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, '晋升答辩');
    expect(results.length).toBeGreaterThan(0);
    // Both 'a' and 'c' talk about 晋升 — both should appear
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'c']);
    // 'b' (interview) should not match
    expect(results.find((r) => r.id === 'b')).toBeUndefined();
  });

  it('returns [] when no chunk matches the query', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, 'travel hotel booking airport transfer zzznomatch');
    expect(results).toEqual([]);
  });

  it('respects opts.book: filters to that book only', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, '晋升', { book: '面试现场' });
    // '面试现场' has only chunk b, and b does not contain 晋升
    expect(results).toEqual([]);
  });

  it('respects opts.skillName: filters to that skill only', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, '晋升', { skillName: '晋升答辩' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.skillName).toBe('晋升答辩');
    }
  });

  it('respects opts.category: filters to that category only', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, '晋升', { category: 'interview' });
    expect(results).toEqual([]);
  });

  it('caps the result list to opts.limit', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, '晋升', { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('preview is truncated to <= 200 chars', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, '晋升');
    for (const r of results) {
      expect(r.preview.length).toBeLessThanOrEqual(200);
    }
  });

  it('preview is the first 200 chars of the full text', async () => {
    const store = makeFakeStore(4, 3);
    const results = await searchKnowledge(store, '晋升');
    const a = results.find((r) => r.id === 'a');
    expect(a).toBeDefined();
    expect(a?.preview).toBe(FIXTURE.vectors[0].text.slice(0, 200));
  });
});

describe('admin-knowledge: listByGroup', () => {
  it('groups by book sorted desc by count, with one sample per group', async () => {
    const store = makeFakeStore(4, 3);
    const groups = await listByGroup(store, 'book');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: '大厂晋升指南', count: 2 });
    expect(groups[1]).toMatchObject({ name: '面试现场', count: 1 });
    // Each group has a sample summary
    expect(groups[0].sample).toBeDefined();
    expect(groups[0].sample.id).toMatch(/^[a-c]$/);
  });

  it('groups by skillName sorted desc by count', async () => {
    const store = makeFakeStore(4, 3);
    const groups = await listByGroup(store, 'skillName');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: '晋升答辩', count: 2 });
    expect(groups[1]).toMatchObject({ name: '面试现场', count: 1 });
  });

  it('groups by category sorted desc by count', async () => {
    const store = makeFakeStore(4, 3);
    const groups = await listByGroup(store, 'category');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: 'promotion', count: 2 });
    expect(groups[1]).toMatchObject({ name: 'interview', count: 1 });
  });

  it('respects opts.limit (number of groups returned)', async () => {
    const store = makeFakeStore(4, 3);
    const groups = await listByGroup(store, 'book', { limit: 1 });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('大厂晋升指南');
  });
});
