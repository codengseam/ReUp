// src/lib/vector-store.test.ts
// ReUp v2 Phase 1, V1-V3: in-memory vector store with cosine + composite scoring.
// TDD: tests written before implementation.
//
// Composite score formula (from spec §5.2):
//   composite = 0.55 * rerank + 0.20 * dense + 0.15 * keyword + 0.10 * lexical
//   - dense   = cosine similarity
//   - rerank  = cosine similarity (placeholder; real reranker ships in 5.3)
//   - keyword = hit ratio of `keyword_text` tokens vs query tokens
//   - lexical = Jaccard of bag-of-words between query and text+retrieval_text

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createVectorStore, type VectorStore } from './vector-store';

// ---------------- Inline fixture (3 vectors, dim=4) ----------------

interface FixtureRecord {
  id: string;
  text: string;
  retrieval_text: string;
  metadata: string; // JSON string (matches the on-disk shape)
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

const FIXTURE: FixtureFile = {
  version: 1,
  dimension: 4,
  count: 3,
  vectors: [
    {
      id: 'a',
      text: 'alpha beta gamma',
      retrieval_text: 'alpha beta retrieval',
      metadata: JSON.stringify({
        category: 'promotion',
        skillName: 'skill-1',
        book: 'book-a',
      }),
      book: 'book-a',
      filename: 'file-a.md',
      doc_title: 'doc-a',
      section_title: 'sec-a',
      title_path: 'doc-a/sec-a',
      keyword_text: 'alpha beta',
      source_path: 'book-a/file-a.md',
      chunk_index: 0,
      vector: [1, 0, 0, 0],
      sparse_vector: null,
    },
    {
      id: 'b',
      text: 'gamma delta epsilon',
      retrieval_text: 'gamma delta retrieval',
      metadata: JSON.stringify({
        category: 'interview',
        skillName: 'skill-2',
        book: 'book-b',
      }),
      book: 'book-b',
      filename: 'file-b.md',
      doc_title: 'doc-b',
      section_title: 'sec-b',
      title_path: 'doc-b/sec-b',
      keyword_text: 'gamma delta',
      source_path: 'book-b/file-b.md',
      chunk_index: 0,
      vector: [0, 1, 0, 0],
      sparse_vector: null,
    },
    {
      id: 'c',
      text: 'epsilon zeta eta',
      retrieval_text: 'epsilon zeta retrieval',
      metadata: JSON.stringify({
        category: 'promotion',
        skillName: 'skill-1',
        book: 'book-a',
      }),
      book: 'book-a',
      filename: 'file-c.md',
      doc_title: 'doc-c',
      section_title: 'sec-c',
      title_path: 'doc-c/sec-c',
      keyword_text: 'epsilon zeta',
      source_path: 'book-a/file-c.md',
      chunk_index: 1,
      vector: [-1, 0, 0, 0],
      sparse_vector: null,
    },
  ],
};

let tmpDir: string;
let fixturePath: string;
let store: VectorStore;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vector-store-test-'));
  fixturePath = join(tmpDir, 'fixture.json');
  writeFileSync(fixturePath, JSON.stringify(FIXTURE), 'utf8');
  store = createVectorStore();
  await store.load(fixturePath);
});

