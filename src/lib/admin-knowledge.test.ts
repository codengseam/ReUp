// src/lib/admin-knowledge.test.ts
// ReUp v2 Phase 1.5: admin knowledge tab read-only stats + full-text search.
// TDD: tests written before implementation.
//
// The module under test reads `data/skill-vectors.json` from
// `process.cwd()`. We redirect cwd to a tmp directory containing a 4-record
// fixture so the tests stay fast and deterministic. The `VectorStore`
// argument is only used for `getVectorBuffer().length / getDimension()` —
// we provide a hand-rolled fake.
//
// Phase 2A extension:
//   - fixture 扩展为 4 条记录（含 1 条 通用），并补 topic 字段
//   - 增加 byChapter / bySection / byTopic 聚合测试
//   - 增加 searchKnowledge 的 topic / docTitle / sectionTitle 过滤测试
//   - 增加 getFrameworkSkills（1 示例 Skill + SKILL.md 读取）测试
//   - 增加 getTopicSummary（book × category 交叉表）测试
//
// 注：fixture 数据已通用化（alpha / beta / 通用），不再绑定域特定内容。
// 排序约定：Node.js 默认 localeCompare 在本环境下 ASCII 排在 CJK 前
// （即 'beta' < '通用'）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { VectorStore } from './vector-store';

// ---------------- Fixture (4 records, dim=4) ----------------

