// src/lib/admin-knowledge.ts
// ReUp v2 Phase 1.5: read-only inspection helpers for the admin "knowledge" tab.
//
// Local architecture has no upload/delete — chunks are pre-bundled in
// `data/skill-vectors.json`. We load that file directly (not via the
// `VectorStore` runtime index) so admin queries can return raw metadata
// fields like `book` / `category` / `topic` that the runtime search
// interface does not expose.
//
// All public functions are async because file I/O is async. The `VectorStore`
// argument is only used for total count (buffer length / dim) — the per-record
// metadata used for grouping and search comes from the JSON file.

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tokenize, type VectorStore } from './vector-store';
import { getAllSkills, loadSkillsSync } from './skills-loader';

const PREVIEW_MAX = 200;
const DATA_DIR = 'data';
const VECTORS_FILE = 'skill-vectors.json';

/** Resolve the project root directory. Uses REUP_PROJECT_ROOT env var if set,
 *  otherwise derives from __dirname (ESM) or falls back to process.cwd(). */
function getProjectRoot(): string {
  if (process.env.REUP_PROJECT_ROOT) return process.env.REUP_PROJECT_ROOT;
  // __dirname is available in CJS/tsup bundles; in ESM, derive from import.meta.url
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

/** Resolve the default vector file path at call time (not module load time)
 * so tests that `process.chdir()` to a tmp dir pick up the test fixture. */
function defaultFilePath(): string {
  return path.join(process.cwd(), DATA_DIR, VECTORS_FILE);
}

// ---------------- Naming Helpers (Issue 1) ----------------

/**
 * Transform raw doc_title / section_title into a human-readable name ≤20 chars.
 *
 * Strategy:
 * 1. Strip leading number prefixes like "01_", "02_", "03|" etc.
 * 2. Strip "(优化版)" and "(xx优化版)" suffixes
 * 3. For known ambiguous names (e.g. chapter numbers), apply manual overrides
 * 4. Truncate to 20 chars with "…" if needed
 */
const MAX_TITLE_LEN = 20;

/** Module-level regexps — hoisted to avoid re-compilation on every call. */
const NUMBER_PREFIX_RE = /^\d{2}[_|]/;
const OPTIMIZED_SUFFIX_RE = /（.*?优化版）$/;
const OPTIMIZED_SUFFIX_EN_RE = /\(.*?优化版\)$/;

/** Manual overrides for doc_titles that can't be auto-simplified well. */
const DOC_TITLE_OVERRIDES: Record<string, string> = {
  '大厂晋升指南（1~3章优化版）': '晋升体系（1-3章）',
  '大厂晋升指南（开篇词优化版）': '开篇词（重新理解晋升）',
  '大厂晋升指南（第4章优化版）': '晋升逻辑（第4章）',
  '大厂晋升指南（第5章优化版）': '职级详解P5（新人）',
  '大厂晋升指南（第6章优化版）': '职级详解P6（独立）',
  '大厂晋升指南（第7章优化版）': '职级详解P7（带队）',
  '大厂晋升指南（第8章优化版）': '职级详解P8（专家）',
  '大厂晋升指南（第9章优化版）': '职级详解P9（总监）',
  '大厂晋升指南（第10章优化版）': '晋升技巧（材料写作）',
  '大厂晋升指南（第11章优化版）': '晋升技巧（答辩）',
  '大厂晋升指南（第12章优化版）': '晋升技巧（陈述）',
  '大厂晋升指南（第14章优化版）': '做事方法（目标执行）',
  '大厂晋升指南（第15章优化版）': '做事方法（总结汇报）',
  '大厂晋升指南（第17章优化版）': '技术提升方法',
  '大厂晋升指南（第18章优化版）': '业务理解',
  '大厂晋升指南（第19章优化版）': '团队管理',
  '大厂晋升指南（第20章优化版）': '管理误区',
  '大厂晋升指南（加餐一优化版）': '职级对标（硬通货）',
  '大厂晋升指南（加餐二优化版）': '提名词写作',
  '大厂晋升指南（加餐三优化版）': '10000小时定律',
  '大厂晋升指南（加餐四优化版）': '基础学习',
  '01_面试现场未完待续2019_04_02': '后续（未完待续）',
  '02_简介': '内容简介',
  '31_TABLE_OF_CONTENTS': '目录总览',
  '《面试现场》-源素材': '源素材',
};

/** Auto-transform a raw title to a simplified name ≤20 chars. */
function autoSimplify(raw: string): string {
  let result = raw;
  result = result.replace(NUMBER_PREFIX_RE, '');
  result = result.replace(OPTIMIZED_SUFFIX_RE, '').replace(OPTIMIZED_SUFFIX_EN_RE, '');
  if (result.length > MAX_TITLE_LEN) {
    result = result.slice(0, MAX_TITLE_LEN - 1) + '…';
  }
  return result;
}

/** Simplify a doc_title to ≤20 chars. Uses manual overrides, then auto-transform. */
export function simplifyDocTitle(raw: string): string {
  if (!raw) return '';
  if (DOC_TITLE_OVERRIDES[raw]) return DOC_TITLE_OVERRIDES[raw];
  return autoSimplify(raw);
}

/** Simplify a section_title to ≤20 chars. Auto-transform only (no manual overrides). */
export function simplifySectionTitle(raw: string): string {
  if (!raw) return '';
  return autoSimplify(raw);
}

/** Simplify a title string to ≤20 chars (legacy: applies doc_title overrides).
 *  @deprecated Use simplifyDocTitle or simplifySectionTitle for type-safe scoping. */
export function simplifyTitle(raw: string): string {
  if (!raw) return '';
  if (DOC_TITLE_OVERRIDES[raw]) return DOC_TITLE_OVERRIDES[raw];
  return autoSimplify(raw);
}

// ---------------- Compliance Notice Stripping (Issue 4) ----------------

/**
 * Pattern matching the compliance notice block at the START of text.
 * No `m` flag — `^` anchors to the beginning of the string, not any line.
 * Matches multi-line blockquotes: successive "> ..." lines.
 */
const COMPLIANCE_PATTERN = /^>\s*⚠️\s*\*?\*?合规声明\*?\*?[：:][^\n]*(\n>.*)*\n?/;

/**
 * Strip the compliance notice from the beginning of text.
 * The notice looks like: "> ⚠️ **合规声明**：本项目及本文档仅用于个人学习..."
 * Only strips if the text starts with the compliance notice blockquote.
 */
function stripComplianceNotice(text: string): string {
  if (!text) return '';
  if (!text.startsWith('>')) return text;
  return text.replace(COMPLIANCE_PATTERN, '').replace(/^\n+/, '');
}

// ---------------- Public types ----------------

export interface KnowledgeStats {
  total: number;
  dimension: number;
  /** 按书聚合：book → count，已按 count desc 排序。 */
  byBook: Array<{ name: string; count: number }>;
  /** 按 L2 细分类聚合：category → count，已按 count desc 排序。 */
  byCategory: Array<{ name: string; count: number }>;
  /**
   * 按 skillName 聚合：当前 chunk 上已不再挂 skillName，故此数组通常为空。
   * 仅作 3 个月的向后兼容字段保留，3 个月后下线。
   * @deprecated since 2026-06-15 — 框架 Skill 不下沉到 chunk
   */
  bySkill: Array<{ name: string; count: number }>;
  /** 按章聚合：doc_title → count，已按 count desc 排序。 */
  byChapter: Array<{ name: string; count: number }>;
  /** 按节聚合：section_title → count，已按 count desc 排序。 */
  bySection: Array<{ name: string; count: number }>;
}

/** Shared fields between KnowledgeChunkSummary and ChunkFullText. */
interface ChunkBase {
  id: string;
  book: string;
  category: string;
  skillName: string;
  /** L3 节级一句话主题（从 section_title 派生）。 */
  topic: string;
  sourcePath: string;
  docTitle: string;
  sectionTitle: string;
  chunkIndex: number;
}

export interface KnowledgeChunkSummary extends ChunkBase {
  /** First 200 chars of text for preview. */
  preview: string;
}

/** 框架 Skill 完整定义（包装自 skills-loader，并附 SKILL.md 全文）。 */
export interface FrameworkSkill {
  id: string;
  name: string;
  category: 'promotion' | 'interview';
  trigger: string;
  framework: string;
  steps: string[];
  /** 完整 SKILL.md 文本（frontmatter + 正文）。文件不存在时为 null。 */
  markdown: string | null;
  /** SKILL.md 的绝对路径（用于调试 / 跳转）。文件不存在时为 null。 */
  markdownPath: string | null;
}

/** book × category 交叉表单元。 */
export interface TopicSummaryEntry {
  book: string;
  category: string;
  count: number;
}

/** L2 主题聚合：book 与 category 的交叉统计 + 通用兜底计数。 */
export interface TopicSummary {
  /** 2D 交叉表：book → [{category, count}]，按 book 总量降序、category 数量降序。 */
  byBookCategory: Array<{ book: string; categories: Array<{ category: string; count: number }> }>;
  /** 按书总数排序（desc）。 */
  byBook: Array<{ name: string; total: number }>;
  /** 按分类总数排序（desc）。 */
  byCategory: Array<{ name: string; total: number }>;
  /** category === '通用' 的 chunk 数量（兜底命中数）。 */
  genericCount: number;
}

// ---------------- Internal types ----------------

interface RawRecord {
  id: string;
  text: string;
  retrieval_text?: string;
  metadata: string | Record<string, unknown>;
  book: string;
  filename?: string;
  doc_title: string;
  section_title: string;
  title_path?: string;
  keyword_text?: string;
  source_path: string;
  chunk_index: number;
  vector: number[];
  sparse_vector: Array<{ index: number; value: number }> | null;
}

interface RawFile {
  version?: number;
  dimension: number;
  count: number;
  vectors: RawRecord[];
}

interface LoadedRecord {
  id: string;
  text: string;
  book: string;
  category: string;
  skillName: string;
  topic: string;
  sourcePath: string;
  docTitle: string;
  sectionTitle: string;
  chunkIndex: number;
}

/** groupBy 接受的 key 集合。LoadedRecord 字段与 doc_title/section_title 显式枚举分开。 */
type GroupKey = 'book' | 'category' | 'skillName' | 'docTitle' | 'sectionTitle' | 'topic';

/** 公开给 listByGroup 的 key 联合（与 GroupKey 同步）。 */
export type ListByGroupKey = GroupKey;

// ---------------- Loaders ----------------

/** Memoized promise for loadAllRecords — reuses cached result across requests. */
let _recordsPromise: Promise<LoadedRecord[]> | null = null;

/** Read & normalize the skill-vectors.json file into a flat record list. */
async function loadAllRecords(filePath?: string): Promise<LoadedRecord[]> {
  // Return cached result if we have one (respects explicit filePath override)
  if (_recordsPromise && !filePath) return _recordsPromise;

  const target = filePath ?? defaultFilePath();
  let raw: string;
  try {
    raw = await readFile(target, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`admin-knowledge: failed to load ${target}: ${reason}`);
  }
  let parsed: RawFile;
  try {
    parsed = JSON.parse(raw) as RawFile;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`admin-knowledge: invalid JSON in ${target}: ${reason}`);
  }
  if (!parsed || !Array.isArray(parsed.vectors)) {
    throw new Error(`admin-knowledge: missing 'vectors' array in ${target}`);
  }

  const promise = (async () => {
    return parsed.vectors.map((v) => {
      let meta: Record<string, unknown> = {};
      if (typeof v.metadata === 'string') {
        try {
          const obj = JSON.parse(v.metadata) as unknown;
          if (obj && typeof obj === 'object') meta = obj as Record<string, unknown>;
        } catch {
          meta = {};
        }
      } else if (v.metadata && typeof v.metadata === 'object') {
        meta = v.metadata as Record<string, unknown>;
      }
      const rawDocTitle = v.doc_title ?? '';
      const rawSectionTitle = v.section_title ?? '';
      return {
        id: v.id,
        text: stripComplianceNotice(v.text ?? ''),
        book: v.book ?? '',
        category: typeof meta.category === 'string' ? meta.category : '',
        skillName: typeof meta.skillName === 'string' ? meta.skillName : '',
        topic: typeof meta.topic === 'string' ? meta.topic : '',
        sourcePath: v.source_path ?? '',
        docTitle: simplifyDocTitle(rawDocTitle),
        sectionTitle: simplifySectionTitle(rawSectionTitle),
        chunkIndex: typeof v.chunk_index === 'number' ? v.chunk_index : 0,
      };
    });
  })();

  // Cache the promise (not the result) so concurrent calls share the work.
  // Only cache default-path loads; explicit filePath calls bypass cache.
  if (!filePath) {
    _recordsPromise = promise;
    promise.catch(() => {
      if (_recordsPromise === promise) _recordsPromise = null;
    });
  }
  return promise;
}

