// src/lib/__tests__/skill-vectors-quality.test.ts
// 真实数据质量测试 (TDD)
//
// 验证 data/skill-vectors.json 和 data/book-sources/ 的数据质量,
// 确保优化后:
// 1. 无合规声明 / frontmatter / 原材料行 / 开场白噪音
// 2. filename / section_title / doc_title 见名知义 (无"第几章优化版"等老命名)
// 3. book-sources 原文已清理 (与向量库一致)
// 4. vector 完整性 (608 chunks × 1024 dim)
// 5. category 分类合理 (无 NONE, 无空值)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const VECTORS_FILE = join(ROOT, 'data', 'skill-vectors.json');
const BOOK_SOURCES_DIR = join(ROOT, 'data', 'book-sources');

interface VectorRecord {
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
  sparse_vector: unknown;
}

interface VectorsFile {
  version: number;
  source: string;
  table: string;
  dimension: number;
  count: number;
  vectors: VectorRecord[];
}

function loadVectors(): VectorsFile {
  if (!existsSync(VECTORS_FILE)) {
    throw new Error(`data/skill-vectors.json not found at ${VECTORS_FILE}`);
  }
  return JSON.parse(readFileSync(VECTORS_FILE, 'utf8'));
}

// 噪音模式: 任何 chunk 的 text 都不应包含这些
const NOISE_PATTERNS = [
  { name: '合规声明', re: /合规声明/ },
  // frontmatter 只匹配文本开头 (正文里的 --- 分隔线不算)
  { name: 'frontmatter开始', re: /^---\n[\s\S]*?\n---\n/ },
  { name: 'frontmatter id字段', re: /^id:\s/m },
  { name: 'frontmatter title字段', re: /^title:\s/m },
  { name: 'frontmatter created字段', re: /^created:\s/m },
  { name: 'frontmatter tags字段', re: /^tags:/m },
  { name: 'frontmatter status字段', re: /^status:\s/m },
  { name: 'frontmatter ai_generated', re: /^ai_generated:\s/m },
  { name: '原材料行', re: /^>\s*原材料：/m },
  { name: '开场白-华仔', re: /你好，我是华仔/ },
];

// 老命名模式: filename/section_title/doc_title 不应包含这些
const OLD_NAME_PATTERNS = [
  { name: '第N章优化版', re: /第\d+章优化版/ },
  { name: '加餐N优化版', re: /加餐[一二三四五六七八九十]+优化版/ },
  { name: '1~3章优化版', re: /1~3章优化版/ },
  { name: '开篇词优化版', re: /开篇词优化版/ },
  { name: '数字前缀文件名', re: /^\d{2}_/ },
  { name: 'TABLE_OF_CONTENTS', re: /TABLE_OF_CONTENTS/ },
  { name: '源素材-书名', re: /《.+》-源素材/ },
];

