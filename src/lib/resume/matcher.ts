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

import { LLMClient, type Message } from '@/lib/llm-client';
import { loadSkillsSync } from '@/lib/skills-loader';
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
  { rank: 1, action: 'Add quantified metrics to your top 3 bullets', expectedImpact: 'High' },
  { rank: 2, action: 'Highlight relevant skills from the JD', expectedImpact: 'Medium' },
  { rank: 3, action: 'Add a 1-line summary at the top', expectedImpact: 'Low' },
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

  for (const skill of skills) {
    const keywords = deriveSkillKeywords(skill);
    let firstEvidence = '';
    let matchCount = 0;
    for (const b of bullets) {
      if (bulletContainsKeyword(b, keywords)) {
        matchCount += 1;
        if (firstEvidence.length === 0) firstEvidence = b;
      }
    }
    out[skill.id] = {
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