/** Reset the records cache (for test teardown). */
export function _resetRecordsCache(): void {
  _recordsPromise = null;
}

function toSummary(rec: LoadedRecord): KnowledgeChunkSummary {
  const preview = rec.text.length > PREVIEW_MAX ? rec.text.slice(0, PREVIEW_MAX) : rec.text;
  return {
    id: rec.id,
    preview,
    book: rec.book,
    category: rec.category,
    skillName: rec.skillName,
    topic: rec.topic,
    sourcePath: rec.sourcePath,
    docTitle: rec.docTitle,
    sectionTitle: rec.sectionTitle,
    chunkIndex: rec.chunkIndex,
  };
}

function getGroupValue(r: LoadedRecord, key: GroupKey): string {
  switch (key) {
    case 'book': return r.book;
    case 'category': return r.category;
    case 'skillName': return r.skillName;
    case 'docTitle': return r.docTitle;
    case 'sectionTitle': return r.sectionTitle;
    case 'topic': return r.topic;
  }
}

function groupCount(records: LoadedRecord[], key: GroupKey): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const name = getGroupValue(r, key);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function sortedGroups(counts: Map<string, number>): Array<{ name: string; count: number }> {
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
}

// ---------------- Public API ----------------

/** Get high-level stats from the loaded vector store. */
export async function getKnowledgeStats(store: VectorStore): Promise<KnowledgeStats> {
  const dim = store.getDimension();
  const total = dim === 0 ? 0 : store.getVectorBuffer().length / dim;
  const records = await loadAllRecords();
  return {
    total,
    dimension: dim,
    byBook: sortedGroups(groupCount(records, 'book')),
    byCategory: sortedGroups(groupCount(records, 'category')),
    bySkill: sortedGroups(groupCount(records, 'skillName')),
    byChapter: sortedGroups(groupCount(records, 'docTitle')),
    bySection: sortedGroups(groupCount(records, 'sectionTitle')),
  };
}

