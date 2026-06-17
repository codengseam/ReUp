// src/lib/rag/suggestions.ts
// 1:1 迁移自 rag.ts:1138-1211（formatContext / buildCitations / SUGGESTION_DB / getInputSuggestions + HOT_QUERIES 备用）

import type { Citation, RAGResult } from './types';
import { HOT_QUERIES } from './assess';

// ========== 上下文格式化 ==========
function formatContext(results: RAGResult[]): string {
  if (results.length === 0) return '';

  return results
    .map((r, i) => {
      const categoryLabel = r.category ? `[${r.category}]` : '';
      const skillLabel = r.skillName ? `[${r.skillName}]` : '';
      return `[参考资料${i + 1}]${categoryLabel}${skillLabel}(相关度: ${(r.score * 100).toFixed(0)}%)\n${r.content}`;
    })
    .join('\n\n---\n\n');
}

// ========== 引文构建 ==========
function buildCitations(results: RAGResult[]): Citation[] {
  return results.map((r, i) => ({
    id: i + 1,
    content: r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''),
    source: r.source || '未知来源',
    skillName: r.skillName,
    category: r.category,
    fullContent: r.content,
  }));
}

// ========== 输入联想建议 ==========
// 框架通用化后清空，由调用方基于自身知识库自行注入建议词条。
const SUGGESTION_DB: Array<{ keywords: string[]; suggestion: string }> = [];

function getInputSuggestions(input: string): string[] {
  if (!input || input.length < 2) return [];

  const inputLower = input.toLowerCase();
  const matched = SUGGESTION_DB
    .filter(s => s.keywords.some(kw => inputLower.includes(kw) || kw.includes(inputLower)))
    .map(s => s.suggestion);

  return [...new Set(matched)].slice(0, 3);
}

export {
  formatContext,
  buildCitations,
  getInputSuggestions,
  SUGGESTION_DB,
  HOT_QUERIES,
};
