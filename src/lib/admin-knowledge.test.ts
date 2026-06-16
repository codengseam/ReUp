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
//   - 增加 getFrameworkSkills（8 框架 Skill + SKILL.md 读取）测试
//   - 增加 getTopicSummary（book × category 交叉表）测试

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
      text: '晋升答辩准备清单：项目复盘 + 业绩量化 + 答辩话术',
      retrieval_text: '晋升 答辩 准备 清单 项目 复盘 业绩 量化',
      metadata: JSON.stringify({
        category: 'promotion',
        skillName: '晋升答辩',
        book: '大厂晋升指南',
        topic: '晋升答辩准备清单',
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
        topic: '面试现场三轮考察',
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
        topic: 'P6-P7 职级体系差异',
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
    {
      id: 'd',
      text: '面试地图与流程：开场自我介绍、技术深度考察、反向提问收尾',
      retrieval_text: '面试 地图 流程 开场 自我介绍 深度 反问',
      metadata: JSON.stringify({
        category: '通用',
        skillName: '面试现场',
        book: '面试现场',
        topic: '面试地图与流程',
      }),
      book: '面试现场',
      filename: 'file-d.md',
      doc_title: '面试流程',
      section_title: '面试地图',
      title_path: '面试流程/面试地图',
      keyword_text: '面试 地图 流程 开场 自我介绍',
      source_path: '面试现场/file-d.md',
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

  // 为 getFrameworkSkills 准备 1 个 SKILL.md 文件，覆盖从 process.cwd() 读 skills 的路径
  const skillDir = join(tmpDir, 'skills', 'jinsheng-dicing-luoji');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    '---\nname: jinsheng-dicing-luoji\ndescription: 晋升底层逻辑\n---\n\n# 晋升底层逻辑 (test fixture)\n',
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

    // book: 大厂晋升指南=2, 面试现场=2（并列 → 字典序大 < 面）
    expect(stats.byBook).toEqual([
      { name: '大厂晋升指南', count: 2 },
      { name: '面试现场', count: 2 },
    ]);

    // category: promotion=2, interview=1, 通用=1
    // 注：Node 默认 Intl.Collator locale 下排序；'通用' 与 'interview' 的顺序取决于运行时 locale
    const catNames = stats.byCategory.map((c) => c.name).sort();
    expect(catNames).toEqual(['interview', 'promotion', '通用']);
    const catMap = new Map(stats.byCategory.map((c) => [c.name, c.count]));
    expect(catMap.get('promotion')).toBe(2);
    expect(catMap.get('interview')).toBe(1);
    expect(catMap.get('通用')).toBe(1);

    // skillName: 晋升答辩=2, 面试现场=2（并列 → 晋 < 面）
    expect(stats.bySkill).toEqual([
      { name: '晋升答辩', count: 2 },
      { name: '面试现场', count: 2 },
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
    // 按 doc_title 分组：'a'='晋升答辩'、'b'='面试现场'、'c'='晋升通道'、'd'='面试流程'
    const names = stats.byChapter.map((g) => g.name).sort();
    expect(names).toEqual(['晋升答辩', '面试现场', '晋升通道', '面试流程'].sort());
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
  it('returns matching chunks for a CJK query, ordered by lexical match score', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升答辩');
    expect(results.length).toBeGreaterThan(0);
    // Both 'a' and 'c' talk about 晋升 — both should appear
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'c']);
    // 'b' (interview) and 'd' (通用) should not match
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
    const results = await searchKnowledge(store, '晋升', { book: '面试现场' });
    // '面试现场' has chunks b and d, neither contains 晋升
    expect(results).toEqual([]);
  });

  it('respects opts.skillName: filters to that skill only', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升', { skillName: '晋升答辩' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.skillName).toBe('晋升答辩');
    }
  });

  it('respects opts.category: filters to that category only', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升', { category: 'interview' });
    expect(results).toEqual([]);
  });

  it('respects opts.topic: filters to that topic (a only)', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升', { topic: '晋升答辩准备清单' });
    // 只有 a 的 topic='晋升答辩准备清单'，且其文本含 '晋'/'升'
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
    expect(results[0].topic).toBe('晋升答辩准备清单');
  });

  it('respects opts.docTitle: filters to that chapter', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升', { docTitle: '晋升通道' });
    // 只有 c 的 docTitle='晋升通道'，且其文本含 '晋'/'升'
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('c');
    expect(results[0].docTitle).toBe('晋升通道');
  });

  it('respects opts.sectionTitle: filters to that section', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升', { sectionTitle: '答辩准备' });
    // 只有 a 的 sectionTitle='答辩准备'，且其文本含 '晋'/'升'
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
    expect(results[0].sectionTitle).toBe('答辩准备');
  });

  it('caps the result list to opts.limit', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升', { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('preview is truncated to <= 200 chars', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升');
    for (const r of results) {
      expect(r.preview.length).toBeLessThanOrEqual(200);
    }
  });

  it('preview is the first 200 chars of the full text', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升');
    const a = results.find((r) => r.id === 'a');
    expect(a).toBeDefined();
    expect(a?.preview).toBe(FIXTURE.vectors[0].text.slice(0, 200));
  });

  it('returned summary includes the topic field', async () => {
    const store = makeFakeStore(4, 4);
    const results = await searchKnowledge(store, '晋升');
    for (const r of results) {
      expect(typeof r.topic).toBe('string');
    }
    const a = results.find((r) => r.id === 'a');
    expect(a?.topic).toBe('晋升答辩准备清单');
  });
});