describe('vector-store: load()', () => {
  it('builds a Float32Array index from a JSON fixture', async () => {
    const fresh = createVectorStore();
    await fresh.load(fixturePath);
    // Float32Array allocation: 3 vectors * 4 dims = 12 floats
    const buf = fresh.getVectorBuffer();
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBe(3 * 4);
  });

  it('is idempotent: calling load() twice keeps the latest snapshot', async () => {
    const fresh = createVectorStore();
    await fresh.load(fixturePath);
    // Re-loading the same fixture should not throw
    await fresh.load(fixturePath);
    const buf = fresh.getVectorBuffer();
    expect(buf.length).toBe(3 * 4);
  });

  it('throws a clear error when the file is missing', async () => {
    const fresh = createVectorStore();
    await expect(fresh.load(join(tmpDir, 'nope.json'))).rejects.toThrow(/vector-store: failed to load/);
  });

  it('throws a clear error when the JSON is malformed', async () => {
    const badPath = join(tmpDir, 'bad.json');
    writeFileSync(badPath, '{not json', 'utf8');
    const fresh = createVectorStore();
    await expect(fresh.load(badPath)).rejects.toThrow(/invalid JSON/);
  });

  it('throws when the file is missing the vectors array', async () => {
    const noVecPath = join(tmpDir, 'no-vec.json');
    writeFileSync(noVecPath, JSON.stringify({ version: 1, dimension: 4 }), 'utf8');
    const fresh = createVectorStore();
    await expect(fresh.load(noVecPath)).rejects.toThrow(/missing 'vectors' array/);
  });

  it('throws on dimension mismatch', async () => {
    const badDimPath = join(tmpDir, 'bad-dim.json');
    writeFileSync(
      badDimPath,
      JSON.stringify({
        version: 1,
        dimension: 4,
        count: 1,
        vectors: [
          {
            ...FIXTURE.vectors[0],
            vector: [1, 0, 0], // wrong length
          },
        ],
      }),
      'utf8'
    );
    const fresh = createVectorStore();
    await expect(fresh.load(badDimPath)).rejects.toThrow(/dimension mismatch/);
  });

  it('handles object metadata (in addition to string-JSON metadata)', async () => {
    const objMetaPath = join(tmpDir, 'obj-meta.json');
    const record = {
      id: 'x',
      text: 'hello world',
      retrieval_text: 'hello world retrieval',
      metadata: { category: 'promotion', skillName: 's-1', book: 'book-x' },
      book: 'book-x',
      filename: 'f.md',
      doc_title: 'd',
      section_title: 's',
      title_path: 'd/s',
      keyword_text: 'hello',
      source_path: 'book-x/f.md',
      chunk_index: 0,
      vector: [1, 0, 0, 0],
      sparse_vector: null,
    };
    writeFileSync(
      objMetaPath,
      JSON.stringify({ version: 1, dimension: 4, count: 1, vectors: [record] }),
      'utf8'
    );
    const fresh = createVectorStore();
    await fresh.load(objMetaPath);
    const [hit] = fresh.search([1, 0, 0, 0], 1);
    expect(hit.id).toBe('x');
    expect(hit.metadata).toMatchObject({ category: 'promotion' });
  });

  it('treats unparseable metadata string as empty metadata', async () => {
    const path = join(tmpDir, 'bad-meta.json');
    const record = {
      ...FIXTURE.vectors[0],
      id: 'ym',
      metadata: '{not valid json',
    };
    writeFileSync(
      path,
      JSON.stringify({ version: 1, dimension: 4, count: 1, vectors: [record] }),
      'utf8'
    );
    const fresh = createVectorStore();
    await fresh.load(path);
    const [hit] = fresh.search([1, 0, 0, 0], 1);
    expect(hit.id).toBe('ym');
    expect(hit.metadata).toEqual({});
  });
});

