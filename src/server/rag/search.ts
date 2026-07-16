// src/lib/rag/search.ts
// 1:1 迁移自 rag.ts:113-481

import { LLMClient, type InvokeOptions } from '@/server/llm/llm-client';
import { createKnowledgeBase } from '@/server/rag/knowledge-base';
import { createEmbedder } from '@/server/rag/embedder';
import { categoryMatches, tokenize, type VectorRecord } from '@/server/rag/vector-store';
import type { ScoredChunk } from '@/server/rag/reranker';
import type { RAGResult } from './types';

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

// ========== 1. 语义检索（local knowledge-base） ==========
async function semanticSearch(
  query: string,
  topK: number = 5,
  minScore: number = 0.15,
  categoryFilter?: string
): Promise<RAGResult[]> {
  try {
    const opts: { category?: 'promotion' | 'interview' } = {};
    if (categoryFilter === 'promotion' || categoryFilter === 'interview') {
      opts.category = categoryFilter;
    }
    const chunks = await knowledgeBase.semanticSearch(query, topK, opts);

    if (chunks.length === 0) {
      console.log('[RAG] No results from semantic search');
      return [];
    }

    const results: RAGResult[] = chunks
      .filter((c) => c.score >= minScore)
      .map((chunk) => mapChunkToRAGResult(chunk));

    // category 过滤已由 vector-store 的 passesFilter (CATEGORY_ALIASES) 在
    // knowledgeBase.semanticSearch 内完成，这里无需二次过滤。
    return results;
  } catch (error) {
    console.warn(
      '[RAG] Semantic search failed, degrading to text fallback:',
      error instanceof Error ? error.message : String(error)
    );
    try {
      return await fallbackTextSearch(query, topK, minScore, categoryFilter);
    } catch (fbErr) {
      console.error(
        '[RAG] Fallback text search also failed:',
        fbErr instanceof Error ? fbErr.message : String(fbErr)
      );
      return [];
    }
  }
}

// ========== 1b. 纯文本降级检索（embedder 不可用时兜底） ==========
// 当 BGE-M3 模型缓存缺失导致 embed() 抛错时，semanticSearch 的 catch 块会
// 调用本函数：对所有 chunk 做关键词命中率打分，应用与 semanticSearch 相同的
// category 过滤，按命中分排序取 topK，返回结构一致的 RAGResult[]。
const FALLBACK_STOPWORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '都', '一', '上',
  '也', '到', '说', '要', '会', '着', '看', '好', '这', '那', '你', '他',
  '她', '它', '吗', '呢', '吧', '啊', '与', '及', '或', '把', '被', '让',
  '给', '从', '对', '但', '而', '为', '以', '于', '之', '其', '此', '所',
  // 补充常见中文虚词/单字，避免单字参与命中率计算拉低有效 chunk 分数
  '如', '何', '准', '备', '还', '又', '才', '只', '可', '能', '想', '做',
  '问', '答', '错', '坏', '多', '少', '大', '小', '高', '低', '长', '短',
  '新', '旧', '早', '晚', '前', '后', '左', '右', '下', '里', '外', '中',
  '间', '哪', '个', '些', '每', '各', '另', '该', '某', '本', '们', '人',
  '自', '己', '谁', '什', '么', '怎', '样', '因', '然', '虽', '且', '则',
  '若', '果', '没', '无', '非', '未', '别', '莫', '勿', '休',
]);