export interface SearchKnowledgeOpts {
  limit?: number;
  book?: string;
  category?: string;
  /** @deprecated since 2026-06-15 — chunk 上不再挂 skillName */
  skillName?: string;
  /** L3 节级主题过滤（来自 metadata.topic）。 */
  topic?: string;
  /** L3 章级过滤（来自 doc_title）。 */
  docTitle?: string;
  /** L3 节级过滤（来自 section_title）。 */
  sectionTitle?: string;
}

/** Free-text search over chunk text. Returns summaries sorted by lexical match. */
export async function searchKnowledge(
  store: VectorStore,
  query: string,
  opts?: SearchKnowledgeOpts
): Promise<KnowledgeChunkSummary[]> {
  void store;
  const q = (query ?? '').trim();
  if (!q) return [];
  const queryTokens = tokenize(q);
  if (queryTokens.length === 0) return [];
  const querySet = new Set(queryTokens);

  const records = await loadAllRecords();
  const filtered = records.filter((r) => {
    if (opts?.book !== undefined && r.book !== opts.book) return false;
    if (opts?.category !== undefined && r.category !== opts.category) return false;
    if (opts?.skillName !== undefined && r.skillName !== opts.skillName) return false;
    if (opts?.topic !== undefined && r.topic !== opts.topic) return false;
    if (opts?.docTitle !== undefined && r.docTitle !== opts.docTitle) return false;
    if (opts?.sectionTitle !== undefined && r.sectionTitle !== opts.sectionTitle) return false;
    return true;
  });

  const scored: Array<{ rec: LoadedRecord; score: number }> = [];
  for (const r of filtered) {
    const docSet = new Set<string>();
    for (const t of tokenize(r.text)) docSet.add(t);
    if (docSet.size === 0) continue;
    let intersection = 0;
    for (const t of querySet) {
      if (docSet.has(t)) intersection++;
    }
    if (intersection === 0) continue;
    const union = querySet.size + docSet.size - intersection;
    const score = union === 0 ? 0 : intersection / union;
    scored.push({ rec: r, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.rec.id.localeCompare(b.rec.id);
  });

  const limit = opts?.limit ?? scored.length;
  return scored.slice(0, limit).map((s) => toSummary(s.rec));
}

export interface ListByGroupOpts {
  limit?: number;
}

/** List chunks grouped by an arbitrary metadata key. */
export async function listByGroup(
  store: VectorStore,
  groupKey: ListByGroupKey,
  opts?: ListByGroupOpts
): Promise<Array<{ name: string; count: number; sample: KnowledgeChunkSummary }>> {
  void store;
  const records = await loadAllRecords();

  // Build groups, preserving the first-occurrence sample per group name.
  const groupOrder: string[] = [];
  const groupCounts = new Map<string, number>();
  const groupSample = new Map<string, LoadedRecord>();
  for (const r of records) {
    const name = getGroupValue(r, groupKey);
    if (!groupCounts.has(name)) {
      groupOrder.push(name);
      groupSample.set(name, r);
      groupCounts.set(name, 0);
    }
    groupCounts.set(name, (groupCounts.get(name) ?? 0) + 1);
  }

  const groups = groupOrder.map((name) => ({
    name,
    count: groupCounts.get(name) ?? 0,
    sample: toSummary(groupSample.get(name) as LoadedRecord),
  }));
  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  const limit = opts?.limit ?? groups.length;
  return groups.slice(0, limit);
}

// ---------------- Framework Skills (L1) ----------------

const SKILLS_DIR = 'skills';

/**
 * Resolve the skills directory to an absolute path.
 * Uses REUP_PROJECT_ROOT env var, then derives from this module's location,
 * then falls back to process.cwd().
 */
function resolveSkillsDir(): string {
  const root = getProjectRoot();
  // getProjectRoot returns dirname of this module's file (e.g. src/lib/).
  // Try cwd first for fixture-override in tests, then derived paths.
  const candidates = [
    path.join(process.cwd(), SKILLS_DIR),            // cwd first (test fixtures)
    path.join(root, '..', '..', SKILLS_DIR),         // from src/lib → project root
    path.join(root, '..', SKILLS_DIR),               // from src → project root
  ];
  for (const p of candidates) {
    if (existsSync(path.join(p, 'jinsheng-dicing-luoji', 'SKILL.md'))) return p;
  }
  return path.join(process.cwd(), SKILLS_DIR);
}

/** Pre-computed skills dir path (lazy). */
let _skillsDir: string | null = null;
function getSkillsDir(): string {
  if (!_skillsDir) _skillsDir = resolveSkillsDir();
  return _skillsDir;
}

/** 尝试读取某个 skill 的 SKILL.md 全文；找不到时返回 null。 */
async function tryReadSkillMarkdown(
  skillId: string
): Promise<{ markdown: string | null; path: string | null }> {
  const skillsDir = getSkillsDir();
  const candidates = [
    path.join(skillsDir, skillId, 'SKILL.md'),
    path.join(skillsDir, `${skillId}.md`),
  ];
  for (const p of candidates) {
    try {
      const content = await readFile(p, 'utf8');
      return { markdown: content, path: p };
    } catch {
      // try next candidate
    }
  }
  // Log warning for debugging (only in server context)
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    console.warn(`[admin-knowledge] SKILL.md not found for skill "${skillId}" (tried: ${candidates.join(', ')})`);
  }
  return { markdown: null, path: null };
}

