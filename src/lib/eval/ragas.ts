// src/lib/eval/ragas.ts
// M2: RAGAS 评估指标实现 (faithfulness / answer_relevancy / context_relevancy)
// 参考: RAGAS paper §3 - https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/

import { LLMClient, type ModelCandidate } from '@/lib/llm-client';
import { getModelCandidates } from '@/lib/runtime-config';

const EVAL_MODEL_ID = 'qwen3.6-plus-2026-04-02';
const EVAL_TIMEOUT_MS = 30_000;

export interface FaithfulnessClaim {
  statement: string;
  supported: boolean;
  reason: string;
}

export interface FaithfulnessResult {
  score: number; // 0-1, -1 表示 LLM 调用失败
  claims: FaithfulnessClaim[];
  error?: string;
}

export interface RelevancyResult {
  score: number; // 0-1, -1 表示 LLM 调用失败
  reason: string;
  error?: string;
}

/** 提取 JSON 块 (容错: LLM 可能直接返回 JSON, 包 ```json 围栏, 或夹在文本中) */
export function extractJson<T>(text: string): T | null {
  const trimmed = text.trim();
  // 1. 直接 JSON.parse (LLM 严格遵守 prompt)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) as T; } catch { /* fallthrough */ }
  }
  // 2. 去 markdown 围栏
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1].trim()) as T; } catch { /* fallthrough */ }
  }
  // 3. 平衡大括号匹配 - 找所有顶层 {...} 块, 从最后一个开始试 (响应通常在末尾)
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (trimmed[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(trimmed.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    try { return JSON.parse(candidates[i]) as T; } catch { /* try next */ }
  }
  return null;
}

/**
 * Faithfulness: 把 answer 拆成 claims, 验证每个 claim 是否可从 context 推导
 * 分数 = supported_claims / total_claims
 */
export async function evaluateFaithfulness(
  answer: string,
  context: string,
): Promise<FaithfulnessResult> {
  if (!answer?.trim()) {
    return { score: 0, claims: [], error: 'empty answer' };
  }
  const prompt = `请将以下回答拆分为独立的陈述句 (claims), 并判断每个陈述是否可以从给定的上下文中推导出来。

上下文：
${context || '(无)'}

回答：
${answer}

请返回严格的 JSON 格式 (无 markdown 围栏):
{
  "claims": [
    { "statement": "陈述内容", "supported": true, "reason": "判断依据" }
  ]
}`;

  try {
    const client = new LLMClient();
    const models: ModelCandidate[] = await getModelCandidates(EVAL_MODEL_ID);
    const response = await client.invoke(
      [{ role: 'user', content: prompt }],
      {
        models: models.length > 0 ? models : undefined,
        model: models.length === 0 ? EVAL_MODEL_ID : undefined,
        temperature: 0,
        timeoutMs: EVAL_TIMEOUT_MS,
      },
    );
    const parsed = extractJson<{ claims?: FaithfulnessClaim[] }>(response.content);
    const claims = parsed?.claims ?? [];
    // I1 修复: 解析失败/空 claims 时 score=null, 不再静默给 1.0 (vacuous truth)
    if (claims.length === 0) {
      return {
        score: -1,
        claims: [],
        error: parsed ? 'empty claims array' : 'JSON parse failed',
      };
    }
    const supported = claims.filter(c => c.supported).length;
    return { score: supported / claims.length, claims };
  } catch (err) {
    return { score: -1, claims: [], error: String(err) };
  }
}

/**
 * Answer Relevancy: LLM 直接打分 (0-1) - 简化版 (无 embedding 相似度)
 */
export async function evaluateAnswerRelevancy(
  answer: string,
  query: string,
): Promise<RelevancyResult> {
  if (!answer?.trim() || !query?.trim()) {
    return { score: 0, reason: 'empty input', error: 'empty input' };
  }
  const prompt = `评估以下回答与原始问题的相关性。回答是否直接、完整地回应了问题？

原始问题：${query}

回答：${answer}

请返回严格的 JSON 格式 (无 markdown 围栏):
{
  "relevancy": 0.0 到 1.0 之间的数字,
  "reason": "评估理由"
}`;

  try {
    const client = new LLMClient();
    const models: ModelCandidate[] = await getModelCandidates(EVAL_MODEL_ID);
    const response = await client.invoke(
      [{ role: 'user', content: prompt }],
      {
        models: models.length > 0 ? models : undefined,
        model: models.length === 0 ? EVAL_MODEL_ID : undefined,
        temperature: 0,
        timeoutMs: EVAL_TIMEOUT_MS,
      },
    );
    const parsed = extractJson<{ relevancy?: number; reason?: string }>(response.content);
    if (!parsed || typeof parsed.relevancy !== 'number') {
      return { score: 0, reason: 'parse failed' };
    }
    return {
      score: Math.max(0, Math.min(1, parsed.relevancy)),
      reason: parsed.reason ?? '',
    };
  } catch (err) {
    return { score: -1, reason: '', error: String(err) };
  }
}

/**
 * Context Relevancy: 检索上下文与问题的相关性
 */
export async function evaluateContextRelevancy(
  context: string,
  query: string,
): Promise<RelevancyResult> {
  if (!context?.trim() || !query?.trim()) {
    return { score: 0, reason: 'empty input', error: 'empty input' };
  }
  const prompt = `评估以下检索到的上下文与问题的相关性。上下文是否包含回答问题所需的信息？

问题：${query}

检索到的上下文：
${context}

请返回严格的 JSON 格式 (无 markdown 围栏):
{
  "relevancy": 0.0 到 1.0 之间的数字,
  "reason": "评估理由"
}`;

  try {
    const client = new LLMClient();
    const models: ModelCandidate[] = await getModelCandidates(EVAL_MODEL_ID);
    const response = await client.invoke(
      [{ role: 'user', content: prompt }],
      {
        models: models.length > 0 ? models : undefined,
        model: models.length === 0 ? EVAL_MODEL_ID : undefined,
        temperature: 0,
        timeoutMs: EVAL_TIMEOUT_MS,
      },
    );
    const parsed = extractJson<{ relevancy?: number; reason?: string }>(response.content);
    if (!parsed || typeof parsed.relevancy !== 'number') {
      return { score: 0, reason: 'parse failed' };
    }
    return {
      score: Math.max(0, Math.min(1, parsed.relevancy)),
      reason: parsed.reason ?? '',
    };
  } catch (err) {
    return { score: -1, reason: '', error: String(err) };
  }
}