describe('vector-store: search()', () => {
  it('returns empty when index is empty (loaded with zero vectors)', async () => {
    const emptyPath = join(tmpDir, 'empty.json');
    writeFileSync(
      emptyPath,
      JSON.stringify({ version: 1, dimension: 4, count: 0, vectors: [] }),
      'utf8'
    );
    const empty = createVectorStore();
    await empty.load(emptyPath);
    const results = empty.search([1, 0, 0, 0], 3);
    expect(results).toEqual([]);
  });

  it('returns empty when topK is zero or negative', async () => {
    expect(store.search([1, 0, 0, 0], 0)).toEqual([]);
    expect(store.search([1, 0, 0, 0], -1)).toEqual([]);
  });

  it('returns top-K results ordered by composite score', () => {
    const q = [1, 0, 0, 0];
    const top1 = store.search(q, 1);
    expect(top1).toHaveLength(1);
    expect(top1[0].id).toBe('a');

    const top2 = store.search(q, 2);
    expect(top2.map(r => r.id)).toEqual(['a', 'b']);

    const top3 = store.search(q, 3);
    expect(top3.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the requested topK length (or fewer if index is smaller)', () => {
    const top10 = store.search([1, 0, 0, 0], 10);
    expect(top10).toHaveLength(3);
  });

  it('computes cosine: identical = 1, orthogonal = 0, opposite = -1', () => {
    // Identical to a
    const identical = store.search([1, 0, 0, 0], 3);
    const aScore = identical.find(r => r.id === 'a')!.score;
    const bScore = identical.find(r => r.id === 'b')!.score;
    const cScore = identical.find(r => r.id === 'c')!.score;

    // Since `rerank = cosine` and `dense = cosine`, the cosine component
    // accounts for 0.55 + 0.20 = 0.75 of the composite score, so the
    // ranking is determined by cosine, but the absolute composite score
    // is offset by keyword/lexical contributions. We assert the *order*:
    // a (1.0) > b (0.0) > c (-1.0).
    expect(aScore).toBeGreaterThan(bScore);
    expect(bScore).toBeGreaterThan(cScore);

    // And assert the cosine subscore is exact:
    const aDense = store.getLastDenseScores().get('a')!;
    const bDense = store.getLastDenseScores().get('b')!;
    const cDense = store.getLastDenseScores().get('c')!;
    expect(aDense).toBeCloseTo(1, 6);
    expect(bDense).toBeCloseTo(0, 6);
    expect(cDense).toBeCloseTo(-1, 6);
  });

  it('filters by category (metadata.category)', () => {
    const results = store.search([1, 0, 0, 0], 10, { category: 'interview' });
    expect(results.map(r => r.id)).toEqual(['b']);
  });

  it('filters by skillName (metadata.skillName)', () => {
    const results = store.search([1, 0, 0, 0], 10, { skillName: 'skill-1' });
    expect(results.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('filters by book (top-level book field)', () => {
    const results = store.search([1, 0, 0, 0], 10, { book: 'book-a' });
    expect(results.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('combines multiple filters with AND', () => {
    const results = store.search([1, 0, 0, 0], 10, {
      category: 'promotion',
      book: 'book-a',
    });
    expect(results.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('exposes composite score, text, and parsed metadata on each result', () => {
    const [first] = store.search([1, 0, 0, 0], 1);
    expect(first).toEqual(
      expect.objectContaining({
        id: 'a',
        text: expect.any(String),
        score: expect.any(Number),
        metadata: expect.objectContaining({ category: 'promotion' }),
      })
    );
  });

  it('lazy-loads: search() before load() throws a clear error', () => {
    const fresh = createVectorStore();
    expect(() => fresh.search([1, 0, 0, 0], 1)).toThrow(/vector-store: not loaded/);
  });
});

describe('vector-store: zero-vector guard', () => {
  it('returns 0 (not NaN) when the query vector is all zeros', async () => {
    const fresh = createVectorStore();
    await fresh.load(fixturePath);
    const results = fresh.search([0, 0, 0, 0], 3);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(Number.isFinite(r.score)).toBe(true);
    }
    // Dense (cosine) for an all-zero query is 0, so all composite scores
    // reduce to the keyword+lexical contributions, which are 0 here.
    for (const r of results) {
      expect(r.score).toBe(0);
    }
  });
});

// ---------------- Integration smoke test (real data) ----------------

const REAL_DATA = join(process.cwd(), 'data', 'skill-vectors.json');

describe('vector-store: integration with real data/skill-vectors.json', () => {
  let realStore: VectorStore;
  let realIsEmpty = false;

  beforeAll(async () => {
    realStore = createVectorStore();
    await realStore.load(REAL_DATA);
    // 当 data/skill-vectors.json 被清空为空模板（count=0, vectors=[]）时，
    // 这些集成测试无法验证真实数据，跳过它们而不是失败。
    realIsEmpty = realStore.getVectorBuffer().length === 0;
  });

  it('returns the first record in top-1 when queried with its own vector', ({ skip }) => {
    if (realIsEmpty) skip('skipped: skill-vectors.json is empty');
    const q = realStore.getVectorByIndex(0);
    const top1 = realStore.search(q, 1);
    expect(top1).toHaveLength(1);
    expect(top1[0].id).toBe(realStore.getIdByIndex(0));
  });

  it('all cosine scores are within [-1, 1] for a random unit vector', ({ skip }) => {
    if (realIsEmpty) skip('skipped: skill-vectors.json is empty');
    // Deterministic pseudo-random unit vector (avoids flakiness)
    const dimLocal = realStore.getDimension();
    const raw = new Array(dimLocal).fill(0).map((_, i) => Math.sin(i * 0.123) + Math.cos(i * 0.456));
    const norm = Math.hypot(...raw);
    const q = raw.map(x => x / norm);
    // Call search to populate getLastDenseScores()
    realStore.search(q, 5);
    const dense = realStore.getLastDenseScores();
    expect(dense.size).toBeGreaterThan(0);
    for (const s of dense.values()) {
      expect(s).toBeGreaterThanOrEqual(-1 - 1e-6);
      expect(s).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});