async function fallbackTextSearch(
  query: string,
  topK: number,
  minScore: number,
  categoryFilter?: string
): Promise<RAGResult[]> {
  if (topK <= 0) return [];
  const allTokens = tokenize(query);
  const queryTokens = allTokens.filter((t) => !FALLBACK_STOPWORDS.has(t));
  if (queryTokens.length === 0) return [];

  const records: VectorRecord[] = await knowledgeBase.getAllRecords();
  if (records.length === 0) return [];

  const wantCategory =
    categoryFilter === 'promotion' || categoryFilter === 'interview' ? categoryFilter : undefined;

  const scored: Array<{ record: VectorRecord; score: number }> = [];
  for (const record of records) {
    if (wantCategory && !categoryMatches(wantCategory, record.category)) continue;
    const textTokens = new Set(tokenize(record.text));
    if (textTokens.size === 0) continue;
    let hits = 0;
    for (const t of queryTokens) {
      if (textTokens.has(t)) hits++;
    }
    const score = hits / queryTokens.length;
    if (score >= minScore) {
      scored.push({ record, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const limit = Math.min(topK, scored.length);
  const results: RAGResult[] = new Array(limit);
  for (let i = 0; i < limit; i++) {
    const { record, score } = scored[i];
    const skillName =
      typeof record.metadata.skillName === 'string' ? record.metadata.skillName : '';
    results[i] = {
      content: record.text,
      score,
      docId: record.id,
      source: record.id || '知识库',
      category: record.category,
      skillName,
    };
  }
  return results;
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
  minScore: number = 0.12
): Promise<RAGResult[]> {
  try {
    // 使用本地关键词提取替代 LLM 调用，避免每次检索都触发一次大模型请求。
    // vector store 的语义检索已经融合了 dense/keyword/lexical 信号。
    const keywords = extractKeywordsLocal(query);
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
      const keywords = response.content
        .split(/[,，、\s]+/)
        .map(k => k.trim())
        .filter(k => k.length > 0 && k.length <= 10);
      console.log('[RAG] LLM extracted keywords:', keywords);
      return keywords;
    }
    return [];
  } catch (error) {
    console.log('[RAG] LLM关键词提取失败，使用本地分词降级:', error instanceof Error ? error.message : String(error));
    // 降级: 本地简单分词
    return extractKeywordsLocal(text);
  }
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
    if (max === min) return scores;  // 等分时保持原分，避免归零拉低融合与置信度
    return scores.map(score => (score - min) / (max - min));
  }

  const semanticNormalized = minMaxNormalize(semanticResults);
  const keywordNormalized = minMaxNormalize(keywordResults);

  // 2. 构建统一的文档映射（key 为 docId，缺失时回退 content 前 100 字符）
  const docMap = new Map<string, { result: RAGResult; semanticScore: number; keywordScore: number }>();

  for (let i = 0; i < semanticResults.length; i++) {
    const r = semanticResults[i];
    const key = r.docId || r.content.trim().substring(0, 100);
    const existing = docMap.get(key);
    if (existing) {
      existing.semanticScore = Math.max(existing.semanticScore, semanticNormalized[i]);
    } else {
      docMap.set(key, { result: r, semanticScore: semanticNormalized[i], keywordScore: 0 });
    }
  }

  for (let i = 0; i < keywordResults.length; i++) {
    const r = keywordResults[i];
    const key = r.docId || r.content.trim().substring(0, 100);
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
  if (results.length <= 2) return results.sort((a, b) => b.score - a.score);

  try {
    const llmClient = getLLMClient();

    // 构建文档摘要列表
    const docList = results.map((r, i) =>
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
        const order = orderMatch[0].split(',').map(n => parseInt(n.trim(), 10) - 1).filter(n => n >= 0 && n < results.length);
        const reranked: RAGResult[] = [];
        const usedIndices = new Set<number>();

        // 按LLM排序顺序添加
        for (const idx of order) {
          if (!usedIndices.has(idx)) {
            reranked.push(results[idx]);
            usedIndices.add(idx);
          }
        }
        // 添加LLM未提及的文档（按原始score降序填充）
        const remaining = [];
        for (let i = 0; i < results.length; i++) {
          if (!usedIndices.has(i)) {
            remaining.push(results[i]);
          }
        }
        remaining.sort((a, b) => b.score - a.score);
        reranked.push(...remaining);

        console.log('[RAG] LLM Rerank order:', order.map(n => n + 1));
        return reranked;
      }
    }
  } catch (error) {
    console.log('[RAG] LLM Rerank失败，使用原始排序降级:', error instanceof Error ? error.message : String(error));
  }

  // 降级: 按原始score排序
  return results.sort((a, b) => b.score - a.score);
}

// ========== 6. 上下文压缩 ==========
function compressContext(results: RAGResult[], maxChars: number = 5000): RAGResult[] {
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
  try {
    const llmClient = getLLMClient();

    const hydePrompt = `你是一位职场指导书作者。请根据用户的问题，写一段专业的、像教科书一样的回答。
这段回答将用于从知识库中检索相关文档。
要求：
- 使用专业术语，包含晋升、面试、绩效、能力等关键词
- 内容像《大厂晋升指南》或《面试现场》中的原文风格
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
      console.log('[RAG] HyDE generated hypothetical answer, length:', response.content.length);
      return response.content.trim();
    }
    return null;
  } catch (error) {
    console.error('[RAG] HyDE generation failed, falling back to direct search:', error);
    return null;
  }
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
