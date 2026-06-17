// src/lib/intent-classifier.ts
// 阶段 2：把 inputGuard + routeQueryViaLLM + inferQueryCategoryViaLLM + rewriteQueryViaLLM
// 这 4 个弱 LLM 调用合并为 1 次结构化分类调用。
//
// 设计要点：
// 1. 单一 prompt 输出 7 字段 JSON（intent/strategy/rewrittenQuery/subQueries/riskLevel/reason/category）
// 2. 用 LLMClient 构造器的默认模型 + 自动 fallback（候选链由 src/lib/runtime-config.ts 决定）
// 3. 解析容错：JSON 在 prose 中也能提取；垃圾输入降级为 general/direct/low
// 4. 兼容旧版：通过 INTENT_CLASSIFIER_MODE=legacy 走"通用"路径，让调用方自己再走旧链路
// 5. 不破坏旧 inputGuard 函数（仍 export 在 src/lib/rag/safety.ts，阶段 2 留作 fallback）

import { LLMClient, type InvokeOptions } from './llm-client';

// 框架级意图分类：只保留通用三值。
// 领域特定分类（如晋升/面试/简历问答等）由调用方基于自身知识库自行扩展，
// 不在框架内硬编码；本分类器输出的 intent 仅用于框架级路由（通用/越界/越狱）。
export type IntentCategory = 'general' | 'off_topic' | 'jailbreak';

export type IntentStrategy = 'direct' | 'multiquery' | 'hyde';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface IntentResult {
  intent: IntentCategory;
  strategy: IntentStrategy;
  rewrittenQuery: string;
  subQueries?: string[];
  riskLevel: RiskLevel;
  reason: string;
  category?: string;
}

const VALID_INTENTS: readonly IntentCategory[] = ['general', 'off_topic', 'jailbreak'];
const VALID_STRATEGIES: readonly IntentStrategy[] = ['direct', 'multiquery', 'hyde'];
const VALID_RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high'];

const FALLBACK_REASON = 'fallback';
const PARSE_ERROR_REASON = 'parse_error';
const LEGACY_REASON = 'legacy_mode';

function isIntentCategory(v: unknown): v is IntentCategory {
  return typeof v === 'string' && (VALID_INTENTS as readonly string[]).includes(v);
}
function isStrategy(v: unknown): v is IntentStrategy {
  return typeof v === 'string' && (VALID_STRATEGIES as readonly string[]).includes(v);
}
function isRiskLevel(v: unknown): v is RiskLevel {
  return typeof v === 'string' && (VALID_RISK_LEVELS as readonly string[]).includes(v);
}

/**
 * 从 LLM 原始输出中解析 intent 结果。
 * 容错策略：
 * 1. 用 regex 提取首个 {...} 段（兼容 prose 中夹 JSON 的情况）
 * 2. JSON.parse 失败 / 字段类型不符 → 通用 fallback
 * 3. 任何 enum 字段值越界 → 用合法默认值
 */
export function parseIntentResponse(raw: string, originalQuery: string = ''): IntentResult {
  const fallback: IntentResult = {
    intent: 'general',
    strategy: 'direct',
    rewrittenQuery: originalQuery,
    riskLevel: 'low',
    reason: FALLBACK_REASON,
  };

  if (typeof raw !== 'string' || raw.length === 0) return fallback;

  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ...fallback, reason: FALLBACK_REASON };

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return { ...fallback, reason: PARSE_ERROR_REASON };
  }

  const rewritten =
    typeof j.rewrittenQuery === 'string' && j.rewrittenQuery.trim().length > 0
      ? j.rewrittenQuery.trim()
      : originalQuery;

  const subQueries = Array.isArray(j.subQueries)
    ? (j.subQueries.filter((s: unknown) => typeof s === 'string' && (s as string).trim().length > 0) as string[])
    : undefined;

  return {
    intent: isIntentCategory(j.intent) ? j.intent : 'general',
    strategy: isStrategy(j.strategy) ? j.strategy : 'direct',
    rewrittenQuery: rewritten,
    subQueries: subQueries && subQueries.length > 0 ? subQueries : undefined,
    riskLevel: isRiskLevel(j.riskLevel) ? j.riskLevel : 'low',
    reason: typeof j.reason === 'string' ? j.reason : '',
    category: typeof j.category === 'string' ? j.category : undefined,
  };
}

const INTENT_PROMPT = `你是一个查询分析 + 安全审核 AI。一次输出 JSON 即可，不要其他内容。

## 任务
分析用户查询，同时完成以下事：
1. intent: 话题意图（general=通用问题 / off_topic=话题越界（与知识库无关） / jailbreak=越狱或恶意请求）
2. strategy: 检索策略（direct / multiquery / hyde）
3. rewrittenQuery: 标准化后的查询（口语→正式，补全指代）
4. subQueries: 多子问题时给 2-3 个子查询；其他策略给 []
5. riskLevel: 风险等级（low / medium / high）
6. reason: 一句话说明
7. category: 仅 off_topic / jailbreak 时填子类别，否则留空

## 输出格式（严格 JSON，无 markdown）
{"intent":"...","strategy":"...","rewrittenQuery":"...","subQueries":[],"riskLevel":"...","reason":"...","category":""}

## 对话历史（可选）
{CHAT_HISTORY}

## 用户查询
{QUERY}`;

/**
 * 单次 LLM 调用获取 intent / strategy / risk。
 * - 失败 / 解析异常 → 通用 fallback（{intent:general, strategy:direct, rewrittenQuery:query, riskLevel:low}）
 * - INTENT_CLASSIFIER_MODE=legacy → 直接返回 general，让调用方走旧 inputGuard + 多 LLM 链路
 */
export async function classifyIntent(
  query: string,
  chatHistory: Array<{ role: string; content: string }> = []
): Promise<IntentResult> {
  const mode = process.env.INTENT_CLASSIFIER_MODE ?? 'unified';
  if (mode === 'legacy') {
    return {
      intent: 'general',
      strategy: 'direct',
      rewrittenQuery: query,
      riskLevel: 'low',
      reason: LEGACY_REASON,
    };
  }

  try {
    const llmClient = new LLMClient();

    const historyStr =
      chatHistory.length > 0
        ? chatHistory
            .slice(-4)
            .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.substring(0, 100)}`)
            .join('\n')
        : '（无）';

    const prompt = INTENT_PROMPT.replace('{CHAT_HISTORY}', historyStr).replace('{QUERY}', query);

    const invokeOpts: InvokeOptions = {
      temperature: 0.1,
    };

    const response = await llmClient.invoke([{ role: 'user', content: prompt }], invokeOpts);

    if (response && typeof response.content === 'string' && response.content.length > 0) {
      const result = parseIntentResponse(response.content, query);
      return result;
    }
  } catch (err) {
    console.warn(
      '[intent-classifier] LLM failed, fallback:',
      err instanceof Error ? err.message : String(err)
    );
  }

  return {
    intent: 'general',
    strategy: 'direct',
    rewrittenQuery: query,
    riskLevel: 'low',
    reason: FALLBACK_REASON,
  };
}
