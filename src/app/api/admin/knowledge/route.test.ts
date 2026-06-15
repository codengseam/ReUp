// src/app/api/admin/knowledge/route.test.ts
// ReUp v2 Phase 1.5: admin knowledge endpoint — TDD: tests before implementation.
//
// The route reads from `@/lib/admin-knowledge` and `@/lib/rag-init`. We mock
// both so the test never touches the real 608-chunk file and never depends on
// the (parallel) rag-init module.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------- Mocks (hoisted before imports) ----------------

const {
  mockGetKnowledgeStats,
  mockSearchKnowledge,
  mockListByGroup,
  mockEnsureVectorStoreLoaded,
} = vi.hoisted(() => ({
  mockGetKnowledgeStats: vi.fn(),
  mockSearchKnowledge: vi.fn(),
  mockListByGroup: vi.fn(),
  mockEnsureVectorStoreLoaded: vi.fn(),
}));

vi.mock('@/lib/admin-knowledge', () => ({
  getKnowledgeStats: mockGetKnowledgeStats,
  searchKnowledge: mockSearchKnowledge,
  listByGroup: mockListByGroup,
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
