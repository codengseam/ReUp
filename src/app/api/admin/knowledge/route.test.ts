// src/app/api/admin/knowledge/route.test.ts
// ReUp v2 Phase 1.5: admin knowledge endpoint — TDD: tests before implementation.
//
// The route reads from `@/lib/admin-knowledge` and `@/lib/rag-init`. We mock
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

vi.mock('@/lib/admin-knowledge', () => ({
  getKnowledgeStats: mockGetKnowledgeStats,
  searchKnowledge: mockSearchKnowledge,
  listByGroup: mockListByGroup,
  getTopicSummary: mockGetTopicSummary,
}));

vi.mock('@/lib/rag-init', () => ({
  ensureVectorStoreLoaded: mockEnsureVectorStoreLoaded,
}));

// Provide a fake VectorStore instance for the route to use.
const { fakeStore } = vi.hoisted(() => ({
  fakeStore: { getDimension: () => 1024, getVectorBuffer: () => new Float32Array(1024 * 608) },
}));
vi.mock('@/lib/vector-store', () => ({
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
      byBook: [{ name: 'book-alpha', count: 274 }, { name: 'book-beta', count: 334 }],
      byCategory: [{ name: 'alpha', count: 274 }, { name: 'beta', count: 334 }],
      bySkill: [{ name: 'category-alpha', count: 100 }],
    });
    const res = await GET(makeReq('/api/admin/knowledge?action=stats') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(608);
    expect(body.dimension).toBe(1024);
    expect(body.byBook).toEqual([
      { name: 'book-alpha', count: 274 },
      { name: 'book-beta', count: 334 },
    ]);
  });

  it('returns 200 with { results: [...] } when ?action=search&q=...', async () => {
    mockSearchKnowledge.mockResolvedValueOnce([
      { id: 'x', preview: '示例文本', book: 'b', category: 'alpha', skillName: 's', sourcePath: 'sp', docTitle: 'd', sectionTitle: 's', chunkIndex: 0 },
    ]);
    const res = await GET(makeReq('/api/admin/knowledge?action=search&q=%E7%A4%BA%E4%BE%8B&limit=10') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe('x');
    expect(mockSearchKnowledge).toHaveBeenCalledWith(expect.anything(), '示例', expect.objectContaining({ limit: 10 }));
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
      book: 'book-alpha',
      category: 'category-alpha',
      skillName: '',
      topic: '',
      sourcePath: '',
      docTitle,
      sectionTitle: '',
      chunkIndex: 0,
    });
    mockListByGroup.mockResolvedValueOnce([
      { name: 'chapter-10', count: 2, sample: sample('c1', 'chapter-10') },
      { name: 'chapter-extra-1', count: 1, sample: sample('c2', 'chapter-extra-1') },
    ]);
    const res = await GET(makeReq('/api/admin/knowledge?action=by-chapter&limit=20') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(2);
    expect(body.groups.map((g: { name: string }) => g.name)).toEqual([
      'chapter-10',
      'chapter-extra-1',
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
      book: 'book-alpha',
      category: 'category-alpha',
      skillName: '',
      topic: '',
      sourcePath: '',
      docTitle: '',
      sectionTitle,
      chunkIndex: 0,
    });
    mockListByGroup.mockResolvedValueOnce([
      { name: 'section-alpha', count: 2, sample: sample('s1', 'section-alpha') },
      { name: 'section-beta', count: 1, sample: sample('s2', 'section-beta') },
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
      book: 'book-beta',
      category: 'category-delta',
      skillName: '',
      topic,
      sourcePath: '',
      docTitle: '',
      sectionTitle: '',
      chunkIndex: 0,
    });
    mockListByGroup.mockResolvedValueOnce([
      { name: 'topic-alpha', count: 2, sample: sample('t1', 'topic-alpha') },
      { name: 'topic-beta', count: 1, sample: sample('t2', 'topic-beta') },
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
          book: 'book-alpha',
          categories: [
            { category: 'category-alpha', count: 50 },
            { category: 'category-gamma', count: 30 },
          ],
        },
        {
          book: 'book-beta',
          categories: [
            { category: 'category-delta', count: 80 },
            { category: 'category-beta', count: 20 },
          ],
        },
      ],
      byBook: [
        { name: 'book-alpha', total: 80 },
        { name: 'book-beta', total: 100 },
      ],
      byCategory: [
        { name: 'category-delta', total: 80 },
        { name: 'category-alpha', total: 50 },
      ],
      genericCount: 0,
    });
    const res = await GET(makeReq('/api/admin/knowledge?action=topic-summary') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    // 关键：验证 byBookCategory 是 2D 矩阵
    expect(Array.isArray(body.byBookCategory)).toBe(true);
    expect(body.byBookCategory).toHaveLength(2);
    expect(body.byBookCategory[0].book).toBe('book-alpha');
    expect(Array.isArray(body.byBookCategory[0].categories)).toBe(true);
    expect(body.byBookCategory[0].categories[0]).toEqual({ category: 'category-alpha', count: 50 });
    expect(body.byBookCategory[1].book).toBe('book-beta');
    expect(body.byBookCategory[1].categories[0]).toEqual({ category: 'category-delta', count: 80 });
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
