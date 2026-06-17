// src/app/api/admin/knowledge/route.test.ts
// ReUp v2 Phase 1.5: admin knowledge endpoint — TDD: tests before implementation.
//
// The route reads from `@/server/db/admin-knowledge` and `@/server/rag/rag-init`. We mock
// both so the test never touches the real 608-chunk file and never depends on
// the (parallel) rag-init module.
//
// Phase 2B adds 4 new actions (by-chapter / by-section / by-topic / topic-summary);
// existing actions must remain backward-compatible.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------- Mocks (hoisted before imports) ----------------

const {
  mockGetKnowledgeStats,
  mockSearchKnowledge,
  mockListByGroup,
  mockGetTopicSummary,
  mockEnsureVectorStoreLoaded,
} = vi.hoisted(() => ({
  mockGetKnowledgeStats: vi.fn(),
  mockSearchKnowledge: vi.fn(),
  mockListByGroup: vi.fn(),
  mockGetTopicSummary: vi.fn(),
  mockEnsureVectorStoreLoaded: vi.fn(),
}));

vi.mock('@/server/db/admin-knowledge', () => ({
  getKnowledgeStats: mockGetKnowledgeStats,
  searchKnowledge: mockSearchKnowledge,
  listByGroup: mockListByGroup,
  getTopicSummary: mockGetTopicSummary,
}));

vi.mock('@/server/rag/rag-init', () => ({
  ensureVectorStoreLoaded: mockEnsureVectorStoreLoaded,
}));

// Provide a fake VectorStore instance for the route to use.
const { fakeStore } = vi.hoisted(() => ({
  fakeStore: { getDimension: () => 1024, getVectorBuffer: () => new Float32Array(1024 * 608) },
}));
vi.mock('@/server/rag/vector-store', () => ({
  createVectorStore: () => fakeStore,
}));

// ---------------- Imports (must come after vi.mock) ----------------

import { GET } from './route';

function makeReq(url: string): Request {
  return new Request(`http://localhost:8080${url}`, { method: 'GET' });
}

