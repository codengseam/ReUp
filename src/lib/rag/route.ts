// src/lib/rag/route.ts
// 1:1 迁移自 rag.ts:484-678

import { LLMClient, type InvokeOptions } from '@/lib/llm-client';
import { getCached, setCache, type CacheEntry } from './cache';

// ========== LLM route cache ==========
const routeCache = new Map<string, CacheEntry<{ strategy: 'direct' | 'multiquery' | 'hyde'; rewrittenQuery: string; subQueries?: string[]; confidence: number }>>();
const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;

function routeCacheKey(query: string, chatHistory: Array<{ role: string; content: string }>): string {
  const historySig = chatHistory.slice(-3).map(m => `${m.role.charAt(0)}:${m.content.substring(0, 40)}`).join('|');
  return `${query}::${historySig}`;
}

// ========== 8. LLM查询路由 ==========
async function routeQueryViaLLM(
  query: string,
  chatHistory: Array<{ role: string; content: string }> = []
): Promise<{ strategy: 'direct' | 'multiquery' | 'hyde'; rewrittenQuery: string; subQueries?: string[]; confidence: number }> {
  const cacheKey = routeCacheKey(query, chatHistory);
  const cached = getCached(routeCache, cacheKey);
  if (cached) {
    return cached;
  }

  let result: { strategy: 'direct' | 'multiquery' | 'hyde'; rewrittenQuery: string; subQueries?: string[]; confidence: number };
  try {
    const llmClient = new LLMClient();

    const historyStr = chatHistory.length > 0
      ? `\n对话历史：\n${chatHistory.slice(-4).map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.substring(0, 100)}`).join('\n')}`
      : '';

    const prompt = `你是一个查询分析专家。分析用户查询，决定最优检索策略。

策略说明：
- direct: 简单明确的问题，直接检索即可
- multiquery: 复杂问题，需要分解为多个子问题分别检索
- hyde: 问题模糊或信息不足，需要先生成假想答案再检索

${historyStr}
当前用户查询：${query}

请回复JSON格式：
{
  "strategy": "direct" | "multiquery" | "hyde",
  "rewrittenQuery": "重写后的标准化查询",
  "subQueries": ["子问题1", "子问题2"],
  "confidence": 0.0-1.0
}

如果是multiquery，subQueries必须包含2-3个子问题。
如果是其他策略，subQueries为空数组。`;

    const invokeOpts: InvokeOptions = {
      temperature: 0.1,
    };

    const response = await llmClient.invoke(
      [{ role: 'user', content: prompt }],
      invokeOpts
    );

    if (response && response.content) {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            strategy: 'direct' | 'multiquery' | 'hyde';
            rewrittenQuery: string;
            subQueries?: string[];
            confidence: number;
          };
          if (['direct', 'multiquery', 'hyde'].includes(parsed.strategy)) {
            console.log('[RAG] LLM routed query:', parsed.strategy, 'rewritten:', parsed.rewrittenQuery?.substring(0, 30));
            result = {
              strategy: parsed.strategy,
              rewrittenQuery: parsed.rewrittenQuery || query,
              subQueries: parsed.subQueries?.filter(q => q && q.trim().length > 0),
              confidence: parsed.confidence ?? 0.5,
            };
          } else {
            throw new Error('invalid strategy');
          }
        } catch (parseErr) {
          console.log('[RAG] LLM returned malformed JSON route, falling back:', parseErr);
          throw parseErr;
        }
      } else {
        throw new Error('no json match');
      }
    } else {
      throw new Error('empty response');
    }
  } catch (error) {
    console.log('[RAG] LLM查询路由失败，使用本地规则降级:', error instanceof Error ? error.message : String(error));
    // 降级: 本地规则路由
    result = routeQueryLocal(query);
  }

  setCache(routeCache, cacheKey, result, ROUTE_CACHE_TTL_MS);
  return result;
}

// 测试专用：清空路由缓存，避免跨测试用例污染。
export function _resetRouteCache(): void {
  routeCache.clear();
}

// 本地规则路由降级
function routeQueryLocal(
  query: string
): { strategy: 'direct' | 'multiquery' | 'hyde'; rewrittenQuery: string; subQueries?: string[]; confidence: number } {
  const len = query.length;
  const hasMultipleQuestions = /同时|另外|而且|以及|并且/.test(query) || (query.match(/[？?]/g) || []).length > 1;
  const isVague = len < 8 || /怎么|如何|什么/.test(query) && len < 15;

  if (hasMultipleQuestions) {
    return { strategy: 'multiquery', rewrittenQuery: query, confidence: 0.6 };
  } else if (isVague) {
    return { strategy: 'hyde', rewrittenQuery: query, confidence: 0.5 };
  }
  return { strategy: 'direct', rewrittenQuery: query, confidence: 0.8 };
}

// ========== 9. LLM查询类别推断 ==========
async function inferQueryCategoryViaLLM(
  query: string
): Promise<string> {
  try {
    const llmClient = new LLMClient();

    const prompt = `判断以下用户查询属于哪个类别：
- all: 通用查询

只返回一个类别词（all），不要其他内容。

用户查询：${query}`;

    const invokeOpts: InvokeOptions = {
      temperature: 0.0,
    };

    const response = await llmClient.invoke(
      [{ role: 'user', content: prompt }],
      invokeOpts
    );

    if (response && response.content) {
      const text = response.content.trim().toLowerCase();
      if (text.includes('all')) return 'all';
    }
  } catch (error) {
    console.log('[RAG] LLM类别推断失败，使用本地规则降级:', error instanceof Error ? error.message : String(error));
  }

  // 降级: 本地关键词匹配
  return inferQueryCategoryLocal(query);
}

function inferQueryCategoryLocal(query: string): string {
  // 框架通用化后：不再硬编码领域关键词，统一返回 'all'（不做分类过滤）。
  // 调用方可基于自身知识库自行扩展领域分类逻辑。
  void query;
  return 'all';
}

// ========== 10. LLM查询重写 ==========
async function rewriteQueryViaLLM(
  query: string,
  chatHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  try {
    const llmClient = new LLMClient();

    const historyStr = chatHistory.length > 0
      ? `\n对话历史：\n${chatHistory.slice(-4).map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.substring(0, 100)}`).join('\n')}`
      : '';

    const prompt = `你是一个查询重写专家。将用户的口语化提问转换为适合知识库检索的标准化查询。

要求：
1. 补全指代词（如"它"→具体事物，"这个问题"→具体问题）
2. 将口语化表达转为正式专业表达
3. 保留核心语义，不要添加新信息
4. 如果原文已经足够清晰，可以保持不变
${historyStr}
用户原始提问：${query}

只输出重写后的查询，不要其他内容。`;

    const invokeOpts: InvokeOptions = {
      temperature: 0.1,
    };

    const response = await llmClient.invoke(
      [{ role: 'user', content: prompt }],
      invokeOpts
    );

    if (response && response.content && response.content.trim().length > 0) {
      const rewritten = response.content.trim();
      if (rewritten !== query) {
        console.log('[RAG] Query rewritten:', query.substring(0, 30), '→', rewritten.substring(0, 30));
      }
      return rewritten;
    }
  } catch (error) {
    console.log('[RAG] LLM查询重写失败，使用原文降级:', error instanceof Error ? error.message : String(error));
  }

  return query;
}

export {
  routeQueryViaLLM,
  routeQueryLocal,
  inferQueryCategoryViaLLM,
  inferQueryCategoryLocal,
  rewriteQueryViaLLM,
};