const FIXTURE = {
  version: 1,
  dimension: 4,
  count: 4,
  vectors: [
    {
      id: 'a',
      text: 'alpha topic a: overview of alpha approach with key points and examples',
      retrieval_text: 'alpha topic a overview approach key points examples',
      metadata: JSON.stringify({
        category: 'alpha',
        skillName: 'alpha-skill',
        book: 'book-alpha',
        topic: 'topic-a',
      }),
      book: 'book-alpha',
      filename: 'file-a.md',
      doc_title: 'doc-a',
      section_title: 'section-a',
      title_path: 'doc-a/section-a',
      keyword_text: 'alpha topic a overview approach',
      source_path: 'book-alpha/file-a.md',
      chunk_index: 0,
      vector: [1, 0, 0, 0],
      sparse_vector: null,
    },
    {
      id: 'b',
      text: 'beta topic b: overview of beta approach with key points and examples',
      retrieval_text: 'beta topic b overview approach key points examples',
      metadata: JSON.stringify({
        category: 'beta',
        skillName: 'beta-skill',
        book: 'book-beta',
        topic: 'topic-b',
      }),
      book: 'book-beta',
      filename: 'file-b.md',
      doc_title: 'doc-b',
      section_title: 'section-b',
      title_path: 'doc-b/section-b',
      keyword_text: 'beta topic b overview approach',
      source_path: 'book-beta/file-b.md',
      chunk_index: 0,
      vector: [0, 1, 0, 0],
      sparse_vector: null,
    },
    {
      id: 'c',
      text: 'alpha topic c: deeper dive into alpha methods and detailed examples',
      retrieval_text: 'alpha topic c deeper dive methods detailed examples',
      metadata: JSON.stringify({
        category: 'alpha',
        skillName: 'alpha-skill',
        book: 'book-alpha',
        topic: 'topic-c',
      }),
      book: 'book-alpha',
      filename: 'file-c.md',
      doc_title: 'doc-c',
      section_title: 'section-c',
      title_path: 'doc-c/section-c',
      keyword_text: 'alpha topic c deeper dive methods',
      source_path: 'book-alpha/file-c.md',
      chunk_index: 1,
      vector: [-1, 0, 0, 0],
      sparse_vector: null,
    },
    {
      id: 'd',
      text: 'beta topic d: general flow and overview for beta context and notes',
      retrieval_text: 'beta topic d general flow overview context notes',
      metadata: JSON.stringify({
        category: '通用',
        skillName: 'beta-skill',
        book: 'book-beta',
        topic: 'topic-d',
      }),
      book: 'book-beta',
      filename: 'file-d.md',
      doc_title: 'doc-d',
      section_title: 'section-d',
      title_path: 'doc-d/section-d',
      keyword_text: 'beta topic d general flow overview',
      source_path: 'book-beta/file-d.md',
      chunk_index: 2,
      vector: [0, 0, 1, 0],
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

  // 为 getFrameworkSkills 准备 1 个 SKILL.md 文件，覆盖从 process.cwd() 读 skills 的路径。
  // data/skills.json 通用化后仅含 1 个 example-skill，fixture 在此为其准备 SKILL.md。
  const skillDir = join(tmpDir, 'skills', 'example-skill');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    '---\nname: example-skill\ndescription: 示例 Skill (test fixture)\n---\n\n# 示例 Skill (test fixture)\n',
    'utf8'
  );

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
  getFrameworkSkills,
  getTopicSummary,
} from './admin-knowledge';

// ---------------- Existing tests (unchanged semantics, 4-record fixture) ----------------

describe('admin-knowledge: getKnowledgeStats', () => {
  it('returns total=4 and dimension=4 from the store, with groups sorted desc by count', async () => {
    const store = makeFakeStore(4, 4);
    const stats = await getKnowledgeStats(store);

    expect(stats.total).toBe(4);
    expect(stats.dimension).toBe(4);

    // book: book-alpha=2, book-beta=2（并列 → 字典序 book-alpha < book-beta）
    expect(stats.byBook).toEqual([
      { name: 'book-alpha', count: 2 },
      { name: 'book-beta', count: 2 },
    ]);

    // category: alpha=2, beta=1, 通用=1
    // 注：Node 默认 localeCompare 在本环境下 ASCII 排在 CJK 前；'beta' < '通用'
    expect(stats.byCategory).toEqual([
      { name: 'alpha', count: 2 },
      { name: 'beta', count: 1 },
      { name: '通用', count: 1 },
    ]);

    // skillName: alpha-skill=2, beta-skill=2（并列 → alpha-skill < beta-skill）
    expect(stats.bySkill).toEqual([
      { name: 'alpha-skill', count: 2 },
      { name: 'beta-skill', count: 2 },
    ]);
  });

  it('returns byChapter (group by doc_title) with 4 unique chapters each count 1', async () => {
    const store = makeFakeStore(4, 4);
    const stats = await getKnowledgeStats(store);
    // 4 条记录 4 个不同 doc_title
    expect(stats.byChapter).toHaveLength(4);
    for (const g of stats.byChapter) {
      expect(g.count).toBe(1);
    }
    // 按 doc_title 分组：'a'='doc-a'、'b'='doc-b'、'c'='doc-c'、'd'='doc-d'
    const names = stats.byChapter.map((g) => g.name).sort();
    expect(names).toEqual(['doc-a', 'doc-b', 'doc-c', 'doc-d'].sort());
  });

  it('returns bySection (group by section_title) with 4 unique sections each count 1', async () => {
    const store = makeFakeStore(4, 4);
    const stats = await getKnowledgeStats(store);
    expect(stats.bySection).toHaveLength(4);
    for (const g of stats.bySection) {
      expect(g.count).toBe(1);
    }
  });
});

describe('admin-knowledge: searchKnowledge', () => {
  it('returns matching chunks for a query, ordered by lexical match score', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha');
    expect(results.length).toBeGreaterThan(0);
    // Both 'a' and 'c' talk about alpha — both should appear
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'c']);
    // 'b' (beta) and 'd' (通用) should not match
    expect(results.find((r) => r.id === 'b')).toBeUndefined();
    expect(results.find((r) => r.id === 'd')).toBeUndefined();
  });

  it('returns [] when no chunk matches the query', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'travel hotel booking airport transfer zzznomatch');
    expect(results).toEqual([]);
  });

  it('respects opts.book: filters to that book only', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha', { book: 'book-beta' });
    // 'book-beta' has chunks b and d, neither contains alpha
    expect(results).toEqual([]);
  });

  it('respects opts.skillName: filters to that skill only', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha', { skillName: 'alpha-skill' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.skillName).toBe('alpha-skill');
    }
  });

  it('respects opts.category: filters to that category only', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha', { category: 'beta' });
    expect(results).toEqual([]);
  });

  it('respects opts.topic: filters to that topic (a only)', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha', { topic: 'topic-a' });
    // 只有 a 的 topic='topic-a'，且其文本含 'alpha'
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
    expect(results[0].topic).toBe('topic-a');
  });

  it('respects opts.docTitle: filters to that chapter', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha', { docTitle: 'doc-c' });
    // 只有 c 的 docTitle='doc-c'，且其文本含 'alpha'
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('c');
    expect(results[0].docTitle).toBe('doc-c');
  });

  it('respects opts.sectionTitle: filters to that section', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha', { sectionTitle: 'section-a' });
    // 只有 a 的 sectionTitle='section-a'，且其文本含 'alpha'
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
    expect(results[0].sectionTitle).toBe('section-a');
  });

  it('caps the result list to opts.limit', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha', { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('preview is truncated to <= 200 chars', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha');
    for (const r of results) {
      expect(r.preview.length).toBeLessThanOrEqual(200);
    }
  });

  it('preview is the first 200 chars of the full text', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha');
    const a = results.find((r) => r.id === 'a');
    expect(a).toBeDefined();
    expect(a?.preview).toBe(FIXTURE.vectors[0].text.slice(0, 200));
  });

  it('returned summary includes the topic field', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, 'alpha');
    for (const r of results) {
      expect(typeof r.topic).toBe('string');
    }
    const a = results.find((r) => r.id === 'a');
    expect(a?.topic).toBe('topic-a');
  });
});

