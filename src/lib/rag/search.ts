// src/lib/rag/search.ts
// 1:1 迁移自 rag.ts:113-481

import { LLMClient, type InvokeOptions } from '@/lib/llm-client';
import { createKnowledgeBase } from '@/lib/knowledge-base';
import { createEmbedder } from '@/lib/embedder';
import type { ScoredChunk } from '@/lib/reranker';
import type { RAGResult } from './types';
import { getCached, setCache, type CacheEntry } from './cache';

// ========== Embedder (Phase 1.5: BGE-M3 local) ==========
// Lazy singleton backed by @xenova/transformers' Xenova/bge-m3 model.
// See src/lib/embedder.ts for the load + cache contract.
const embedder = createEmbedder();
const knowledgeBase = createKnowledgeBase({ embed: (text) => embedder.embed(text) });

// ========== Lazy LLMClient singleton (reuse across calls to avoid repeated instantiation) ==========
let _llmClient: LLMClient | null = null;
function getLLMClient(): LLMClient {
  if (!_llmClient) _llmClient = new LLMClient();
  return _llmClient;
}

// ========== LLM-heavy RAG caches (deterministic for identical inputs) ==========
const keywordCache = new Map<string, CacheEntry<string[]>>();
const hydeCache = new Map<string, CacheEntry<string | null>>();
const rerankCache = new Map<string, CacheEntry<RAGResult[]>>();
const LLM_CACHE_TTL_MS = 10 * 60 * 1000;

function rerankCacheKey(query: string, results: RAGResult[]): string {
  const sig = results.map(r => `${(r.content || '').substring(0, 80)}:${r.score.toFixed(4)}`).join('|');
  return `${query}::${sig}`;
}

