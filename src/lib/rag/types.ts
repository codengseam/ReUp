// src/lib/rag/types.ts
// 公共类型定义

export interface RAGResult {
  content: string;
  score: number;
  docId?: string;
  source?: string;
  category?: string;
  skillName?: string;
}

export interface RAGResponse {
  results: RAGResult[];
  context: string;
  status: 'searching' | 'generating' | 'error';
  citations: Citation[];
  rewrittenQuery?: string;
  strategy?: string;
}

export interface Citation {
  id: number;
  content: string;
  source: string;
  skillName?: string;
  category?: string;
  fullContent?: string;
}

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high';
  category?: string;
}