describe('admin-knowledge: listByGroup', () => {
  it('groups by book sorted desc by count, with one sample per group', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'book');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: 'book-alpha', count: 2 });
    expect(groups[1]).toMatchObject({ name: 'book-beta', count: 2 });
    expect(groups[0].sample).toBeDefined();
    expect(groups[0].sample.id).toMatch(/^[a-d]$/);
  });

  it('groups by skillName sorted desc by count', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'skillName');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: 'alpha-skill', count: 2 });
    expect(groups[1]).toMatchObject({ name: 'beta-skill', count: 2 });
  });

  it('groups by category sorted desc by count', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'category');
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ name: 'alpha', count: 2 });
  });

  it('groups by docTitle (chapter) — 4 unique chapters', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'docTitle');
    expect(groups).toHaveLength(4);
    for (const g of groups) {
      expect(g.count).toBe(1);
      expect(g.sample.id).toMatch(/^[a-d]$/);
    }
    const names = new Set(groups.map((g) => g.name));
    expect(names).toEqual(new Set(['doc-a', 'doc-b', 'doc-c', 'doc-d']));
  });

  it('groups by sectionTitle — 4 unique sections', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'sectionTitle');
    expect(groups).toHaveLength(4);
    const names = new Set(groups.map((g) => g.name));
    expect(names).toEqual(new Set(['section-a', 'section-b', 'section-c', 'section-d']));
  });

  it('groups by topic — 4 unique topics', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'topic');
    expect(groups).toHaveLength(4);
    const names = new Set(groups.map((g) => g.name));
    expect(names).toEqual(new Set([
      'topic-a',
      'topic-b',
      'topic-c',
      'topic-d',
    ]));
  });

  it('respects opts.limit (number of groups returned)', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'book', { limit: 1 });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('book-alpha');
  });
});

// ---------------- Phase 2A: new APIs ----------------

