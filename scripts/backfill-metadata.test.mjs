#!/usr/bin/env node
/**
 * scripts/backfill-metadata.test.mjs
 * ReUp v2 Phase 2: backfill-metadata.mjs 脚本测试
 * Spec: docs/superpowers/specs/2026-06-15-knowledge-metadata-restructure-design.md §5
 *
 * 覆盖点（vitest in JS mode）：
 *   - 派生函数：deriveCategory / deriveTopic / parseMetadata / serializeMetadata 单元
 *   - 集成：backfill(records) 写入 category + topic、不破坏其它 metadata 字段
 *   - 关键不变量：vector / sparse_vector / book / text / id / chunk_index 完全不变
 *   - 幂等：backfill 跑两次结果完全相同
 *   - 端到端：对真实 data/skill-vectors.json（608 条）跑 backfill，命中率 ≥ 95%
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveCategory,
  deriveTopic,
  parseMetadata,
  serializeMetadata,
  backfill,
  countByCategory,
  CATEGORY_RULES,
  PROMOTION_DOC_TITLE_HINTS,
  INTERVIEW_DOC_TITLE_HINTS,
} from './backfill-metadata.mjs';

// ---------------- 派生函数单元测试 ----------------

describe('backfill-metadata: deriveCategory 单元', () => {
  it('命中关键词 → 返回对应分类', () => {
    expect(
      deriveCategory({
        title_path: '大厂晋升指南 / 10000 小时定律的发展史',
        doc_title: '大厂晋升指南（加餐三优化版）',
        section_title: '10000 小时定律的发展史',
      })
    ).toBe('学习方法');
  });

  it('关键词未命中 + doc_title 命中 PROMOTION_DOC_TITLE_HINTS → 走 hint 兜底', () => {
    expect(
      deriveCategory({
        doc_title: '大厂晋升指南（开篇词优化版）',
      })
    ).toBe('晋升原则');
  });

  it('关键词未命中 + doc_title 命中 INTERVIEW_DOC_TITLE_HINTS → 走 hint 兜底', () => {
    expect(
      deriveCategory({
        doc_title: '29_26怎么谈薪水比较好',
      })
    ).toBe('薪资谈判');
  });

  it('关键词未命中 + doc_title 也未命中 hint → "通用"', () => {
    expect(
      deriveCategory({
        title_path: '完全无关的标题',
        doc_title: '完全不存在的 doc_title',
        section_title: '完全无关的章节',
      })
    ).toBe('通用');
  });

  it('入参全空 → "通用"（不抛错）', () => {
    expect(deriveCategory({})).toBe('通用');
  });

  it('入参字段 undefined 时按空串处理', () => {
    expect(
      deriveCategory({ title_path: undefined, doc_title: undefined, section_title: undefined })
    ).toBe('通用');
  });
});

describe('backfill-metadata: deriveTopic 单元', () => {
  it('去掉重复 book 前缀（section_title === book）', () => {
    const t = deriveTopic({
      book: '大厂晋升指南',
      doc_title: '大厂晋升指南（第10章优化版）',
      section_title: '大厂晋升指南',
    });
    expect(t).toBe('大厂晋升指南（第10章优化版）');
  });

  it('去掉"加餐N|"章节前缀', () => {
    const t = deriveTopic({
      book: '大厂晋升指南',
      doc_title: '大厂晋升指南（加餐三优化版）',
      section_title: '加餐三 | 10000 小时定律的发展史',
    });
    expect(t).toBe('10000 小时定律的发展史');
  });

  it('去掉"01|"数字章节前缀', () => {
    const t = deriveTopic({
      book: '面试现场',
      doc_title: '18_15如何做好开场给自我介绍加特效',
      section_title: '15|如何做好开场：给自我介绍加"特效"',
    });
    expect(t).toContain('如何做好开场');
  });

  it('去掉"第 N 章"前缀', () => {
    const t = deriveTopic({
      book: '大厂晋升指南',
      doc_title: '大厂晋升指南（第1章优化版）',
      section_title: '第 1 章 职级体系：你意识到级别鸿沟了吗？',
    });
    expect(t).toContain('职级体系');
  });

  it('section_title 为空时回退到 doc_title', () => {
    const t = deriveTopic({
      book: '大厂晋升指南',
      doc_title: '大厂晋升指南（第10章优化版）',
      section_title: '',
    });
    expect(t).toBe('大厂晋升指南（第10章优化版）');
  });

  it('section_title 与 doc_title 都为空时回退到 book', () => {
    const t = deriveTopic({
      book: '大厂晋升指南',
      doc_title: '',
      section_title: '',
    });
    expect(t).toBe('大厂晋升指南');
  });
});

describe('backfill-metadata: parseMetadata / serializeMetadata 单元', () => {
  it('parseMetadata 接受 JSON 字符串', () => {
    const obj = parseMetadata('{"book":"a","x":1}');
    expect(obj).toEqual({ book: 'a', x: 1 });
  });

  it('parseMetadata 接受对象（拷贝返回）', () => {
    const src = { book: 'a' };
    const out = parseMetadata(src);
    expect(out).toEqual({ book: 'a' });
    // 必须是新对象，避免引用泄漏
    out.x = 1;
    expect(src).not.toHaveProperty('x');
  });

  it('parseMetadata 接受 null / undefined / 空串 → {}', () => {
    expect(parseMetadata(null)).toEqual({});
    expect(parseMetadata(undefined)).toEqual({});
    expect(parseMetadata('')).toEqual({});
  });

  it('parseMetadata 接受非法 JSON 字符串 → {}（容错）', () => {
    expect(parseMetadata('not json')).toEqual({});
    expect(parseMetadata('{')).toEqual({});
  });

  it('serializeMetadata 输出 JSON 字符串', () => {
    const s = serializeMetadata({ category: '职级体系', topic: '测试' });
    expect(typeof s).toBe('string');
    expect(JSON.parse(s)).toEqual({ category: '职级体系', topic: '测试' });
  });

  it('serializeMetadata + parseMetadata 构成往返不丢失', () => {
    const obj = { book: 'a', x: 1, y: '中文' };
    const s = serializeMetadata(obj);
    const back = parseMetadata(s);
    expect(back).toEqual(obj);
  });
});

// ---------------- backfill 集成测试 ----------------

function makeRec(over = {}) {
  return {
    id: 'rec-1',
    text: '正文',
    retrieval_text: '检索正文',
    book: '大厂晋升指南',
    filename: 'x.md',
    source_path: '大厂晋升指南/x.md',
    doc_title: '大厂晋升指南（第10章优化版）',
    section_title: '大厂晋升指南',
    title_path: '大厂晋升指南 / 第10章',
    keyword_text: '大厂晋升指南',
    chunk_index: 0,
    vector: new Array(8).fill(0.1),
    sparse_vector: { indices: [0, 1, 2], values: [0.5, 0.3, 0.2] },
    metadata: '{"book":"大厂晋升指南","chunk_index":0}',
    ...over,
  };
}

describe('backfill-metadata: backfill 集成', () => {
  it('为每条 record 写入 category + topic 字段', () => {
    const rec = makeRec();
    const [out] = backfill([rec]);
    const meta = parseMetadata(out.metadata);
    expect(meta.category).toBeDefined();
    expect(meta.topic).toBeDefined();
    // 既不是空串，也不是 undefined
    expect(meta.category).not.toBe('');
    expect(meta.topic).not.toBe('');
  });

  it('保留原有 metadata 字段（chunk_index / book / 任何自定义）', () => {
    const rec = makeRec();
    rec.metadata = JSON.stringify({
      book: '大厂晋升指南',
      chunk_index: 0,
      custom_field: 'preserved',
    });
    const [out] = backfill([rec]);
    const meta = parseMetadata(out.metadata);
    expect(meta.book).toBe('大厂晋升指南');
    expect(meta.chunk_index).toBe(0);
    expect(meta.custom_field).toBe('preserved');
    // 新增字段也在
    expect(meta.category).toBeDefined();
    expect(meta.topic).toBeDefined();
  });

  it('idempotent：跑两次结果完全相同', () => {
    const rec = makeRec();
    const a = backfill([rec]);
    const b = backfill(a);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('幂等：已有 category / topic 时也重算并覆盖', () => {
    const rec = makeRec();
    rec.metadata = JSON.stringify({
      category: 'WRONG_OLD_VALUE',
      topic: 'WRONG_OLD_TOPIC',
    });
    const [out] = backfill([rec]);
    const meta = parseMetadata(out.metadata);
    expect(meta.category).not.toBe('WRONG_OLD_VALUE');
    expect(meta.topic).not.toBe('WRONG_OLD_TOPIC');
  });

  it('metadata 字段始终是 JSON 字符串（与现有文件格式一致）', () => {
    const rec = makeRec();
    rec.metadata = '{"book":"x"}';
    const [out] = backfill([rec]);
    expect(typeof out.metadata).toBe('string');
    // 必须能反序列化
    expect(() => JSON.parse(out.metadata)).not.toThrow();
  });

  it('不破坏 vector / sparse_vector / book / text / id / chunk_index', () => {
    const rec = makeRec();
    rec.vector = [0.1, 0.2, 0.3, 0.4, 0.5];
    rec.sparse_vector = { indices: [10, 20, 30], values: [1.1, 2.2, 3.3] };
    rec.text = '原始正文内容，包含中文';
    rec.retrieval_text = '原始检索正文';
    const before = {
      vector: [...rec.vector],
      sparse_vector: JSON.parse(JSON.stringify(rec.sparse_vector)),
      text: rec.text,
      retrieval_text: rec.retrieval_text,
      book: rec.book,
      id: rec.id,
      chunk_index: rec.chunk_index,
    };
    const [out] = backfill([rec]);
    expect(out.vector).toEqual(before.vector);
    expect(out.sparse_vector).toEqual(before.sparse_vector);
    expect(out.text).toBe(before.text);
    expect(out.retrieval_text).toBe(before.retrieval_text);
    expect(out.book).toBe(before.book);
    expect(out.id).toBe(before.id);
    expect(out.chunk_index).toBe(before.chunk_index);
  });

  it('处理空 / 缺字段 record（不抛错）', () => {
    const recs = [
      {},
      { metadata: '' },
      { metadata: 'not json' },
      { metadata: '{}' },
    ];
    expect(() => backfill(recs)).not.toThrow();
    for (const r of backfill(recs)) {
      const m = parseMetadata(r.metadata);
      expect(m.category).toBe('通用');
      // topic 至少是空串
      expect(typeof m.topic).toBe('string');
    }
  });

  it('countByCategory 按 metadata.category 统计', () => {
    const recs = [
      makeRec({ metadata: JSON.stringify({ category: 'A' }) }),
      makeRec({ metadata: JSON.stringify({ category: 'A' }) }),
      makeRec({ metadata: JSON.stringify({ category: 'B' }) }),
    ];
    const counts = countByCategory(recs);
    expect(counts.A).toBe(2);
    expect(counts.B).toBe(1);
  });
});

// ---------------- 规则表闭包 / 一致性 ----------------

describe('backfill-metadata: 规则表闭包', () => {
  it('CATEGORY_RULES 包含 19 细分类 + 通用 = 20 条', () => {
    expect(CATEGORY_RULES).toHaveLength(20);
    const cats = new Set(CATEGORY_RULES.map((r) => r.category));
    expect(cats.size).toBe(20);
    expect(cats.has('通用')).toBe(true);
  });

  it('PROMOTION_DOC_TITLE_HINTS 的值都是合法 category', () => {
    const valid = new Set(CATEGORY_RULES.map((r) => r.category));
    for (const v of Object.values(PROMOTION_DOC_TITLE_HINTS)) {
      expect(valid.has(v)).toBe(true);
    }
  });

  it('INTERVIEW_DOC_TITLE_HINTS 的值都是合法 category', () => {
    const valid = new Set(CATEGORY_RULES.map((r) => r.category));
    for (const v of Object.values(INTERVIEW_DOC_TITLE_HINTS)) {
      expect(valid.has(v)).toBe(true);
    }
  });
});

// ---------------- 端到端：真实数据命中率 ----------------

describe('backfill-metadata: 端到端（真实 data/skill-vectors.json）', () => {
  // 这个 case 依赖项目根的 data/skill-vectors.json 存在；本地 dev 环境一定在。
  // 用 process.cwd() 解析，不依赖相对路径常量。
  const DATA_PATH = resolve(process.cwd(), 'data/skill-vectors.json');

  function loadReal() {
    const raw = readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  }

  // 当 data/skill-vectors.json 被清空为空模板（count=0, vectors=[]）时，
  // 端到端测试无法验证真实数据，跳过它们而不是失败。
  const realIsEmpty = loadReal().vectors.length === 0;

  it('对全部 608 条 record 跑 backfill：命中率 ≥ 95%', ({ skip }) => {
    if (realIsEmpty) skip('skipped: skill-vectors.json is empty');
    const data = loadReal();
    expect(Array.isArray(data.vectors)).toBe(true);
    const out = backfill(data.vectors);
    const counts = countByCategory(out);
    const total = out.length;
    const general = counts['通用'] || 0;
    const hit = total - general;
    const rate = (hit / total) * 100;
    // 打印一下方便排查（失败时也会显示）
    console.log(`[backfill hit-rate] ${hit} / ${total} = ${rate.toFixed(2)}% (通用=${general})`);
    expect(rate).toBeGreaterThanOrEqual(95);
  });

  it('端到端：所有 record 都有 category + topic 字段', ({ skip }) => {
    if (realIsEmpty) skip('skipped: skill-vectors.json is empty');
    const data = loadReal();
    const out = backfill(data.vectors);
    for (const rec of out) {
      const m = parseMetadata(rec.metadata);
      expect(typeof m.category).toBe('string');
      expect(m.category).not.toBe('');
      expect(typeof m.topic).toBe('string');
    }
  });

  it('端到端：vector / sparse_vector 字节完全保留（按 id 抽样比对）', ({ skip }) => {
    if (realIsEmpty) skip('skipped: skill-vectors.json is empty');
    const data = loadReal();
    const originalById = new Map(data.vectors.map((r) => [r.id, r]));
    const out = backfill(data.vectors);
    expect(out.length).toBe(data.vectors.length);
    for (const rec of out) {
      const orig = originalById.get(rec.id);
      expect(orig).toBeDefined();
      expect(rec.vector).toEqual(orig.vector);
      expect(rec.sparse_vector).toEqual(orig.sparse_vector);
      expect(rec.text).toBe(orig.text);
      expect(rec.book).toBe(orig.book);
    }
  });
});
