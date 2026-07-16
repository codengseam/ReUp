// src/lib/vector-store.ts
// ReUp v2 Phase 1, V1-V3: in-memory vector store with cosine + composite scoring.
//
// Behavior summary (spec §5.2):
//   - load(path): parse data/skill-vectors.json and build a Float32Array index.
//   - search(query, topK, opts?): return top-K by composite score.
//       composite = 0.55 * rerank + 0.20 * dense + 0.15 * keyword + 0.10 * lexical
//         dense   = cosine(query, vector)
//         rerank  = cosine(query, vector)  [placeholder until BGE reranker lands in 5.3]
//         keyword = hit ratio of keyword_text tokens vs query tokens
//         lexical = Jaccard of bag-of-words between query tokens and (text + retrieval_text)
//   - Filters: opts.category, opts.skillName, opts.book (AND-combined).
//   - Cosine guards against zero vectors (query and stored) to avoid NaN.
//
// Note on keyword/lexical with number[] queries:
//   The spec interface is `query: number[]` (a dense embedding), but the keyword
//   and lexical components are defined in terms of "query tokens" vs document
//   tokens. We tokenize the query by stringifying the array — i.e. `query.join(' ')`
//   then split into Latin words / CJK characters. For dense embeddings (e.g.
//   1024-dim BGE-M3 vectors) this typically yields float-string tokens that do
//   not overlap with document text, so keyword/lexical ≈ 0. The §5.4
//   knowledge-base layer is expected to bring the original text query in
//   separately when it needs non-trivial keyword/lexical signal.
//
// Internal helpers (getVectorBuffer / getLastDenseScores / getVectorByIndex /
// getIdByIndex / getDimension) are exposed for testability. Callers in
// production code should stick to the VectorStore interface.

import { readFile } from 'fs/promises';

export interface SearchOptions {
  category?: 'promotion' | 'interview';
  skillName?: string;
  book?: string;
}

export interface SearchResult {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
}

export interface VectorRecord {
  id: string;
  text: string;
  category: string;
  metadata: Record<string, unknown>;
}

export interface VectorStore {
  load(path: string): Promise<void>;
  search(query: number[], topK: number, opts?: SearchOptions): SearchResult[];
  /** Return all indexed records (used by the text-only fallback when the embedder is unavailable). */
  getAllRecords(): VectorRecord[];
  /** Exposed for tests. */
  getVectorBuffer(): Float32Array;
  /** Exposed for tests: last computed dense (cosine) score per id. */
  getLastDenseScores(): Map<string, number>;
  /** Exposed for tests. */
  getVectorByIndex(i: number): number[];
  /** Exposed for tests. */
  getIdByIndex(i: number): string;
  /** Exposed for tests. */
  getDimension(): number;
}

const CATEGORY_ALIASES: Record<string, Set<string>> = {
  // 运行时过滤命名空间 = data/skill-vectors.json 中 metadata.category 的实际取值，
  // 同时纳入 category-rules.ts 的 TopicCategory 取值（deriveCategory 输出），
  // 使离线 backfill 产出的分类名也能被运行时检索命中。两套命名空间须在此合并保持一致。
  // '通用'（deriveCategory 兜底）刻意不入任一集合：无明确主题的 chunk 不参与 promotion/interview 过滤。
  promotion: new Set([
    'promotion',
    '职级体系', '晋升入门', '晋升材料', '晋升陈述', '晋升答辩',
    '晋升逻辑', '晋升认知', '能力模型', '提名词写作', '学习方法',
    // TopicCategory（晋升类）：deriveCategory 输出值，与上面 skill-vectors.json 实际值并列兼容
    '晋升流程', '晋升原则', '技术能力',
  ]),
  interview: new Set([
    'interview',
    '考察标准', '面试概览', '面试答疑', '面试流程', '面试准备',
    '自我介绍', '表达技巧', '项目表达', '简历经历', '反向提问',
    '薪资谈判', '自我认知', '心态调整', '职业规划', '源素材',
    // TopicCategory（面试类）：deriveCategory 输出值
    '简历优化', '经历包装', '招聘方视角',
  ]),
};

