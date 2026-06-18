// src/lib/resume/ats.ts
// ReUp v2 Phase 4 P1 (C1-C3): ATS keyword adaptation.
//
// C1 — extractJdKeywords: hybrid keyword extraction. Primary path: LLM (single
//      invoke() call) parses the JD into [{term, weight}]. Fallback path: simple
//      term-frequency (TF) over a stopword-filtered token stream.
// C2 — computeAtsCoverage: case-insensitive substring match across the resume,
//      weighted by keyword importance, percentage rounded to 1 decimal.
// C3 — suggestSectionForKeyword: heuristic object-literal map routing a missing
//      keyword to a resume section (skills / basic / projects / experience).
//
// Spec: docs/superpowers/specs/2026-06-14-reup-v2-design.md §8.C
// Constraints: TS strict, no any, no helpers for one-shot operations, no
// modification of pre-existing modules.

import { LLMClient, type Message } from '@/lib/llm-client';
import { DEFAULT_ATS_PROMPT } from '@/lib/prompts/registry';
import type {
  ATSResult,
  ResumeDocument,
  ResumeSection,
} from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface JdKeyword {
  term: string;
  weight: number;
}

export interface ExtractJdKeywordsOptions {
  /** Optional LLM client. When omitted, falls back to TF. */
  llmClient?: LLMClient;
  /** Max keywords to return. Default 20. */
  topK?: number;
  /**
   * Override the system prompt used for the LLM call. When omitted (or empty
   * after trim) the default prompt from `buildAtsKeywordPrompt()` is used.
   * Allows the admin UI to inject a custom prompt at runtime.
   */
  customSystemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 20;
const TF_MAX_TOKENS = 5000;

/**
 * Common Chinese + English stopwords. Tokens that match exactly (lowercased)
 * are dropped from TF counting. Intentionally small — we only need to avoid
 * counting noise like 的 / 了 / and / the.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  // Chinese
  '的', '了', '和', '是', '在', '我', '有', '与', '及', '或', '等', '对', '为',
  '于', '上', '下', '中', '这', '那', '一个', '一些', '我们', '你', '他', '她',
  '它', '们', '之', '所', '以', '可', '也', '但', '而', '就', '要', '从', '到',
  '把', '被', '用', '能', '会', '不', '没', '很', '还', '只', '并', '其', '于',
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'from', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'will', 'can',
  'have', 'has', 'had', 'do', 'does', 'did', 'not', 'no', 'so', 'if', 'than', 'into',
]);

/** Tools / languages / tech — route to `skills`. Substring match, lowercased. */
const SKILLS_KEYWORDS: readonly string[] = [
  'python', 'java', 'javascript', 'typescript', 'go', 'golang', 'rust', 'c++',
  'ruby', 'php', 'swift', 'kotlin', 'scala',
  'kubernetes', 'k8s', 'docker', 'helm', 'terraform', 'ansible',
  'mysql', 'postgres', 'postgresql', 'redis', 'mongodb', 'elasticsearch',
  'kafka', 'rabbitmq', 'rocketmq',
  'aws', 'gcp', 'azure', 'aliyun',
  'git', 'linux', 'jenkins', 'jira', 'confluence', 'grafana', 'prometheus',
  'pytest', 'junit', 'selenium',
];

/** Soft-skill / leadership / summary lines — route to `basic`. */
const BASIC_KEYWORDS: readonly string[] = [
  '团队管理', '管理经验', '沟通', '协调', '领导力', 'leadership', 'communication',
  '协作', '团队合作', 'owner', 'ownership', 'teamwork', 'cross-functional',
  '责任心', '抗压', '学习能力', '主动', '主人翁', '推动力', 'ownership意识',
  '总结', '复盘', '分享', 'mentor', '带人', '招聘', '面试',
];

/** Project / system-design / scale — route to `projects`. */
const PROJECTS_KEYWORDS: readonly string[] = [
  '高并发', '高可用', '微服务', '分布式', '分布式系统', '秒杀', '大数据', '实时',
  'scalability', 'microservice', 'distributed', 'high-concurrency', 'kafka',
  'flink', 'spark', 'hadoop', 'elasticsearch',
  '架构', 'architecture', 'design', 'refactor', '重构', '性能优化', '压测',
  'sre', 'devops', 'oncall', '监控', '可观测', '链路追踪',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize a JD into lowercased, stopword-filtered terms. Supports CJK by
 * emitting single 2-char windows (bigrams) plus all CJK chars as 1-grams, so
 * the TF counts both "高并发" (bigram) and individual characters as needed.
 *
 * English: split on non-letter, lowercased, stopword-filtered.
 * CJK: contiguous runs of CJK chars become 1-grams (chars) and 2-grams (bigrams).
 * Mixed (e.g. "Python微服务"): keep the English word AS-IS, then the CJK bigrams.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lowered = text.toLowerCase();
  // 1) CJK runs -> bigrams + unigrams
  const cjkRe = /[\u4e00-\u9fff]+/g;
  let m: RegExpExecArray | null;
  while ((m = cjkRe.exec(lowered)) !== null) {
    const run = m[0];
    for (let i = 0; i < run.length; i++) {
      tokens.push(run[i]!);
      if (i + 2 <= run.length) tokens.push(run.substring(i, i + 2));
    }
  }
  // 2) English/letter tokens
  const words = lowered.split(/[^a-z0-9+#.]+/).filter(Boolean);
  for (const w of words) {
    if (w.length < 2) continue;
    if (STOPWORDS.has(w)) continue;
    tokens.push(w);
  }
  // Cap to avoid pathological inputs
  return tokens.slice(0, TF_MAX_TOKENS);
}

/** Return true if the token is a CJK bigram that overlaps a longer CJK run. */
function isCjkBigramNoise(t: string, text: string): boolean {
  if (t.length !== 2) return false;
  if (!/[\u4e00-\u9fff]{2}/.test(t)) return false;
  // Require at least one non-CJK char (space/punct) between the two chars
  // in the original text, meaning the bigram was artificially stitched.
  const re = new RegExp(t[0] + '[^\u4e00-\u9fff]+' + t[1]);
  return re.test(text);
}

function tfExtract(text: string, topK: number): JdKeyword[] {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) {
    if (t.length === 1 && /[\u4e00-\u9fff]/.test(t)) continue;
    if (isCjkBigramNoise(t, text)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  const out: JdKeyword[] = [];
  for (const [term, freq] of counts) {
    out.push({ term, weight: max === 0 ? 0 : freq / max });
  }
  out.sort((a, b) => b.weight - a.weight || (a.term < b.term ? -1 : 1));
  return out.slice(0, topK);
}

/**
 * Try to parse the LLM response content as a JSON array of `{term, weight}`.
 * Tolerant of: leading/trailing whitespace, ```json fences, prose around the array.
 * Returns null on any parse failure so the caller can fall back to TF.
 */
function parseLlmKeywords(content: string): JdKeyword[] | null {
  if (!content || content.length === 0) return null;
  // Strip code fences if present
  let body = content.trim();
  const fenceMatch = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) body = (fenceMatch[1] ?? '').trim();
  // Locate the first '[' and last ']' to be tolerant of prose wrappers
  const first = body.indexOf('[');
  const last = body.lastIndexOf(']');
  if (first < 0 || last < 0 || last < first) return null;
  const slice = body.substring(first, last + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: JdKeyword[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const term = obj.term;
    const weight = obj.weight;
    if (typeof term !== 'string' || term.length === 0) continue;
    if (typeof weight !== 'number' || !Number.isFinite(weight)) continue;
    const w = Math.max(0, Math.min(1, weight));
    out.push({ term, weight: w });
  }
  return out;
}

export const DEFAULT_ATS_KEYWORD_SYSTEM = DEFAULT_ATS_PROMPT;

const DEFAULT_ATS_KEYWORD_USER_PREFIX =
  '请从以下职位描述中抽取最重要的 {TOPK} 个关键词或短语（技术技能、工具、职责），' +
  '按重要性从高到低排序，weight 取值范围 0-1（最重要为 1）。\n' +
  '严格输出 JSON 数组，每项格式 {"term": "...", "weight": ...}。\n\n' +
  '## 职位描述\n';

/**
 * Build the user prompt for the LLM keyword extractor.
 *
 * Exported so the admin UI can read it back, and so the matcher tests can
 * assert the exact wording. Pure (no LLM call).
 */
export function buildAtsKeywordPrompt(jd: string, topK: number): { system: string; user: string } {
  return {
    system: DEFAULT_ATS_KEYWORD_SYSTEM,
    user: DEFAULT_ATS_KEYWORD_USER_PREFIX.replace('{TOPK}', String(topK)) + jd,
  };
}

// ---------------------------------------------------------------------------
// C1: extractJdKeywords
// ---------------------------------------------------------------------------

/**
 * Extract top-K keywords from a job description.
 *
 * Strategy:
 *  1) If `opts.llmClient` is provided, call `llmClient.invoke()` once with a
 *     structured prompt. Parse the response as `[{term, weight}]`.
 *  2) If the LLM is missing, throws, returns invalid JSON, or returns an empty
 *     array, fall back to a TF (term-frequency) extraction over the raw text.
 *
 * Output is sorted by weight descending and capped at `topK` (default 20).
 */
export async function extractJdKeywords(
  jd: string,
  opts: ExtractJdKeywordsOptions = {},
): Promise<JdKeyword[]> {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  if (!jd || jd.trim().length === 0) return [];

  // Try LLM path first if a client was provided.
  if (opts.llmClient) {
    try {
      const defaultP = buildAtsKeywordPrompt(jd, topK);
      const system = opts.customSystemPrompt && opts.customSystemPrompt.trim().length > 0
        ? opts.customSystemPrompt
        : defaultP.system;
      const user = defaultP.user;
      const messages: Message[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      const res = await opts.llmClient.invoke(messages);
      const parsed = parseLlmKeywords(res.content);
      if (parsed && parsed.length > 0) {
        // Re-sort (defensive) and cap
        parsed.sort((a, b) => b.weight - a.weight || (a.term < b.term ? -1 : 1));
        return parsed.slice(0, topK);
      }
    } catch {
      // Fall through to TF.
    }
  }

  // TF fallback.
  return tfExtract(jd, topK);
}

// ---------------------------------------------------------------------------
// C2: computeAtsCoverage
// ---------------------------------------------------------------------------

/**
 * For each keyword, check whether its term appears (case-insensitive substring)
 * anywhere in the resume (basic fields, experience bullets, project bullets,
 * skills list, and raw text).
 *
 * `hits` = sum of weights of keywords that hit.
 * `total` = sum of all weights.
 * `percentage` = hits / total * 100, rounded to 1 decimal.
 */
export function computeAtsCoverage(
  resume: ResumeDocument,
  jdKeywords: JdKeyword[],
): ATSResult['coverage'] {
  const haystack = buildResumeHaystack(resume);
  let hits = 0;
  let total = 0;
  for (const kw of jdKeywords) {
    const w = clamp01(kw.weight);
    total += w;
    if (termMatches(haystack, kw.term)) hits += w;
  }
  const percentage = total === 0 ? 0 : round1((hits / total) * 100);
  return { hits, total, percentage };
}

// Cache for buildResumeHaystack to avoid rebuilding on repeated calls
const haystackCache = new WeakMap<ResumeDocument, string>();

/**
 * Build a normalized, lowercased, concatenated string from all resume fields.
 * Result is cached on the ResumeDocument instance via WeakMap.
 */
function buildResumeHaystack(resume: ResumeDocument): string {
  const cached = haystackCache.get(resume);
  if (cached) return cached;

  const parts: string[] = [resume.raw];
  if (resume.basic.name) parts.push(resume.basic.name);
  if (resume.basic.title) parts.push(resume.basic.title);
  if (resume.basic.contact) {
    for (const v of Object.values(resume.basic.contact)) parts.push(v);
  }
  for (const e of resume.experience) {
    parts.push(e.company);
    parts.push(e.role);
    for (const b of e.bullets) parts.push(b);
  }
  for (const p of resume.projects) {
    parts.push(p.name);
    if (p.period) parts.push(p.period);
    for (const b of p.bullets) parts.push(b);
  }
  for (const s of resume.skills) parts.push(s);
  for (const ed of resume.education) {
    parts.push(ed.school);
    parts.push(ed.degree);
  }
  const result = parts.join(' \n ').toLowerCase();
  haystackCache.set(resume, result);
  return result;
}

function termMatches(haystackLower: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (t.length === 0) return false;
  return haystackLower.includes(t);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// C3: suggestSectionForKeyword
// ---------------------------------------------------------------------------

/**
 * Heuristic section suggestion for a missing keyword.
 * Priority: skills > basic > projects > experience.
 */
export function suggestSectionForKeyword(term: string): ResumeSection {
  const t = term.toLowerCase();
  if (SKILLS_KEYWORDS.some((k) => t.includes(k))) return 'skills';
  if (BASIC_KEYWORDS.some((k) => term.includes(k) || t.includes(k.toLowerCase()))) {
    return 'basic';
  }
  if (PROJECTS_KEYWORDS.some((k) => term.includes(k) || t.includes(k.toLowerCase()))) {
    return 'projects';
  }
  return 'experience';
}
