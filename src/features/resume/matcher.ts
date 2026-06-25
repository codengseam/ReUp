// src/lib/resume/matcher.ts
// ReUp v2 Phase 4 P1 (D1-D3): Match Report engine.
//
// D1: MatchReport shape — defined in ./types.ts (added in this phase).
// D2: classifyDimensions() — for each of the 8 Skills loaded from data/skills.json,
//     scan the resume for keywords, attach the first matching bullet as evidence,
//     and compute score = matching_bullets / total_bullets.
// D3: generatePriorities() — single LLM invoke() to suggest top-3 actions, with
//     a static default fallback when the LLM is missing, throws, or returns
//     invalid JSON.
//
// Spec: docs/superpowers/specs/2026-06-14-reup-v2-design.md §8.D
// Constraints: TS strict, no any, ≥80% coverage, mock LLMClient in D3 tests.

import { LLMClient, type Message } from '@/server/llm/llm-client';
import { loadSkillsSync } from '@/server/rag/skills-loader';
import type { JDDocument } from '@/features/jd/types';
import type { MatchReport, ResumeDocument } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-skill dimension summary used by D2. */
export interface DimensionEntry {
  /** First bullet / line that contained a matching keyword (empty if none). */
  evidence: string;
  /** Number of bullets matching this skill / total bullets, clamped to [0,1]. */
  score: number;
}

export type DimensionMap = Record<string, DimensionEntry>;