describe('GET /api/admin/knowledge', () => {
  // Default: ensureVectorStoreLoaded returns the shared fake store. Tests
  // that need to assert on a specific value can override via mockResolvedValueOnce.
  beforeEach(() => {
    mockEnsureVectorStoreLoaded.mockReset();
    mockEnsureVectorStoreLoaded.mockResolvedValue(fakeStore);
    mockGetTopicSummary.mockReset();
  });

  it('returns 200 with stats when ?action=stats', async () => {
    mockGetKnowledgeStats.mockResolvedValueOnce({
      total: 608,
      dimension: 1024,
      byBook: [{ name: '大厂晋升指南', count: 274 }, { name: '面试现场', count: 334 }],
      byCategory: [{ name: 'promotion', count: 274 }, { name: 'interview', count: 334 }],
      bySkill: [{ name: '晋升答辩', count: 100 }],
    });
    const res = await GET(makeReq('/api/admin/knowledge?action=stats') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(608);
    expect(body.dimension).toBe(1024);
    expect(body.byBook).toEqual([
      { name: '大厂晋升指南', count: 274 },
      { name: '面试现场', count: 334 },
    ]);
  });

  it('returns 200 with { results: [...] } when ?action=search&q=...', async () => {
    mockSearchKnowledge.mockResolvedValueOnce([
      { id: 'x', preview: '晋升答辩', book: 'b', category: 'promotion', skillName: 's', sourcePath: 'sp', docTitle: 'd', sectionTitle: 's', chunkIndex: 0 },
    ]);
    const res = await GET(makeReq('/api/admin/knowledge?action=search&q=%E6%99%8B%E5%8D%87&limit=10') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe('x');
    expect(mockSearchKnowledge).toHaveBeenCalledWith(expect.anything(), '晋升', expect.objectContaining({ limit: 10 }));
  });

  it('returns 200 with { groups: [...] } when ?action=by-book', async () => {
    mockListByGroup.mockResolvedValueOnce([
      { name: 'a', count: 5, sample: { id: 's', preview: '', book: 'a', category: '', skillName: '', sourcePath: '', docTitle: '', sectionTitle: '', chunkIndex: 0 } },
    ]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-book&limit=20') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].name).toBe('a');
    expect(mockListByGroup).toHaveBeenCalledWith(expect.anything(), 'book', expect.objectContaining({ limit: 20 }));
  });

  it('returns 200 with { groups: [...] } when ?action=by-category', async () => {
    mockListByGroup.mockResolvedValueOnce([]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-category') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toEqual([]);
    expect(mockListByGroup).toHaveBeenCalledWith(expect.anything(), 'category', expect.any(Object));
  });

  it('returns 200 with { groups: [...] } when ?action=by-skill', async () => {
    mockListByGroup.mockResolvedValueOnce([]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-skill&limit=5') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toEqual([]);
    expect(mockListByGroup).toHaveBeenCalledWith(expect.anything(), 'skillName', expect.objectContaining({ limit: 5 }));
  });

  it('returns 200 with { ok, reloadedAt, total } when ?action=reload', async () => {
    mockEnsureVectorStoreLoaded.mockResolvedValueOnce(fakeStore);
    const res = await GET(makeReq('/api/admin/knowledge?action=reload') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.reloadedAt).toBe('string');
    expect(new Date(body.reloadedAt).toString()).not.toBe('Invalid Date');
    expect(body.total).toBe(608);
  });

  // ---------------- Phase 2B: new actions ----------------

  it('returns 200 with { groups } when ?action=by-chapter (2 groups from 3 records)', async () => {
    // 3 records in 2 different doc_titles → 2 groups
    const sample = (id: string, docTitle: string) => ({
      id,
      preview: '',
      book: '大厂晋升指南',
      category: '晋升答辩',
      skillName: '',
      topic: '',
      sourcePath: '',
      docTitle,
      sectionTitle: '',
      chunkIndex: 0,
    });
    mockListByGroup.mockResolvedValueOnce([
      { name: '第10章 优化版', count: 2, sample: sample('c1', '第10章 优化版') },
      { name: '加餐一 优化版', count: 1, sample: sample('c2', '加餐一 优化版') },
    ]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-chapter&limit=20') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(2);
    expect(body.groups.map((g: { name: string }) => g.name)).toEqual([
      '第10章 优化版',
      '加餐一 优化版',
    ]);
    expect(body.groups[0].count).toBe(2);
    expect(body.groups[1].count).toBe(1);
    // 关键：确认 key 正确映射为 docTitle（不是 book）
    expect(mockListByGroup).toHaveBeenCalledWith(
      expect.anything(),
      'docTitle',
      expect.objectContaining({ limit: 20 })
    );
  });

  it('returns 200 with { groups } when ?action=by-section (2 groups from 3 records)', async () => {
    const sample = (id: string, sectionTitle: string) => ({
      id,
      preview: '',
      book: '大厂晋升指南',
      category: '晋升答辩',
      skillName: '',
      topic: '',
      sourcePath: '',
      docTitle: '',
      sectionTitle,
      chunkIndex: 0,
    });
    mockListByGroup.mockResolvedValueOnce([
      { name: '晋升 PPT 写作', count: 2, sample: sample('s1', '晋升 PPT 写作') },
      { name: '晋升流程入门', count: 1, sample: sample('s2', '晋升流程入门') },
    ]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-section&limit=20') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(2);
    expect(mockListByGroup).toHaveBeenCalledWith(
      expect.anything(),
      'sectionTitle',
      expect.objectContaining({ limit: 20 })
    );
  });

  it('returns 200 with { groups } when ?action=by-topic (2 groups from 3 records)', async () => {
    const sample = (id: string, topic: string) => ({
      id,
      preview: '',
      book: '面试现场',
      category: '面试流程',
      skillName: '',
      topic,
      sourcePath: '',
      docTitle: '',
      sectionTitle: '',
      chunkIndex: 0,
    });
    mockListByGroup.mockResolvedValueOnce([
      { name: '面试流程总览', count: 2, sample: sample('t1', '面试流程总览') },
      { name: '面试前准备', count: 1, sample: sample('t2', '面试前准备') },
    ]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-topic') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(2);
    expect(mockListByGroup).toHaveBeenCalledWith(
      expect.anything(),
      'topic',
      expect.any(Object)
    );
  });

  it('returns 200 with 2D byBookCategory matrix when ?action=topic-summary', async () => {
    // 2D 交叉表：book 内嵌 category 列表
    mockGetTopicSummary.mockResolvedValueOnce({
      byBookCategory: [
        {
          book: '大厂晋升指南',
          categories: [
            { category: '晋升答辩', count: 50 },
            { category: '晋升流程', count: 30 },
          ],
        },
        {
          book: '面试现场',
          categories: [
            { category: '面试流程', count: 80 },
            { category: '自我介绍', count: 20 },
          ],
        },
      ],
      byBook: [
        { name: '大厂晋升指南', total: 80 },
        { name: '面试现场', total: 100 },
      ],
      byCategory: [
        { name: '面试流程', total: 80 },
        { name: '晋升答辩', total: 50 },
      ],
      genericCount: 0,
    });
    const res = await GET(makeReq('/api/admin/knowledge?action=topic-summary') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    // 关键：验证 byBookCategory 是 2D 矩阵
    expect(Array.isArray(body.byBookCategory)).toBe(true);
    expect(body.byBookCategory).toHaveLength(2);
    expect(body.byBookCategory[0].book).toBe('大厂晋升指南');
    expect(Array.isArray(body.byBookCategory[0].categories)).toBe(true);
    expect(body.byBookCategory[0].categories[0]).toEqual({ category: '晋升答辩', count: 50 });
    expect(body.byBookCategory[1].book).toBe('面试现场');
    expect(body.byBookCategory[1].categories[0]).toEqual({ category: '面试流程', count: 80 });
    // 独立维度也有
    expect(body.byBook).toHaveLength(2);
    expect(body.byCategory).toHaveLength(2);
    expect(body.genericCount).toBe(0);
    expect(mockGetTopicSummary).toHaveBeenCalledTimes(1);
  });

  // ---------------- Backward compat ----------------

  it('backward-compat: existing ?action=by-book still maps key=book', async () => {
    mockListByGroup.mockResolvedValueOnce([]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-book') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toEqual([]);
    expect(mockListByGroup).toHaveBeenCalledWith(expect.anything(), 'book', expect.any(Object));
  });

  it('backward-compat: existing ?action=by-category still maps key=category', async () => {
    mockListByGroup.mockResolvedValueOnce([]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-category&limit=5') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(mockListByGroup).toHaveBeenCalledWith(
      expect.anything(),
      'category',
      expect.objectContaining({ limit: 5 })
    );
  });

  it('returns 400 { error: "bad_request" } for ?action=by-chapter with non-numeric limit', async () => {
    const res = await GET(makeReq('/api/admin/knowledge?action=by-chapter&limit=abc') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('returns 400 { error: "unknown_action" } for ?action=foo (new actions do not pollute the unknown pool)', async () => {
    const res = await GET(makeReq('/api/admin/knowledge?action=foo') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unknown_action');
  });

  it('returns 400 { error: "missing_action" } when no action param', async () => {
    const res = await GET(makeReq('/api/admin/knowledge') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_action');
  });

  it('returns 400 { error: "unknown_action" } for ?action=foo', async () => {
    const res = await GET(makeReq('/api/admin/knowledge?action=foo') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unknown_action');
  });

  it('returns 400 { error: "bad_request" } for ?action=search without q', async () => {
    const res = await GET(makeReq('/api/admin/knowledge?action=search') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('returns 400 { error: "bad_request" } for ?action=by-book with non-numeric limit', async () => {
    const res = await GET(makeReq('/api/admin/knowledge?action=by-book&limit=abc') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });
});
