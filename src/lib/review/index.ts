// src/lib/review/index.ts
// Interview Review 模块主入口

import { z } from 'zod';
import type { LLMClient } from '@/lib/llm-client';
import type { ReviewInput, ReviewResult } from './types';
import { buildReviewPrompt } from './prompt';
import { generateFallbackReview } from './fallback';

// ── Re-exports ──────────────────────────────────────────────
export * from './types';
export { getDimensionWeights, computeOverallScore, getVerdict } from './scoring';
export { generateFallbackReview } from './fallback';
export { buildReviewPrompt } from './prompt';

// ── Zod schemas for LLM output validation ───────────────────

const PerQuestionEvaluationSchema = z.object({
  accuracy: z.number().min(0).max(10),
  depth: z.number().min(0).max(10),
  clarity: z.number().min(0).max(10),
  structure: z.number().min(0).max(10),
});

const PerQuestionFeedbackSchema = z.object({
  question_id: z.string(),
  score: z.number().min(0).max(10),
  evaluation: PerQuestionEvaluationSchema,
  what_went_well: z.array(z.string()),
  what_to_improve: z.array(z.string()),
  model_answer: z.string().optional(),
  followups: z.array(z.string()).optional(),
});

const GreatMomentSchema = z.object({
  question_id: z.string(),
  snippet: z.string(),
  why: z.string(),
});

const TopIssueSchema = z.object({
  question_id: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
  category: z.enum(['knowledge_gap', 'communication', 'depth', 'edge_case', 'tradeoff', 'behavioral_red_flag']),
  snippet: z.string(),
  problem: z.string(),
  suggestion: z.string(),
  reference_answer: z.string().optional(),
});

const ActionableItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(['P0', 'P1', 'P2']),
  estimated_hours: z.number(),
  resources: z.array(z.string()).optional(),
});

const ReviewDimensionsSchema = z.object({
  technical_depth: z.number().min(0).max(10),
  communication: z.number().min(0).max(10),
  problem_solving: z.number().min(0).max(10),
  project_mastery: z.number().min(0).max(10),
  behavioral_fit: z.number().min(0).max(10),
  system_design: z.number().min(0).max(10).optional(),
});

export const LLMReviewOutputSchema = z.object({
  summary: z.string(),
  overall_score: z.number().min(0).max(10),
  overall_verdict: z.enum(['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire', 'strong_no_hire']),
  dimensions: ReviewDimensionsSchema,
  great_moments: z.array(GreatMomentSchema),
  top_issues: z.array(TopIssueSchema),
  per_question_feedback: z.array(PerQuestionFeedbackSchema),
  actionable_items: z.array(ActionableItemSchema),
});

// ── Helpers ─────────────────────────────────────────────────

/**
 * 尝试从 LLM 响应文本中提取 JSON。
 * 支持以下格式：
 * 1. 纯 JSON 文本
 * 2. ```json ... ``` 代码块
 * 3. ``` ... ``` 代码块
 */
function extractJSON(text: string): string {
  // 尝试匹配 ```json ... ``` 代码块
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlock) return jsonBlock[1].trim();

  // 尝试匹配 ``` ... ``` 代码块
  const codeBlock = text.match(/```\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  // 尝试匹配 { ... } 最外层 JSON
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

// ── Main function ───────────────────────────────────────────

/**
 * 生成面试复盘报告。
 *
 * 流程：
 * 1. 构建 prompt
 * 2. 调用 LLM
 * 3. 解析 JSON 响应
 * 4. Zod 校验
 * 5. 失败时降级到 fallback
 */
export async function generateReview(llm: LLMClient, input: ReviewInput): Promise<ReviewResult> {
  const startTime = Date.now();

  const prompt = buildReviewPrompt(input);

  let llmContent: string;
  let modelUsed = 'unknown';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    llmContent = response.content;
    modelUsed = response.model ?? 'unknown';
    inputTokens = response.usage?.promptTokens ?? 0;
    outputTokens = response.usage?.completionTokens ?? 0;
  } catch {
    // LLM 调用失败 → 降级
    return generateFallbackReview(input);
  }

  // 解析 JSON
  const jsonStr = extractJSON(llmContent);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // JSON 解析失败 → 降级
    return generateFallbackReview(input);
  }

  // Zod 校验
  const validated = LLMReviewOutputSchema.safeParse(parsed);
  if (!validated.success) {
    // Schema 校验失败 → 降级
    return generateFallbackReview(input);
  }

  const data = validated.data;
  const totalLatencyMs = Date.now() - startTime;

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    overallScore: data.overall_score,
    overallVerdict: data.overall_verdict,
    summary: data.summary,
    dimensions: {
      technicalDepth: data.dimensions.technical_depth,
      communication: data.dimensions.communication,
      problemSolving: data.dimensions.problem_solving,
      projectMastery: data.dimensions.project_mastery,
      behavioralFit: data.dimensions.behavioral_fit,
      ...(data.dimensions.system_design !== undefined
        ? { systemDesign: data.dimensions.system_design }
        : {}),
    },
    greatMoments: data.great_moments.map(m => ({
      questionId: m.question_id,
      snippet: m.snippet,
      why: m.why,
    })),
    topIssues: data.top_issues.map(i => ({
      questionId: i.question_id,
      severity: i.severity,
      category: i.category,
      snippet: i.snippet,
      problem: i.problem,
      suggestion: i.suggestion,
      ...(i.reference_answer ? { referenceAnswer: i.reference_answer } : {}),
    })),
    perQuestionFeedback: data.per_question_feedback.map(f => ({
      questionId: f.question_id,
      score: f.score,
      evaluation: f.evaluation,
      whatWentWell: f.what_went_well,
      whatToImprove: f.what_to_improve,
      ...(f.model_answer ? { modelAnswer: f.model_answer } : {}),
      ...(f.followups ? { followups: f.followups } : {}),
    })),
    actionableItems: data.actionable_items.map(a => ({
      title: a.title,
      description: a.description,
      priority: a.priority,
      estimatedHours: a.estimated_hours,
      ...(a.resources ? { resources: a.resources } : {}),
    })),
    trace: {
      modelUsed,
      inputTokens,
      outputTokens,
      totalLatencyMs,
      ragChunksUsed: input.ragChunks?.length ?? 0,
    },
    createdAt: new Date().toISOString(),
  };
}