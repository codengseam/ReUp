// src/lib/resume/prompts/match.ts
// ReUp v2 Phase 6 (C2): match-report prompt + builder.
//
// Extracted from src/app/api/resume/match-report/route.ts so the prompt
// string lives in a single, importable location — and can be overridden
// at runtime via the admin UI (key: `resume.matchPrompt`).
//
// `DEFAULT_MATCH_REPORT_PROMPT` is the system prompt. The route injects
// the full structured `ResumeDocument` (truncated if huge) plus the JD
// text into the user turn. We also embed the JSON shape requirement
// directly in the system prompt so the model produces deterministic
// output even when no custom prompt is configured.

import { DEFAULT_MATCH_PROMPT } from '@/lib/prompts/registry';

/**
 * Default system prompt for the LLM-driven match report generator.
 * Exported so the admin UI can show "恢复默认" content.
 *
 * 实际文本来自统一提示词注册表，保证 admin UI 与运行时一致。
 */
export const DEFAULT_MATCH_REPORT_PROMPT = DEFAULT_MATCH_PROMPT;

/** Max characters of the serialized resume we'll include in the user turn. */
export const MAX_RESUME_INJECT_CHARS = 6000;

/**
 * Build the user-turn prompt: full structured resume (truncated) + JD.
 * Pure function — no LLM call, safe to call from tests.
 */
export function buildMatchReportUserPrompt(
  serializedResume: string,
  jd: string,
): string {
  let resumeBlock = serializedResume;
  if (resumeBlock.length > MAX_RESUME_INJECT_CHARS) {
    resumeBlock = resumeBlock.slice(0, MAX_RESUME_INJECT_CHARS) + '\n…(已截断)';
  }
  return `简历内容（结构化 JSON）:\n${resumeBlock}\n\n目标职位描述(JD):\n${jd}`;
}