describe('admin-knowledge: getFrameworkSkills', () => {
  it('returns 1 example skill from data/skills.json', async () => {
    const skills = await getFrameworkSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('example-skill');
  });

  it('each skill carries id / name / category / trigger / framework / steps', async () => {
    const skills = await getFrameworkSkills();
    for (const s of skills) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(['general']).toContain(s.category);
      expect(typeof s.trigger).toBe('string');
      expect(typeof s.framework).toBe('string');
      expect(Array.isArray(s.steps)).toBe(true);
      expect(s.steps.length).toBeGreaterThan(0);
    }
  });

  it('reads SKILL.md markdown for the existing fixture skill (example-skill)', async () => {
    const skills = await getFrameworkSkills();
    const target = skills.find((s) => s.id === 'example-skill');
    expect(target).toBeDefined();
    expect(target!.markdown).not.toBeNull();
    expect(target!.markdown).toContain('示例 Skill (test fixture)');
    expect(target!.markdownPath).toContain('example-skill');
    expect(target!.markdownPath!.endsWith('SKILL.md')).toBe(true);
  });

  it('example-skill has a SKILL.md file (markdown is not null)', async () => {
    const skills = await getFrameworkSkills();
    // 通用化后仅 1 个 example-skill，fixture 已为其准备 SKILL.md
    expect(skills).toHaveLength(1);
    for (const s of skills) {
      expect(s.markdown).not.toBeNull();
      expect(s.markdownPath).not.toBeNull();
    }
  });

  it('steps array is a defensive copy (mutating returned steps does not affect source)', async () => {
    const skills = await getFrameworkSkills();
    const s = skills[0];
    const originalLength = s.steps.length;
    s.steps.push('mutated');
    // 重新调用应得到原始长度（说明每次构造时复制）
    const skills2 = await getFrameworkSkills();
    const s2 = skills2.find((x) => x.id === s.id);
    expect(s2!.steps.length).toBe(originalLength);
  });
});

describe('admin-knowledge: getTopicSummary', () => {
  it('returns 2 books in byBookCategory cross-tab (book-alpha + book-beta)', async () => {
    const summary = await getTopicSummary();
    expect(summary.byBookCategory).toHaveLength(2);
    const books = summary.byBookCategory.map((b) => b.book).sort();
    expect(books).toEqual(['book-alpha', 'book-beta']);
  });

  it('book-alpha has alpha=2; book-beta has beta=1 + 通用=1', async () => {
    const summary = await getTopicSummary();
    const alpha = summary.byBookCategory.find((b) => b.book === 'book-alpha');
    expect(alpha).toBeDefined();
    const alphaMap = new Map(alpha!.categories.map((c) => [c.category, c.count]));
    expect(alphaMap.get('alpha')).toBe(2);

    const beta = summary.byBookCategory.find((b) => b.book === 'book-beta');
    expect(beta).toBeDefined();
    const betaMap = new Map(beta!.categories.map((c) => [c.category, c.count]));
    expect(betaMap.get('beta')).toBe(1);
    expect(betaMap.get('通用')).toBe(1);
  });

  it('byBook totals: book-alpha=2, book-beta=2', async () => {
    const summary = await getTopicSummary();
    const map = new Map(summary.byBook.map((b) => [b.name, b.total]));
    expect(map.get('book-alpha')).toBe(2);
    expect(map.get('book-beta')).toBe(2);
  });

  it('byCategory totals: alpha=2, beta=1, 通用=1', async () => {
    const summary = await getTopicSummary();
    const map = new Map(summary.byCategory.map((b) => [b.name, b.total]));
    expect(map.get('alpha')).toBe(2);
    expect(map.get('beta')).toBe(1);
    expect(map.get('通用')).toBe(1);
  });

  it('genericCount counts records with category=通用 (1 in this fixture)', async () => {
    const summary = await getTopicSummary();
    expect(summary.genericCount).toBe(1);
  });

  it('categories within each book are sorted desc by count', async () => {
    const summary = await getTopicSummary();
    for (const b of summary.byBookCategory) {
      for (let i = 1; i < b.categories.length; i++) {
        expect(b.categories[i - 1].count).toBeGreaterThanOrEqual(b.categories[i].count);
      }
    }
  });
});