/**
 * 读取全部 8 个框架 Skill 完整定义（含 SKILL.md 全文）。
 *
 * L1 与 L2/L3 不同：这是「对话层」Skill，注入到 system prompt 指导 LLM 怎么回答。
 * 字段来自 `skills-loader.getAllSkills()`（data/skills.json 内存缓存），
 * SKILL.md 通过 fs 同步读取（admin 后台走 server runtime）。
 */
export async function getFrameworkSkills(): Promise<FrameworkSkill[]> {
  // 确保 skills 缓存被初始化（getAllSkills 不会触发初始化，需要先调 loadSkillsSync）
  loadSkillsSync();
  const skills = getAllSkills();
  const out: FrameworkSkill[] = [];
  for (const s of skills) {
    const result = await tryReadSkillMarkdown(s.id);
    out.push({
      id: s.id,
      name: s.name,
      category: s.category,
      trigger: s.trigger,
      framework: s.framework,
      steps: [...s.steps],
      markdown: result.markdown,
      markdownPath: result.path,
    });
  }
  return out;
}

// ---------------- Topic Summary (L2 cross-tab) ----------------

/**
 * 统计 book × category 交叉分布 + 各维度的独立计数。
 *
 * 输出 4 个字段：
 *   - `byBookCategory`：2D 交叉表，book 内嵌 category 列表（按 count desc）
 *   - `byBook`：按书的 chunk 总数（desc）
 *   - `byCategory`：按分类的 chunk 总数（desc）
 *   - `genericCount`：category === '通用' 的 chunk 数量（兜底命中率）
 */
