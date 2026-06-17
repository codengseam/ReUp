// src/lib/rag/suggestions.ts
// 1:1 迁移自 rag.ts:1138-1211（formatContext / buildCitations / SUGGESTION_DB / getInputSuggestions + HOT_QUERIES 备用）

import type { Citation, RAGResult } from './types';
import { HOT_QUERIES } from './assess';

// ========== 上下文格式化 ==========
function formatContext(results: RAGResult[]): string {
  if (results.length === 0) return '';

  return results
    .map((r, i) => {
      const categoryLabel = r.category === 'interview' ? '[面试类]' : r.category === 'promotion' ? '[晋升类]' : '';
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
const SUGGESTION_DB = [
  { keywords: ['晋升', '升职'], suggestion: '我绩效很好，为什么没晋升？' },
  { keywords: ['简历', '亮点'], suggestion: '我的经历没有亮点怎么办？' },
  { keywords: ['面试', '准备'], suggestion: '面试前应该如何准备自我介绍？' },
  { keywords: ['反问', '问什么'], suggestion: '面试最后应该问什么问题？' },
  { keywords: ['绩效', '考核'], suggestion: '绩效很好但晋升不了怎么办？' },
  { keywords: ['能力', '提升'], suggestion: '如何在现有业务中提升能力境界？' },
  { keywords: ['自我介绍'], suggestion: '面试时怎么做高质量的自我介绍？' },
  { keywords: ['不会', '问住'], suggestion: '面试被问住不会回答怎么圆？' },
  { keywords: ['总监', '管理'], suggestion: '升了总监天天开会怎么办？' },
  { keywords: ['技术', '学什么'], suggestion: '我应该学什么技术才能晋升？' },
  { keywords: ['P7', 'P8'], suggestion: '从P7到P8需要做哪些关键转变？' },
  { keywords: ['跳槽', '换工作'], suggestion: '跳槽面试需要特别注意什么？' },
];

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