describe('admin-knowledge: listByGroup', () => {
  it('groups by book sorted desc by count, with one sample per group', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'book');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: '大厂晋升指南', count: 2 });
    expect(groups[1]).toMatchObject({ name: '面试现场', count: 2 });
    expect(groups[0].sample).toBeDefined();
    expect(groups[0].sample.id).toMatch(/^[a-d]$/);
  });

  it('groups by skillName sorted desc by count', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'skillName');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ name: '晋升答辩', count: 2 });
    expect(groups[1]).toMatchObject({ name: '面试现场', count: 2 });
  });

  it('groups by category sorted desc by count', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'category');
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ name: 'promotion', count: 2 });
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
    expect(names).toEqual(new Set(['晋升答辩', '面试现场', '晋升通道', '面试流程']));
  });

  it('groups by sectionTitle — 4 unique sections', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'sectionTitle');
    expect(groups).toHaveLength(4);
    const names = new Set(groups.map((g) => g.name));
    expect(names).toEqual(new Set(['答辩准备', '三轮考察', 'P6-P7 差异', '面试地图']));
  });

  it('groups by topic — 4 unique topics', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'topic');
    expect(groups).toHaveLength(4);
    const names = new Set(groups.map((g) => g.name));
    expect(names).toEqual(new Set([
      '晋升答辩准备清单',
      '面试现场三轮考察',
      'P6-P7 职级体系差异',
      '面试地图与流程',
    ]));
  });

  it('respects opts.limit (number of groups returned)', async () => {
    const store = makeFakeStore(4, 4);
    const groups = await listByGroup(store, 'book', { limit: 1 });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('大厂晋升指南');
  });
});

// ---------------- Phase 2A: new APIs ----------------

describe('admin-knowledge: getFrameworkSkills', () => {
  it('returns 8 framework skills (4 promotion + 4 interview) from data/skills.json', async () => {
    const skills = await getFrameworkSkills();
    expect(skills).toHaveLength(8);
    const promo = skills.filter((s) => s.category === 'promotion');
    const interview = skills.filter((s) => s.category === 'interview');
    expect(promo).toHaveLength(4);
    expect(interview).toHaveLength(4);
  });

  it('each skill carries id / name / category / trigger / framework / steps', async () => {
    const skills = await getFrameworkSkills();
    for (const s of skills) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(['promotion', 'interview']).toContain(s.category);
      expect(typeof s.trigger).toBe('string');
      expect(typeof s.framework).toBe('string');
      expect(Array.isArray(s.steps)).toBe(true);
      expect(s.steps.length).toBeGreaterThan(0);
    }
  });

  it('reads SKILL.md markdown for the existing fixture skill (jinsheng-dicing-luoji)', async () => {
    const skills = await getFrameworkSkills();
    const target = skills.find((s) => s.id === 'jinsheng-dicing-luoji');
    expect(target).toBeDefined();
    expect(target!.markdown).not.toBeNull();
    expect(target!.markdown).toContain('晋升底层逻辑 (test fixture)');
    expect(target!.markdownPath).toContain('jinsheng-dicing-luoji');
    expect(target!.markdownPath!.endsWith('SKILL.md')).toBe(true);
  });

  it('returns markdown=null for skills without a SKILL.md file', async () => {
    const skills = await getFrameworkSkills();
    // 7 个 skill 没有对应的 SKILL.md（只有 jinsheng-dicing-luoji 被 fixture 准备）
    const missing = skills.filter((s) => s.id !== 'jinsheng-dicing-luoji');
    expect(missing.length).toBe(7);
    for (const s of missing) {
      expect(s.markdown).toBeNull();
      expect(s.markdownPath).toBeNull();
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
  it('returns 2 books in byBookCategory cross-tab (大厂晋升指南 + 面试现场)', async () => {
    const summary = await getTopicSummary();
    expect(summary.byBookCategory).toHaveLength(2);
    const books = summary.byBookCategory.map((b) => b.book).sort();
    expect(books).toEqual(['大厂晋升指南', '面试现场']);
  });

  it('大厂晋升指南 has promotion=2; 面试现场 has interview=1 + 通用=1', async () => {
    const summary = await getTopicSummary();
    const promo = summary.byBookCategory.find((b) => b.book === '大厂晋升指南');
    expect(promo).toBeDefined();
    const promoMap = new Map(promo!.categories.map((c) => [c.category, c.count]));
    expect(promoMap.get('promotion')).toBe(2);

    const interview = summary.byBookCategory.find((b) => b.book === '面试现场');
    expect(interview).toBeDefined();
    const intMap = new Map(interview!.categories.map((c) => [c.category, c.count]));
    expect(intMap.get('interview')).toBe(1);
    expect(intMap.get('通用')).toBe(1);
  });

  it('byBook totals: 大厂晋升指南=2, 面试现场=2', async () => {
    const summary = await getTopicSummary();
    const map = new Map(summary.byBook.map((b) => [b.name, b.total]));
    expect(map.get('大厂晋升指南')).toBe(2);
    expect(map.get('面试现场')).toBe(2);
  });

  it('byCategory totals: promotion=2, interview=1, 通用=1', async () => {
    const summary = await getTopicSummary();
    const map = new Map(summary.byCategory.map((b) => [b.name, b.total]));
    expect(map.get('promotion')).toBe(2);
    expect(map.get('interview')).toBe(1);
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