describe('skill-vectors 数据质量', () => {
  const data = loadVectors();

  describe('基础完整性', () => {
    it('chunk 数量符合预期 (608)', () => {
      expect(data.vectors.length).toBe(608);
      expect(data.count).toBe(data.vectors.length);
    });

    it('vector 维度为 1024 (BGE-M3)', () => {
      expect(data.dimension).toBe(1024);
      for (const v of data.vectors) {
        expect(v.vector.length).toBe(1024);
      }
    });

    it('所有 chunk 有 sparse_vector 字段', () => {
      for (const v of data.vectors) {
        expect(v.sparse_vector).toBeDefined();
      }
    });

    it('所有 chunk 有非空 id', () => {
      for (const v of data.vectors) {
        expect(v.id).toBeTruthy();
        expect(v.id.length).toBeGreaterThan(0);
      }
    });
  });

  describe('text 无噪音', () => {
    for (const { name, re } of NOISE_PATTERNS) {
      it(`text 不含 "${name}"`, () => {
        const offenders = data.vectors.filter(v => re.test(v.text));
        if (offenders.length > 0) {
          const sample = offenders.slice(0, 3).map(v =>
            `  ${v.filename}#${v.chunk_index}: ${v.text.slice(0, 80).replace(/\n/g, ' ')}`
          );
          throw new Error(
            `${offenders.length} chunks 含 "${name}":\n${sample.join('\n')}`
          );
        }
      });
    }

    for (const { name, re } of NOISE_PATTERNS) {
      it(`retrieval_text 不含 "${name}"`, () => {
        const offenders = data.vectors.filter(v => re.test(v.retrieval_text));
        if (offenders.length > 0) {
          throw new Error(`${offenders.length} chunks 的 retrieval_text 含 "${name}"`);
        }
      });
    }

    it('所有 chunk 的 text 非空', () => {
      const empty = data.vectors.filter(v => v.text.trim().length === 0);
      expect(empty.length).toBe(0);
    });

    it('短 text chunk (<30字符) 占比不超过 20% (RAG 质量监控)', () => {
      const short = data.vectors.filter(v => v.text.trim().length < 30);
      const ratio = short.length / data.vectors.length;
      // 当前 112/608 ≈ 18.4%, 阈值 20% 留余量
      // 这些主要是文件标题 chunk + 正文短段落, vector 仍有效
      expect(ratio).toBeLessThan(0.20);
    });
  });

  describe('标题见名知义 (无老命名)', () => {
    for (const { name, re } of OLD_NAME_PATTERNS) {
      it(`filename 不含 "${name}"`, () => {
        const offenders = data.vectors.filter(v => re.test(v.filename));
        if (offenders.length > 0) {
          throw new Error(
            `${offenders.length} chunks 的 filename 含 "${name}": ${offenders[0].filename}`
          );
        }
      });
    }

    for (const { name, re } of OLD_NAME_PATTERNS) {
      it(`section_title 不含 "${name}"`, () => {
        const offenders = data.vectors.filter(v => re.test(v.section_title));
        if (offenders.length > 0) {
          throw new Error(
            `${offenders.length} chunks 的 section_title 含 "${name}": ${offenders[0].section_title}`
          );
        }
      });
    }

    it('filename 与 book-sources 实际文件一致', () => {
      const actualFiles = new Set<string>();
      for (const book of ['大厂晋升指南', '面试现场']) {
        const dir = join(BOOK_SOURCES_DIR, book);
        if (existsSync(dir)) {
          for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
            actualFiles.add(f);
          }
        }
      }
      const vecFiles = new Set(data.vectors.map(v => v.filename));
      const missing = [...vecFiles].filter(f => !actualFiles.has(f));
      expect(missing).toEqual([]);
    });
  });

  describe('分类合理', () => {
    it('所有 chunk 的 metadata 有 category 字段', () => {
      const noCategory = data.vectors.filter(v => {
        try {
          const m = JSON.parse(v.metadata);
          return !m.category;
        } catch {
          return true;
        }
      });
      expect(noCategory.length).toBe(0);
    });

    it('category 值都是合理的中文分类名', () => {
      const validCategories = new Set([
        // 大厂晋升指南
        '晋升认知', '晋升入门', '晋升逻辑', '职级体系', '能力模型',
        '晋升材料', '晋升陈述', '晋升答辩', '提名词写作',
        '学习方法', '源素材',
        // 面试现场
        '面试概览', '面试流程', '面试准备', '面试答疑',
        '考察标准', '自我认知', '项目表达', '简历经历',
        '自我介绍', '表达技巧', '心态调整', '反向提问',
        '职业规划', '薪资谈判',
      ]);
      const invalid = data.vectors.filter(v => {
        try {
          const m = JSON.parse(v.metadata);
          return m.category && !validCategories.has(m.category);
        } catch {
          return false;
        }
      });
      expect(invalid.length).toBe(0);
    });

    it('同一文件的所有 chunk category 一致 (文件级分类)', () => {
      const fileCats = new Map<string, Set<string>>();
      for (const v of data.vectors) {
        if (!fileCats.has(v.filename)) fileCats.set(v.filename, new Set());
        try {
          const cat = JSON.parse(v.metadata).category;
          fileCats.get(v.filename)!.add(cat);
        } catch {}
      }
      const inconsistent = [...fileCats.entries()]
        .filter(([_, cats]) => cats.size > 1);
      expect(inconsistent).toEqual([]);
    });
  });
});

describe('book-sources 原文质量', () => {
  const books = ['大厂晋升指南', '面试现场'];

  for (const book of books) {
    describe(book, () => {
      const dir = join(BOOK_SOURCES_DIR, book);
      const files = existsSync(dir)
        ? readdirSync(dir).filter(f => f.endsWith('.md'))
        : [];

      it('文件数符合预期 (大厂晋升指南=22, 面试现场=32)', () => {
        const expected = book === '大厂晋升指南' ? 22 : 32;
        expect(files.length).toBe(expected);
      });

      for (const f of files) {
        describe(f, () => {
          const content = readFileSync(join(dir, f), 'utf8');

          it('不含合规声明', () => {
            expect(content).not.toMatch(/合规声明/);
          });

          it('不含 frontmatter (--- 开头)', () => {
            expect(content).not.toMatch(/^---\n/);
          });

          it('不含原材料行', () => {
            expect(content).not.toMatch(/^>\s*原材料：/m);
          });

          it('不含开场白 "你好，我是华仔"', () => {
            expect(content).not.toMatch(/你好，我是华仔/);
          });
        });
      }
    });
  }
});
