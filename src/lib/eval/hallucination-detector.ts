// src/lib/eval/hallucination-detector.ts
// M2: 幻觉检测 (用户事实 vs 方法论)
// - 用户事实幻觉: LLM 编造了用户没说过的事实 (例如 "你做过 P7 项目")
// - 方法论发散: LLM 给出了书本没有的方法论/工具 (例如引用了不存在的章节)

import { LLMClient } from '@/lib/llm-client';
import { getModelCandidates } from '@/lib/runtime-config';
import { extractJson } from './ragas';

const HALLUCINATION_MODEL = 'qwen3.6-plus-2026-04-02';
const HALLUCINATION_TIMEOUT_MS = 20_000;

export interface HallucinationDetection {
  user_fact_hallucination: boolean; // 编造用户事实
  user_fact_details: string; // 详情
  methodology_hallucination: boolean; // 编造方法论引用
  methodology_details: string; // 详情
  hallucination_score: number; // 0=无幻觉, 1=完全幻觉 (overall)
  raw_response: string;
  error?: string;
}

/**
 * 检测 LLM 回答中两类幻觉:
 * 1. 用户事实幻觉: LLM 在回答中陈述了用户简历/上下文里没有的事实
 *    (例如: 用户简历写 "做过后端", LLM 却说 "你做了 5 年移动端")
 * 2. 方法论发散: LLM 引用了知识库里没有的章节/方法/工具
 */
export async function detectHallucination(
  answer: string,
  userContext: string,
  knowledgeContext: string,
): Promise<HallucinationDetection> {
  const empty: HallucinationDetection = {
    user_fact_hallucination: false,
    user_fact_details: '',
    methodology_hallucination: false,
    methodology_details: '',
    hallucination_score: 0,
    raw_response: '',
  };

  if (!answer?.trim()) {
    return { ...empty, error: 'empty answer' };
  }

  const prompt = `你是事实核查员。请判断以下"回答"中是否包含两类幻觉：

1. **用户事实幻觉 (user_fact_hallucination)**: 回答中是否陈述了用户上下文中**没有出现过**的事实
   （例如：用户上下文说"我做过后端"，回答却说"你做了 5 年移动端"）

2. **方法论发散 (methodology_hallucination)**: 回答中是否引用了知识库中**没有**的方法论/工具/章节
   （例如：知识库里没有"卡尼曼双系统"，但回答里提到"卡尼曼双系统"）

请返回严格的 JSON 格式 (无 markdown 围栏):
{
  "user_fact_hallucination": true|false,
  "user_fact_details": "如有, 具体编造了什么; 空字符串表示无",
  "methodology_hallucination": true|false,
  "methodology_details": "如有, 具体引用了什么不存在的内容; 空字符串表示无",
  "hallucination_score": 0.0-1.0 之间的数字 (0=完全无幻觉, 1=严重幻觉)
}

【用户上下文 (用户实际提供的事实)】：
${userContext || '(无)'}

【知识库上下文 (方法论引用源)】：
${knowledgeContext || '(无)'}

【LLM 回答 (待检测)】：
${answer}`;

  try {
    const client = new LLMClient();
    const models = await getModelCandidates(HALLUCINATION_MODEL);
    const response = await client.invoke(
      [{ role: 'user', content: prompt }],
      {
        models: models.length > 0 ? models : undefined,
        model: models.length === 0 ? HALLUCINATION_MODEL : undefined,
        temperature: 0,
        timeoutMs: HALLUCINATION_TIMEOUT_MS,
      },
    );
    const parsed = extractJson<Omit<HallucinationDetection, 'raw_response'>>(response.content);
    if (!parsed) {
      return { ...empty, raw_response: response.content, error: 'parse failed' };
    }
    return {
      user_fact_hallucination: parsed.user_fact_hallucination === true,
      user_fact_details: parsed.user_fact_details ?? '',
      methodology_hallucination: parsed.methodology_hallucination === true,
      methodology_details: parsed.methodology_details ?? '',
      hallucination_score: Math.max(0, Math.min(1, parsed.hallucination_score ?? 0)),
      raw_response: response.content,
    };
  } catch (err) {
    return { ...empty, error: String(err) };
  }
}
