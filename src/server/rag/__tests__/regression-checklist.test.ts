// src/server/rag/__tests__/regression-checklist.test.ts
// 上线前回归 checklist —— RAG 可自动化项
// 对应 docs/qa/pre-release-checklist.md §2 RAG 检索链路
// 约束：所有用例基于当前代码状态可通过（已修复项验证不回归；未修复项见 checklist 手动验证）

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Mocks —— search.ts 在模块加载时 eagerly 实例化 embedder / knowledgeBase，
// 必须在 import 前 mock，否则会触发真实模型加载。
// 模式与 search.dedup.test.ts 一致。
// ---------------------------------------------------------------------------

const { semanticSearchMock } = vi.hoisted(() => ({
  semanticSearchMock: vi.fn(),
}));

vi.mock('@/server/llm/llm-client', () => ({
  LLMClient: class {
    invoke = vi.fn();
  },
}));

vi.mock('@/server/rag/embedder', () => ({
  createEmbedder: () => ({
    embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
    isReady: () => true,
  }),
}));

vi.mock('@/server/rag/knowledge-base', () => ({
  createKnowledgeBase: () => ({
    semanticSearch: semanticSearchMock,
  }),
}));

vi.mock('@/server/rag/rag-init', () => ({
  ensureVectorStoreLoaded: vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Imports（mocks 之后）
// ---------------------------------------------------------------------------

import { compressContext, semanticSearch, hybridSearch } from '@/server/rag/search';
import {
  retrieve,
  type RetrieveCache,
  type PrecomputedIntent,
} from '@/server/rag/_retrieve-internal';
import {
  CATEGORY_RULES,
  deriveCategory,
  type TopicCategory,
} from '@/server/rag/category-rules';
import { buildCitations } from '@/server/rag/suggestions';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const VECTORS_PATH = path.resolve(process.cwd(), 'data/skill-vectors.json');

const PROMOTION_CATEGORIES: TopicCategory[] = [
  '职级体系', '晋升流程', '晋升原则', '晋升答辩',
  '提名词写作', '学习方法', '能力模型', '技术能力',
];

const INTERVIEW_CATEGORIES: TopicCategory[] = [
  '自我介绍', '面试流程', '考察标准', '简历优化',
  '经历包装', '反向提问', '表达技巧', '心态调整',
  '职业规划', '薪资谈判', '招聘方视角',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockChunk {
  id: string;
  text: string;
  score: number;
  category?: string;
  skillName?: string;
}

/** 第一调用（语义）返回 semantic，第二调用（关键词）返回 keyword */
function setupTwoPass(semantic: MockChunk[], keyword: MockChunk[]): void {
  let idx = 0;
  semanticSearchMock.mockImplementation(() => {
    const batch = idx === 0 ? semantic : keyword;
    idx++;
    return Promise.resolve(batch);
  });
}

function makeMockCache(): RetrieveCache {
  const map = new Map();
  return {
    searchCache: map as unknown as RetrieveCache['searchCache'],
    getCacheKey: (q: string) => `mock-${q}`,
    getCached: () => null,
    setCache: () => {},
  };
}

function precomputed(
  strategy: PrecomputedIntent['strategy'],
  extra: Partial<PrecomputedIntent> = {},
): PrecomputedIntent {
  return { strategy, rewrittenQuery: 'test query', categoryFilter: 'all', ...extra };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('上线前回归 checklist - RAG', () => {

  // ===== 向量数据完整性（bug#8 sparse_vector 死数据） =====
  describe('向量数据完整性 (bug#8)', () => {
    it('向量数据文件 data/skill-vectors.json 存在', () => {
      expect(fs.existsSync(VECTORS_PATH)).toBe(true);
    });

    it('向量数据 count > 0（当前 608 条）', () => {
      const data = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));
      const count = typeof data.count === 'number'
        ? data.count
        : Array.isArray(data.vectors) ? data.vectors.length : 0;
      expect(count).toBeGreaterThan(0);
    });

    it('向量维度为 1024（BGE-M3）', () => {
      const data = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));
      const dim = data.dimension
        ?? (data.vectors?.[0]?.vector ? data.vectors[0].vector.length : 0);
      expect(dim).toBe(1024);
    });

    it('首条向量非全零（非死数据）', () => {
      const data = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));
      const vec = data.vectors?.[0]?.vector;
      expect(Array.isArray(vec)).toBe(true);
      const sum = vec.reduce((a: number, b: number) => a + Math.abs(b), 0);
      expect(sum).toBeGreaterThan(0);
    });
  });

  // ===== category 中文映射（历史：category 不匹配导致漏召回） =====
  describe('category 中文映射 (历史 category 不匹配)', () => {
    it('CATEGORY_RULES 覆盖晋升类（8 类）', () => {
      const matched = CATEGORY_RULES.filter(r =>
        PROMOTION_CATEGORIES.includes(r.category),
      );
      expect(matched.length).toBeGreaterThanOrEqual(8);
    });

    it('CATEGORY_RULES 覆盖面试类（11 类）', () => {
      const matched = CATEGORY_RULES.filter(r =>
        INTERVIEW_CATEGORIES.includes(r.category),
      );
      expect(matched.length).toBeGreaterThanOrEqual(11);
    });

    it('deriveCategory 命中晋升关键词返回晋升类（非通用）', () => {
      const cat = deriveCategory({ doc_title: '晋升流程入门', section_title: '晋升步骤' });
      expect(cat).not.toBe('通用');
      expect(PROMOTION_CATEGORIES).toContain(cat);
    });

    it('deriveCategory 命中面试关键词返回面试类（非通用）', () => {
      const cat = deriveCategory({ doc_title: '面试准备指南', section_title: '自我介绍' });
      expect(cat).not.toBe('通用');
      expect(INTERVIEW_CATEGORIES).toContain(cat);
    });

    it('search.ts semanticSearch 接受 promotion / interview categoryFilter', () => {
      // categoryFilter 透传到 knowledgeBase.semanticSearch 的 opts.category
      // 验证不抛错且调用参数正确
      semanticSearchMock.mockReset();
      semanticSearchMock.mockResolvedValue([]);
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      void semanticSearch('test', 5, 0.15, 'promotion');
      void semanticSearch('test', 5, 0.15, 'interview');

      expect(semanticSearchMock).toHaveBeenCalledWith(
        'test', 5, expect.objectContaining({ category: 'promotion' }),
      );
      expect(semanticSearchMock).toHaveBeenCalledWith(
        'test', 5, expect.objectContaining({ category: 'interview' }),
      );
    });
  });

  // ===== minScore 配置（历史：0.2 导致漏召回） =====
  describe('minScore 配置 (历史 0.2 导致漏召回)', () => {
    beforeEach(() => {
      semanticSearchMock.mockReset();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('semanticSearch 默认 minScore=0.15 过滤低分 chunk', async () => {
      semanticSearchMock.mockResolvedValue([
        { id: 'low', text: 'low score chunk', score: 0.10 },
        { id: 'high', text: 'high score chunk', score: 0.20 },
      ]);

      // 不传 minScore，使用默认 0.15
      const results = await semanticSearch('test', 5);

      expect(results.find(r => r.docId === 'low')).toBeUndefined();
      expect(results.find(r => r.docId === 'high')).toBeDefined();
    });

    it('retrieve 默认 minScore=0.15 过滤低分 chunk（_retrieve-internal.ts:55）', async () => {
      // 8 条不同 docId，其中 3 条低于 0.15
      const chunks: MockChunk[] = [
        { id: 'd0', text: 'content 0', score: 0.30 },
        { id: 'd1', text: 'content 1', score: 0.25 },
        { id: 'd2', text: 'content 2', score: 0.10 }, // 低于 0.15，过滤
        { id: 'd3', text: 'content 3', score: 0.08 }, // 低于 0.15，过滤
        { id: 'd4', text: 'content 4', score: 0.22 },
        { id: 'd5', text: 'content 5', score: 0.05 }, // 低于 0.15，过滤
        { id: 'd6', text: 'content 6', score: 0.18 },
        { id: 'd7', text: 'content 7', score: 0.16 },
      ];
      setupTwoPass(chunks, []);

      // 不传 params.minScore，使用默认 0.15
      const res = await retrieve('test', 5, [], undefined, makeMockCache(), precomputed('direct'));

      // 低分 chunk 不应出现
      expect(res.results.find(r => r.docId === 'd2')).toBeUndefined();
      expect(res.results.find(r => r.docId === 'd3')).toBeUndefined();
      expect(res.results.find(r => r.docId === 'd5')).toBeUndefined();
      // 高分 chunk 应保留
      expect(res.results.length).toBeGreaterThan(0);
    });
  });

  // ===== maxChars 配置（历史：3000 导致原文截断） =====
  describe('maxChars 配置 (历史 3000 导致原文截断)', () => {
    it('compressContext 默认 maxChars=5000 截断超长内容', () => {
      const long = 'A'.repeat(6000);
      const out = compressContext([{ content: long, score: 1 }]);
      // 默认 5000，截断后加 '...'，总长不超过 5050
      expect(out[0]!.content.length).toBeLessThanOrEqual(5050);
      expect(out[0]!.content.length).toBeLessThan(6000);
      expect(out[0]!.content.endsWith('...')).toBe(true);
    });

    it('compressContext 默认 5000 不截断 4500 字内容', () => {
      const content = 'B'.repeat(4500);
      const out = compressContext([{ content, score: 1 }]);
      expect(out[0]!.content).toBe(content);
    });

    it('retrieve 默认 maxChars=5000（_retrieve-internal.ts:56）', async () => {
      // 单条 6000 字内容，retrieve 默认 maxChars=5000 应截断
      setupTwoPass(
        [{ id: 'd1', text: 'C'.repeat(6000), score: 0.9 }],
        [],
      );
      const res = await retrieve('test', 5, [], undefined, makeMockCache(), precomputed('direct'));
      expect(res.results.length).toBe(1);
      expect(res.results[0]!.content.length).toBeLessThan(6000);
    });
  });

  // ===== 加权融合 / 归一化（历史：归一化归零） =====
  describe('加权融合 (历史归一化归零)', () => {
    beforeEach(() => {
      semanticSearchMock.mockReset();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('等分时分数不被归零（保留原分）', async () => {
      setupTwoPass(
        [
          { id: 'a', text: 'content a', score: 0.5 },
          { id: 'b', text: 'content b', score: 0.5 },
        ],
        [],
      );
      const results = await hybridSearch('test', 5, 0.2, undefined, 0.7);
      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBeCloseTo(0.35, 5);
      }
    });
  });

  // ===== Top-K 截取 + 去重（历史高频回归） =====
  describe('Top-K 截取 + docId 去重', () => {
    beforeEach(() => {
      semanticSearchMock.mockReset();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('retrieve 强制 Top-K=5（不超过 topK）', async () => {
      const distinct: MockChunk[] = Array.from({ length: 8 }, (_, i) => ({
        id: `d${i}`,
        text: `content ${i}`,
        score: 0.9 - i * 0.05,
      }));
      setupTwoPass(distinct, []);

      const res = await retrieve('test', 5, [], undefined, makeMockCache(), precomputed('direct'));
      expect(res.results.length).toBeLessThanOrEqual(5);
      // 分数降序
      const scores = res.results.map(r => r.score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]!).toBeGreaterThanOrEqual(scores[i]!);
      }
    });

    it('同 docId 去重保留更高分', async () => {
      // multiquery 两次 hybridSearch 返回同一 docId 不同分
      let idx = 0;
      semanticSearchMock.mockImplementation(() => {
        const batch =
          idx === 0
            ? [{ id: 'd1', text: 'shared', score: 0.5 }]
            : idx === 2
              ? [{ id: 'd1', text: 'shared', score: 0.9 }]
              : [];
        idx++;
        return Promise.resolve(batch);
      });

      const res = await retrieve('test', 5, [], undefined, makeMockCache(),
        precomputed('multiquery', { subQueries: ['q1', 'q2'] }));

      expect(res.results).toHaveLength(1);
      expect(res.results[0]!.docId).toBe('d1');
      // 0.7 * 0.9 = 0.63（更高分），非 0.7 * 0.5 = 0.35
      expect(res.results[0]!.score).toBeCloseTo(0.63, 5);
    });
  });

  // ===== 引文构建（bug#12 citation id 绑定） =====
  describe('引文构建 (bug#12)', () => {
    it('buildCitations 为每条结果生成引文，内容映射正确', () => {
      const results = [
        { content: '内容一', score: 0.9, docId: 'd1', source: 's1' },
        { content: '内容二', score: 0.8, docId: 'd2', source: 's2' },
      ];
      const citations = buildCitations(results);
      expect(citations).toHaveLength(2);
      expect(citations[0]!.content).toBe('内容一');
      expect(citations[0]!.source).toBe('s1');
      expect(citations[1]!.content).toBe('内容二');
    });

    // 注：citation.id 当前为位置序号 i+1（非 docId 绑定），属 bug#12 未修复项，
    // 见 checklist P0 §2 手动验证项。此处不断言 id 绑定方式，避免固化错误行为。
    it('buildCitations 生成唯一递增 id（当前为位置序号，待修复为 docId 绑定）', () => {
      const results = [
        { content: 'a', score: 0.9, docId: 'd1', source: 's1' },
        { content: 'b', score: 0.8, docId: 'd2', source: 's2' },
        { content: 'c', score: 0.7, docId: 'd3', source: 's3' },
      ];
      const citations = buildCitations(results);
      const ids = citations.map(c => c.id);
      expect(ids).toEqual([1, 2, 3]);
      // TODO(bug#12): 修复后改为断言 id 绑定 docId
    });
  });
});