export async function getTopicSummary(): Promise<TopicSummary> {
  const records = await loadAllRecords();
  const matrix = new Map<string, Map<string, number>>();
  const bookTotals = new Map<string, number>();
  const catTotals = new Map<string, number>();
  let genericCount = 0;

  for (const r of records) {
    const book = r.book || '(空)';
    const cat = r.category || '通用';
    if (cat === '通用') genericCount++;
    if (!matrix.has(book)) matrix.set(book, new Map());
    const inner = matrix.get(book);
    if (inner) {
      inner.set(cat, (inner.get(cat) ?? 0) + 1);
    }
    bookTotals.set(book, (bookTotals.get(book) ?? 0) + 1);
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + 1);
  }

  const byBookCategory = Array.from(matrix.entries())
    .map(([book, inner]) => ({
      book,
      categories: Array.from(inner.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => {
      const aTotal = a.categories.reduce((s, c) => s + c.count, 0);
      const bTotal = b.categories.reduce((s, c) => s + c.count, 0);
      return bTotal - aTotal;
    });

  const toSorted = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

  return {
    byBookCategory,
    byBook: toSorted(bookTotals),
    byCategory: toSorted(catTotals),
    genericCount,
  };
}

// ---------------- Chunk Full Text (Issue 5) ----------------

/** Result type for getChunkFullText. */
export interface ChunkFullText extends ChunkBase {
  /** Full text of the chunk (not trimmed). */
  text: string;
}

/**
 * Retrieve the full text of a specific chunk by its id.
 * Used by the admin knowledge tab for "查看详情" drill-down.
 */
export async function getChunkFullText(chunkId: string): Promise<ChunkFullText | null> {
  const records = await loadAllRecords();
  const rec = records.find((r) => r.id === chunkId);
  if (!rec) return null;
  return {
    id: rec.id,
    text: rec.text,
    book: rec.book,
    category: rec.category,
    skillName: rec.skillName,
    topic: rec.topic,
    sourcePath: rec.sourcePath,
    docTitle: rec.docTitle,
    sectionTitle: rec.sectionTitle,
    chunkIndex: rec.chunkIndex,
  };
}
