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

/**
 * Default system prompt for the LLM-driven match report generator.
 * Exported so the admin UI can show "恢复默认" content.
 */
export const DEFAULT_MATCH_REPORT_PROMPT = `你是一位资深 HR 和技术面试官。请根据以下简历内容和目标职位描述（JD），生成一份匹配度分析报告。

要求：
1. 分析维度必须基于简历内容和 JD 内容的对比，例如"自动化测试能力"、"性能测试经验"、"Python 开发能力"等具体能力维度。
2. 不要使用抽象 ID 或英文标识符作为维度名，使用中文能力描述。
3. 每条 strength 必须引用简历原文片段作为 evidence（不少于 8 个汉字）。
4. 优势和短板各列出 3-5 条。
5. 优先级建议给出 3 条，按影响程度排序。
6. 严格基于简历事实：strength 的 evidence 必须能在简历中找到对应原文；gap 必须能在 JD 中找到对应要求。

请严格按以下 JSON 格式输出（不要输出其他内容、Markdown 标题或代码块）：
{
  "strengths": [
    { "dimension": "具体能力维度名", "evidence": "简历原文片段" }
  ],
  "gaps": [
    { "dimension": "具体能力维度名", "severity": "high" | "medium" | "low" }
  ],
  "priorities": [
    { "rank": 1, "action": "具体改进建议", "expectedImpact": "High" | "Medium" | "Low" }
  ]
}`;

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