export interface GeneratePrioritiesOptions {
  llmClient?: LLMClient;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Static default priorities (per spec): used when LLM is unavailable or returns invalid JSON. */
export const DEFAULT_PRIORITIES: ReadonlyArray<MatchReport['priorities'][number]> = [
  { rank: 1, action: '在 Top 3 工作描述中添加量化数据（如：提升性能 30%、覆盖用户 100W+）', expectedImpact: 'High' },
  { rank: 2, action: '将 JD 中的核心技术栈明确写入技能列表和项目描述', expectedImpact: 'Medium' },
  { rank: 3, action: '在简历顶部添加 1 行个人亮点总结', expectedImpact: 'Low' },
];

const PRIORITY_PROMPT_SYSTEM =
  '你是简历优化顾问。基于候选人的简历和与目标 JD 的差距，给出 3 条最关键的可执行优化建议。' +
  '严格输出 JSON 数组（rank/action/expectedImpact），不输出其他内容。';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive lightweight keywords from a Skill entry (name + framework + step names).
 * The 8 Skills in data/skills.json don't have a `keywords` field, so we tokenize
 * the human-readable framework + steps to get useful match terms.
 */
function deriveSkillKeywords(skill: { name: string; framework: string; steps: string[] }): string[] {
  const out = new Set<string>();
  // Skill name (e.g. "晋升底层逻辑", "亮点挖掘") — usually a strong signal
  if (skill.name) out.add(skill.name.toLowerCase());
  // Tokenize the framework on Chinese + English boundaries, drop tiny tokens
  for (const tok of tokenizePhrases(skill.framework)) {
    if (tok.length >= 2) out.add(tok);
  }
  for (const step of skill.steps) {
    for (const tok of tokenizePhrases(step)) {
      if (tok.length >= 2) out.add(tok);
    }
  }
  return Array.from(out);
}

/** Split a string into lowercase phrase tokens, handling CJK as n-grams (1+2 char). */
function tokenizePhrases(text: string): string[] {
  const out: string[] = [];
  const lowered = text.toLowerCase();
  // CJK runs → unigrams + bigrams
  const cjkRe = /[\u4e00-\u9fff]+/g;
  let m: RegExpExecArray | null;
  while ((m = cjkRe.exec(lowered)) !== null) {
    const run = m[0];
    for (let i = 0; i < run.length; i++) {
      out.push(run[i]!);
      if (i + 2 <= run.length) out.push(run.substring(i, i + 2));
    }
  }
  // English/letter tokens
  for (const w of lowered.split(/[^a-z0-9+#.]+/)) {
    if (w.length >= 2) out.push(w);
  }
  return out;
}

function collectBullets(resume: ResumeDocument): string[] {
  const bullets: string[] = [];
  for (const e of resume.experience) {
    for (const b of e.bullets) bullets.push(b);
  }
  for (const p of resume.projects) {
    for (const b of p.bullets) bullets.push(b);
  }
  return bullets;
}

function bulletContainsKeyword(bullet: string, keywords: string[]): boolean {
  const haystack = bullet.toLowerCase();
  for (const kw of keywords) {
    if (kw.length === 0) continue;
    if (haystack.includes(kw)) return true;
  }
  return false;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ---------------------------------------------------------------------------
// D2: classifyDimensions
// ---------------------------------------------------------------------------

/**
 * For each of the 8 Skills loaded from data/skills.json, scan the resume's
 * experience + project bullets. Return a per-skill entry:
 *  - `evidence`: the first matching bullet (or '' if none)
 *  - `score`: matching_bullets / total_bullets (0 when no bullets)
 */
export function classifyDimensions(resume: ResumeDocument): DimensionMap {
  const skills = loadSkillsSync().skills;
  const bullets = collectBullets(resume);
  const total = bullets.length;
  const out: DimensionMap = {};

  // Pre-compute keyword sets per skill to avoid recalculation inside the loop
  const skillKeywords = skills.map((skill) => ({
    id: skill.id,
    keywords: deriveSkillKeywords(skill),
  }));

  for (const { id, keywords } of skillKeywords) {
    let firstEvidence = '';
    let matchCount = 0;
    for (const b of bullets) {
      if (bulletContainsKeyword(b, keywords)) {
        matchCount += 1;
        if (firstEvidence.length === 0) firstEvidence = b;
      }
    }
    out[id] = {
      evidence: firstEvidence,
      score: total === 0 ? 0 : clamp01(matchCount / total),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// D3: generatePriorities
// ---------------------------------------------------------------------------

/**
 * Ask the LLM for the top 3 actionable priorities to improve the resume for a
 * given JD, based on the current strengths/gaps. If the LLM is missing, throws,
 * returns invalid JSON, or returns the wrong shape, return the static default.
 */
export async function generatePriorities(
  resume: ResumeDocument,
  matchReport: Omit<MatchReport, 'priorities'>,
  opts: GeneratePrioritiesOptions = {},
): Promise<MatchReport['priorities']> {
  if (opts.llmClient) {
    try {
      const { system, user } = buildPrioritiesPrompt(resume, matchReport);
      const messages: Message[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      const res = await opts.llmClient.invoke(messages);
      const parsed = parsePriorities(res.content);
      if (parsed) return parsed;
    } catch {
      // Fall through to default.
    }
  }
  return DEFAULT_PRIORITIES.map((p) => ({ ...p }));
}

function buildPrioritiesPrompt(
  resume: ResumeDocument,
  matchReport: Omit<MatchReport, 'priorities'>,
): { system: string; user: string } {
  const summary = {
    name: resume.basic.name ?? '(未填)',
    title: resume.basic.title ?? '(未填)',
    yearsOfExperience: resume.basic.yearsOfExperience ?? null,
    skills: resume.skills,
    strengths: matchReport.strengths,
    gaps: matchReport.gaps,
  };
  const compact = JSON.stringify(summary);
  return {
    system: PRIORITY_PROMPT_SYSTEM,
    user: `请基于以下候选人与目标 JD 的差距，给出 3 条最关键的可执行优化建议。\n` +
      `对每条建议预估预期影响（High / Medium / Low），并按 rank 1/2/3 排序。\n` +
      `严格输出 JSON 数组，每项格式 {"rank": 1|2|3, "action": "...", "expectedImpact": "High|Medium|Low"}。\n\n` +
      `## 候选人摘要\n\`\`\`json\n${compact}\n\`\`\``,
  };
}

/**
 * Parse the LLM response as a JSON array of `{rank, action, expectedImpact}`.
 * Tolerant of: code fences, prose wrappers, rank values that arrive as strings
 * or as out-of-order indices. Returns null on any failure.
 */
function parsePriorities(content: string): MatchReport['priorities'] | null {
  if (!content || content.length === 0) return null;
  let body = content.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = (fence[1] ?? '').trim();
  const first = body.indexOf('[');
  const last = body.lastIndexOf(']');
  if (first < 0 || last < 0 || last < first) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.substring(first, last + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: MatchReport['priorities'] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const action = obj.action;
    const impact = obj.expectedImpact;
    if (typeof action !== 'string' || action.length === 0) continue;
    if (typeof impact !== 'string' || impact.length === 0) continue;
    const rankRaw = obj.rank;
    let rank: 1 | 2 | 3;
    if (typeof rankRaw === 'number') {
      rank = clampRank(rankRaw);
    } else if (typeof rankRaw === 'string') {
      const n = parseInt(rankRaw, 10);
      if (!Number.isFinite(n)) continue;
      rank = clampRank(n);
    } else {
      // Default to (out.length + 1) clamped to 3
      rank = clampRank(out.length + 1);
    }
    out.push({ rank, action, expectedImpact: impact });
    if (out.length === 3) break;
  }
  // Validate: must have at least 1 valid item
  if (out.length === 0) return null;
  // Pad / re-rank to exactly 3 with the static default
  while (out.length < 3) {
    const fallback = DEFAULT_PRIORITIES[out.length];
    if (!fallback) break;
    out.push({ ...fallback });
  }
  // Ensure ranks are 1, 2, 3 in order
  out[0]!.rank = 1;
  out[1]!.rank = 2;
  out[2]!.rank = 3;
  return out.slice(0, 3);
}

function clampRank(n: number): 1 | 2 | 3 {
  const i = Math.round(n);
  if (i <= 1) return 1;
  if (i >= 3) return 3;
  return i as 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// JD-driven match report (replaces skill-based matching for resume+JD flow)
// ---------------------------------------------------------------------------

/** A matchable dimension derived from the JD. */
interface JDMatchDimension {
  id: string;
  label: string;
  weight: number;
  source: 'hardRequirement' | 'skill' | 'responsibility' | 'focusPoint';
}

function deriveJDDimensions(jd: JDDocument): JDMatchDimension[] {
  const dims: JDMatchDimension[] = [];
  for (const req of jd.hardRequirements) {
    const weight = req.priority === 'must' ? 3 : 1;
    dims.push({ id: `req-${dims.length}`, label: req.description, weight, source: 'hardRequirement' });
  }
  for (const skill of jd.skills) {
    const weight = skill.required ? 2 : 1;
    // Use only skill.name as label — level (精通/熟悉) is self-assessment, not a match keyword.
    dims.push({ id: `skill-${dims.length}`, label: skill.name, weight, source: 'skill' });
  }
  for (const resp of jd.responsibilities.slice(0, 10)) {
    dims.push({ id: `resp-${dims.length}`, label: resp, weight: 1, source: 'responsibility' });
  }
  for (const fp of jd.focusPoints?.slice(0, 5) ?? []) {
    const weight = fp.weight === 'high' ? 2 : fp.weight === 'medium' ? 1 : 0.5;
    dims.push({ id: `fp-${dims.length}`, label: fp.description, weight, source: 'focusPoint' });
  }
  return dims;
}

function resumeText(resume: ResumeDocument): string {
  const parts: string[] = [];
  parts.push(resume.basic.title ?? '', resume.raw);
  for (const s of resume.skills) parts.push(s);
  for (const e of resume.experience) {
    parts.push(e.company, e.role);
    for (const b of e.bullets) parts.push(b);
  }
  for (const p of resume.projects) {
    parts.push(p.name);
    for (const b of p.bullets) parts.push(b);
  }
  return parts.join('\n').toLowerCase();
}

function evidenceForDimension(resume: ResumeDocument, label: string): string {
  const tokens = tokenizePhrases(label).filter((t) => t.length >= 2);
  const text = resumeText(resume);

  // Matching strategy:
  // - English tokens (length >= 2, e.g. "Java"): 1 hit suffices.
  // - Short CJK labels (<= 5 chars): 1 hit suffices (e.g. "本科及以上" → "本科").
  // - Long CJK labels (> 5 chars): require 2 hits or 1 long token (>= 3 chars).
  //   This prevents false positives from generic bigrams like "工作" / "经验".
  const cjkChars = (label.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const hasEnglishToken = tokens.some((t) => /^[a-z0-9+#.]+$/.test(t));
  const minHits = hasEnglishToken || cjkChars <= 5 ? 1 : 2;

  function countHits(haystack: string): { hits: number; longHit: boolean } {
    let hits = 0;
    let longHit = false;
    for (const t of tokens) {
      if (haystack.includes(t)) {
        hits++;
        if (t.length >= 3) longHit = true;
      }
    }
    return { hits, longHit };
  }

  function isMatch(haystack: string): boolean {
    const { hits, longHit } = countHits(haystack);
    if (hits >= minHits) return true;
    return hits >= 1 && longHit;
  }

  for (const e of resume.experience) {
    for (const b of e.bullets) {
      if (isMatch(b.toLowerCase())) return b;
    }
  }
  for (const p of resume.projects) {
    for (const b of p.bullets) {
      if (isMatch(b.toLowerCase())) return b;
    }
  }
  for (const s of resume.skills) {
    if (isMatch(s.toLowerCase())) return s;
  }
  if (isMatch(text)) {
    return '（简历原文中提及相关关键词）';
  }
  return '';
}

function severityFromWeight(weight: number): 'high' | 'medium' | 'low' {
  if (weight >= 2.5) return 'high';
  if (weight >= 1.5) return 'medium';
  return 'low';
}

/**
 * Build a JD-driven match report.
 * Overall score = weighted hits / weighted total, clamped to [0,1].
 */
export function buildMatchReportFromJD(
  resume: ResumeDocument,
  jd: JDDocument,
): Omit<MatchReport, 'priorities'> {
  const dims = deriveJDDimensions(jd);
  const strengths: MatchReport['strengths'] = [];
  const gaps: MatchReport['gaps'] = [];

  for (const dim of dims) {
    const evidence = evidenceForDimension(resume, dim.label);
    if (evidence.length > 0) {
      strengths.push({ dimension: dim.label, evidence });
    } else {
      gaps.push({ dimension: dim.label, severity: severityFromWeight(dim.weight) });
    }
  }

  return { strengths, gaps };
}

/** Compute overall match percentage (0-100) from a JD-driven partial match. */
export function computeOverallMatchScore(
  partial: Omit<MatchReport, 'priorities'>,
  jd: JDDocument,
): number {
  const dims = deriveJDDimensions(jd);
  if (dims.length === 0) return 0;
  const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return 0;
  const hitLabels = new Set(partial.strengths.map((s) => s.dimension));
  const hitWeight = dims.filter((d) => hitLabels.has(d.label)).reduce((sum, d) => sum + d.weight, 0);
  return Math.round((hitWeight / totalWeight) * 100);
}