function categoryMatches(filterCategory: string, recCategory: string): boolean {
  const aliases = CATEGORY_ALIASES[filterCategory];
  if (aliases) return aliases.has(recCategory);
  return recCategory === filterCategory;
}

// ---------------- Internal types ----------------

interface ParsedMetadata {
  category?: string;
  skillName?: string;
  book?: string;
  [key: string]: unknown;
}

interface RawRecord {
  id: string;
  text: string;
  retrieval_text: string;
  metadata: string; // JSON string on disk
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

interface RawFile {
  version: number;
  dimension: number;
  count: number;
  vectors: RawRecord[];
}

interface IndexedRecord {
  id: string;
  text: string;
  retrievalText: string;
  keywordText: string;
  book: string;
  category: string;
  skillName: string;
  metadata: Record<string, unknown>;
}

// ---------------- Tokenization ----------------

/**
 * Tokenize for bag-of-words scoring.
 * - Latin: lowercase, split on non-alphanumeric boundaries.
 * - CJK (Han): each character is its own token (no spaces in source).
 */
function tokenize(input: string): string[] {
  if (!input) return [];
  const out: string[] = [];
  const latin = input.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const cjk = input.match(/[\u4e00-\u9fa5]/g) ?? [];
  for (const t of latin) out.push(t);
  for (const c of cjk) out.push(c);
  return out;
}

// ---------------- Store implementation ----------------

function createVectorStore(): VectorStore {
  let buffer: Float32Array | null = null;
  let dim = 0;
  let records: IndexedRecord[] = [];
  let lastDenseScores: Map<string, number> = new Map();

  async function load(path: string): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`vector-store: failed to load ${path}: ${reason}`);
    }

    let parsed: RawFile;
    try {
      parsed = JSON.parse(raw) as RawFile;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`vector-store: invalid JSON in ${path}: ${reason}`);
    }

    if (!parsed || !Array.isArray(parsed.vectors)) {
      throw new Error(`vector-store: missing 'vectors' array in ${path}`);
    }

    dim = parsed.dimension;
    const n = parsed.vectors.length;
    const next = new Float32Array(n * dim);

    const nextRecords: IndexedRecord[] = [];
    for (let i = 0; i < n; i++) {
      const v = parsed.vectors[i];
      if (v.vector.length !== dim) {
        throw new Error(
          `vector-store: dimension mismatch for record ${v.id}: expected ${dim}, got ${v.vector.length}`
        );
      }
      for (let j = 0; j < dim; j++) {
        next[i * dim + j] = v.vector[j];
      }

      let metaObj: ParsedMetadata = {};
      if (typeof v.metadata === 'string') {
        try {
          const obj = JSON.parse(v.metadata) as unknown;
          if (obj && typeof obj === 'object') {
            metaObj = obj as ParsedMetadata;
          }
        } catch {
          metaObj = {};
        }
      } else if (v.metadata && typeof v.metadata === 'object') {
        metaObj = v.metadata as ParsedMetadata;
      }

      nextRecords.push({
        id: v.id,
        text: v.text ?? '',
        retrievalText: v.retrieval_text ?? '',
        keywordText: v.keyword_text ?? '',
        book: v.book ?? '',
        category: typeof metaObj.category === 'string' ? metaObj.category : '',
        skillName: typeof metaObj.skillName === 'string' ? metaObj.skillName : '',
        metadata: { ...metaObj },
      });
    }

    buffer = next;
    records = nextRecords;
  }

  function ensureLoaded(): { buf: Float32Array; recs: IndexedRecord[] } {
    if (!buffer) {
      throw new Error('vector-store: not loaded. Call load(path) first.');
    }
    return { buf: buffer, recs: records };
  }

  function passesFilter(rec: IndexedRecord, opts?: SearchOptions): boolean {
    if (!opts) return true;
    if (opts.category !== undefined && !categoryMatches(opts.category, rec.category)) return false;
    if (opts.skillName !== undefined && rec.skillName !== opts.skillName) return false;
    if (opts.book !== undefined && rec.book !== opts.book) return false;
    return true;
  }

  function cosTo(recOffset: number, q: Float32Array, qNorm: number, buf: Float32Array, dimLocal: number): number {
    if (qNorm === 0) return 0;
    let dot = 0;
    let rNormSq = 0;
    for (let j = 0; j < dimLocal; j++) {
      const qv = q[j];
      const rv = buf[recOffset + j];
      dot += qv * rv;
      rNormSq += rv * rv;
    }
    const rNorm = Math.sqrt(rNormSq);
    if (rNorm === 0) return 0;
    return dot / (qNorm * rNorm);
  }

  function keywordScore(queryTokens: string[], kwText: string): number {
    if (queryTokens.length === 0) return 0;
    const kwSet = new Set(tokenize(kwText));
    if (kwSet.size === 0) return 0;
    let hits = 0;
    for (const t of queryTokens) {
      if (kwSet.has(t)) hits++;
    }
    return hits / queryTokens.length;
  }

  function lexicalScore(queryTokens: string[], text: string, retrievalText: string): number {
    if (queryTokens.length === 0) return 0;
    const docSet = new Set<string>();
    for (const t of tokenize(text)) docSet.add(t);
    for (const t of tokenize(retrievalText)) docSet.add(t);
    if (docSet.size === 0) return 0;
    const querySet = new Set<string>(queryTokens);
    let intersection = 0;
    for (const t of querySet) {
      if (docSet.has(t)) intersection++;
    }
    const union = querySet.size + docSet.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  function search(query: number[], topK: number, opts?: SearchOptions): SearchResult[] {
    if (topK <= 0) return [];

    const { buf, recs } = ensureLoaded();
    if (recs.length === 0) return [];

    // Normalize query into Float32Array
    const q = new Float32Array(dim);
    let qNormSq = 0;
    for (let j = 0; j < dim; j++) {
      const v = query[j] ?? 0;
      q[j] = v;
      qNormSq += v * v;
    }
    const qNorm = Math.sqrt(qNormSq);

    // Tokenize query once for keyword + lexical scoring.
    // We stringify the array and tokenize; see file header for rationale.
    const queryTokens = tokenize(query.join(' '));

    const denseScores = new Map<string, number>();
    const scored: Array<{ rec: IndexedRecord; idx: number; composite: number }> = [];

    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      if (!passesFilter(rec, opts)) continue;

      const dense = cosTo(i * dim, q, qNorm, buf, dim);
      denseScores.set(rec.id, dense);

      // Rerank placeholder: cosine. Real BGE-reranker ships in §5.3.
      const rerank = dense;
      const keyword = keywordScore(queryTokens, rec.keywordText);
      const lexical = lexicalScore(queryTokens, rec.text, rec.retrievalText);
      const composite = 0.55 * rerank + 0.20 * dense + 0.15 * keyword + 0.10 * lexical;

      scored.push({ rec, idx: i, composite });
    }

    lastDenseScores = denseScores;

    scored.sort((a, b) => {
      if (b.composite !== a.composite) return b.composite - a.composite;
      return a.idx - b.idx; // stable tiebreaker
    });

    const limit = Math.min(topK, scored.length);
    const results: SearchResult[] = new Array(limit);
    for (let i = 0; i < limit; i++) {
      const { rec, composite } = scored[i];
      results[i] = {
        id: rec.id,
        score: composite,
        text: rec.text,
        metadata: rec.metadata,
      };
    }
    return results;
  }

  function getVectorBuffer(): Float32Array {
    return ensureLoaded().buf;
  }

  function getLastDenseScores(): Map<string, number> {
    return lastDenseScores;
  }

  function getVectorByIndex(i: number): number[] {
    const { buf } = ensureLoaded();
    const offset = i * dim;
    return Array.from(buf.slice(offset, offset + dim));
  }

  function getIdByIndex(i: number): string {
    return ensureLoaded().recs[i].id;
  }

  function getDimension(): number {
    return dim;
  }

  function getAllRecords(): VectorRecord[] {
    const { recs } = ensureLoaded();
    return recs.map((r) => ({
      id: r.id,
      text: r.text,
      category: r.category,
      metadata: r.metadata,
    }));
  }

  return {
    load,
    search,
    getAllRecords,
    getVectorBuffer,
    getLastDenseScores,
    getVectorByIndex,
    getIdByIndex,
    getDimension,
  };
}

export { createVectorStore, tokenize, categoryMatches };