// ========== 1. 语义检索（local knowledge-base） ==========
async function semanticSearch(
  query: string,
  topK: number = 5,
  minScore: number = 0.2,
  categoryFilter?: string
): Promise<RAGResult[]> {
  try {
    const opts: { category?: string } = {};
    if (categoryFilter && categoryFilter !== 'all') {
      opts.category = categoryFilter;
    }
    const chunks = await knowledgeBase.semanticSearch(query, topK, { ...opts, skipRerank: true });

    if (chunks.length === 0) {
      console.log('[RAG] No results from semantic search');
      return [];
    }

    const results: RAGResult[] = chunks
      .filter((c) => c.score >= minScore)
      .map((chunk) => mapChunkToRAGResult(chunk));

    if (categoryFilter && categoryFilter !== 'all') {
      const filtered = results.filter(r =>
        !r.category || r.category === categoryFilter
      );
      if (filtered.length > 0) return filtered;
    }

    return results;
  } catch (error) {
    console.error('[RAG] Semantic search failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

function mapChunkToRAGResult(chunk: ScoredChunk): RAGResult {
  const rawCategory = typeof chunk.category === 'string' ? chunk.category : '';
  const rawSkill = typeof chunk.skillName === 'string' ? chunk.skillName : '';
  return {
    content: chunk.text,
    score: chunk.score,
    docId: chunk.id,
    source: chunk.id || '知识库',
    category: rawCategory,
    skillName: rawSkill,
  };
}

// ========== 2. LLM关键词提取检索 ==========
// 替代原先的sparseSearch死代码——用LLM提取关键词，再用关键词做Knowledge检索
async function keywordAugmentedSearch(
  query: string,
  topK: number = 3,
  minScore: number = 0.15
): Promise<RAGResult[]> {
  try {
    const keywords = await extractKeywordsViaLLM(query);
    if (!keywords || keywords.length === 0) return [];

    // 用关键词组合作为检索query
    const keywordQuery = keywords.join(' ');
    console.log('[RAG] Keyword-augmented search with:', keywordQuery);

    return await semanticSearch(keywordQuery, topK, minScore, undefined);
  } catch (error) {
    console.log('[RAG] Keyword-augmented search failed, skipping:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

// ========== 3. LLM关键词提取 ==========
async function extractKeywordsViaLLM(
  text: string
): Promise<string[]> {
  const cacheKey = text;
  const cached = getCached(keywordCache, cacheKey);
  if (cached) {
    return cached;
  }

  let keywords: string[];
  try {
    const llmClient = getLLMClient();

    const prompt = `从以下文本中提取3-5个最重要的关键词，用于知识库检索。关键词应该是专业术语、核心概念或重要实体。只返回关键词，用逗号分隔，不要其他内容。

文本：${text}`;

    const invokeOpts: InvokeOptions = {
      temperature: 0.1,
    };

    const response = await llmClient.invoke(
      [{ role: 'user', content: prompt }],
      invokeOpts
    );

    if (response && response.content) {
      keywords = response.content
        .split(/[,，、\s]+/)
        .map(k => k.trim())
        .filter(k => k.length > 0 && k.length <= 10);
      console.log('[RAG] LLM extracted keywords:', keywords);
    } else {
      keywords = [];
    }
  } catch (error) {
    console.log('[RAG] LLM关键词提取失败，使用本地分词降级:', error instanceof Error ? error.message : String(error));
    // 降级: 本地简单分词
    keywords = extractKeywordsLocal(text);
  }

  setCache(keywordCache, cacheKey, keywords, LLM_CACHE_TTL_MS);
  return keywords;
}

// 本地分词降级方案（仅在LLM调用失败时使用）
function extractKeywordsLocal(text: string): string[] {
  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都',
    '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
    '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它',
    '什么', '怎么', '为什么', '吗', '呢', '吧', '啊', '呀',
    '能', '可以', '应该', '需要', '想', '做', '把', '被', '让',
    '给', '从', '对', '但', '而', '如果', '因为', '所以', '还是',
  ]);

  const keywords: string[] = [];
  const segments = text.split(/[\s,，。.!！?？;；:：、]+/).filter(Boolean);

  for (const seg of segments) {
    if (seg.length <= 4 && !stopWords.has(seg)) {
      keywords.push(seg);
    } else if (seg.length > 4) {
      for (let len = 2; len <= Math.min(3, seg.length); len++) {
        for (let i = 0; i <= seg.length - len; i++) {
          const sub = seg.substring(i, i + len);
          if (!stopWords.has(sub)) {
            keywords.push(sub);
          }
        }
      }
    }
  }

  return [...new Set(keywords)].slice(0, 5);
}

// ========== 4. 混合检索 ==========
// 语义检索 + LLM关键词增强检索 并行执行，融合去重
async function hybridSearch(
  query: string,
  topK: number = 5,
  minScore: number = 0.2,
  categoryFilter?: string,
  semanticWeight: number = 0.7
): Promise<RAGResult[]> {
  console.log('[RAG] Starting hybrid search for:', query);

  // 并行执行: 语义检索 + 关键词增强检索
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(query, topK, minScore, categoryFilter),
    keywordAugmentedSearch(query, Math.ceil(topK / 2) + 1, minScore),
  ]);

  console.log(`[RAG] Hybrid weighted fusion: semanticWeight=${semanticWeight}, semanticResults=${semanticResults.length}, keywordResults=${keywordResults.length}`);

  // 1. min-max 归一化到 [0, 1] 区间
  function minMaxNormalize(results: RAGResult[]): number[] {
    if (results.length === 0) return [];
    const scores = results.map(r => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    if (max === min) return results.map(() => 0);
    return scores.map(score => (score - min) / (max - min));
  }

  const semanticNormalized = minMaxNormalize(semanticResults);
  const keywordNormalized = minMaxNormalize(keywordResults);

  // 2. 构建统一的文档映射（key 为 content.trim().substring(0, 100)）
  const docMap = new Map<string, { result: RAGResult; semanticScore: number; keywordScore: number }>();

  for (let i = 0; i < semanticResults.length; i++) {
    const r = semanticResults[i];
    const key = r.content.trim().substring(0, 100);
    const existing = docMap.get(key);
    if (existing) {
      existing.semanticScore = Math.max(existing.semanticScore, semanticNormalized[i]);
    } else {
      docMap.set(key, { result: r, semanticScore: semanticNormalized[i], keywordScore: 0 });
    }
  }

  for (let i = 0; i < keywordResults.length; i++) {
    const r = keywordResults[i];
    const key = r.content.trim().substring(0, 100);
    const existing = docMap.get(key);
    if (existing) {
      existing.keywordScore = Math.max(existing.keywordScore, keywordNormalized[i]);
    } else {
      docMap.set(key, { result: r, semanticScore: 0, keywordScore: keywordNormalized[i] });
    }
  }

  // 3. 加权融合并排序
  const fusedResults = Array.from(docMap.values())
    .map(item => ({
      ...item.result,
      score: semanticWeight * item.semanticScore + (1 - semanticWeight) * item.keywordScore,
    }))
    .sort((a, b) => b.score - a.score);

  console.log(`[RAG] Hybrid search: semantic=${semanticResults.length}, keyword=${keywordResults.length}, fused=${fusedResults.length}`);
  return fusedResults;
}

// ========== 5. LLM Rerank ==========
async function rerankResults(
  results: RAGResult[],
  query: string
): Promise<RAGResult[]> {
  const sortedInput = [...results].sort((a, b) => b.score - a.score);
  if (sortedInput.length <= 2) return sortedInput;

  const cacheKey = rerankCacheKey(query, sortedInput);
  const cached = getCached(rerankCache, cacheKey);
  if (cached) {
    return cached;
  }

  let reranked: RAGResult[];
  try {
    const llmClient = getLLMClient();

    // 构建文档摘要列表
    const docList = sortedInput.map((r, i) =>
      `[${i + 1}] ${(r.content || '').substring(0, 150).replace(/\n/g, ' ')}`
    ).join('\n');

    const prompt = `你是一个文档相关性排序专家。请根据用户查询，对以下文档按相关性从高到低重新排序。

用户查询：${query}

文档列表：
${docList}

请只返回排序后的文档编号，用逗号分隔，例如：3,1,5,2,4
不要返回其他内容。`;

    const invokeOpts: InvokeOptions = {
      temperature: 0.0,
    };

    const response = await llmClient.invoke(
      [{ role: 'user', content: prompt }],
      invokeOpts
    );

    if (response && response.content) {
      const orderMatch = response.content.match(/[\d,]+/);
      if (orderMatch) {
        const order = orderMatch[0].split(',').map(n => parseInt(n.trim(), 10) - 1).filter(n => n >= 0 && n < sortedInput.length);
        const ordered: RAGResult[] = [];
        const usedIndices = new Set<number>();

        // 按LLM排序顺序添加
        for (const idx of order) {
          if (!usedIndices.has(idx)) {
            ordered.push(sortedInput[idx]);
            usedIndices.add(idx);
          }
        }
        // 添加LLM未提及的文档（按原始score降序填充）
        const remaining = [];
        for (let i = 0; i < sortedInput.length; i++) {
          if (!usedIndices.has(i)) {
            remaining.push(sortedInput[i]);
          }
        }
        remaining.sort((a, b) => b.score - a.score);
        ordered.push(...remaining);

        console.log('[RAG] LLM Rerank order:', order.map(n => n + 1));
        reranked = ordered;
      } else {
        reranked = sortedInput;
      }
    } else {
      reranked = sortedInput;
    }
  } catch (error) {
    console.log('[RAG] LLM Rerank失败，使用原始排序降级:', error instanceof Error ? error.message : String(error));
    reranked = sortedInput;
  }

  setCache(rerankCache, cacheKey, reranked, LLM_CACHE_TTL_MS);
  return reranked;
}

// ========== 6. 上下文压缩 ==========
function compressContext(results: RAGResult[], maxChars: number = 3000): RAGResult[] {
  let totalChars = 0;
  const compressed: RAGResult[] = [];

  for (const result of results) {
    const content = result.content || '';
    if (totalChars + content.length <= maxChars) {
      compressed.push(result);
      totalChars += content.length;
    } else {
      const remaining = maxChars - totalChars;
      if (remaining > 100) {
        let cutPoint = remaining;
        // 尝试在 remaining 附近找句子边界
        const searchEnd = Math.min(remaining + 50, content.length);
        const searchStart = Math.max(remaining - 50, 0);
        const nearText = content.substring(searchStart, searchEnd);
        const sentenceMatch = nearText.match(/[。！？\n](?=[^。！？\n]*$)/);
        if (sentenceMatch && sentenceMatch.index !== undefined) {
          cutPoint = searchStart + sentenceMatch.index + 1;
        }
        compressed.push({
          ...result,
          content: content.substring(0, Math.min(cutPoint, content.length)) + '...',
        });
      }
      break;
    }
  }

  return compressed;
}

// ========== 7. HyDE: 假想文档生成（真实LLM调用） ==========
async function generateHydeAnswer(
  query: string
): Promise<string | null> {
  const cacheKey = query;
  const cached = getCached(hydeCache, cacheKey);
  if (cached) {
    return cached;
  }

  let answer: string | null = null;
  try {
    const llmClient = getLLMClient();

    const hydePrompt = `你是一位专业知识库作者。请根据用户的问题，写一段专业的、像教科书一样的回答。
这段回答将用于从知识库中检索相关文档。
要求：
- 使用专业术语，包含与问题相关的核心关键词
- 内容像知识库原文风格
- 长度 200-400 字
- 只输出回答内容，不要任何解释

用户问题：${query}`;

    const invokeOpts: InvokeOptions = {
      temperature: 0.3,
    };

    const response = await llmClient.invoke(
      [{ role: 'user', content: hydePrompt }],
      invokeOpts
    );

    if (response && response.content && response.content.trim().length > 0) {
      answer = response.content.trim();
      console.log('[RAG] HyDE generated hypothetical answer, length:', answer.length);
    }
  } catch (error) {
    console.error('[RAG] HyDE generation failed, falling back to direct search:', error);
  }

  setCache(hydeCache, cacheKey, answer, LLM_CACHE_TTL_MS);
  return answer;
}

// 测试专用：清空 LLM 级缓存，避免跨测试用例污染。
export function _resetLLMCaches(): void {
  keywordCache.clear();
  hydeCache.clear();
  rerankCache.clear();
}

// 注意：search.ts 内部所有函数仅在 rag 内部使用，不直接对外导出
export {
  semanticSearch,
  keywordAugmentedSearch,
  extractKeywordsViaLLM,
  extractKeywordsLocal,
  hybridSearch,
  rerankResults,
  compressContext,
  generateHydeAnswer,
};
