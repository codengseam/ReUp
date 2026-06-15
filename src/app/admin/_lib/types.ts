// ========== Admin 共享类型定义 ==========

export interface ModelEntry {
  id: string;
  name: string;
  desc: string;
  isBuiltin: boolean;
}

export interface CustomProvider {
  id: string;
  name: string;
  providerType: string;
  endpoint: string;
  apiKey: string;
  modelId: string;
}

export interface ProviderTemplate {
  type: string;
  name: string;
  endpoint: string;
}

export interface RAGParams {
  topK: number;
  minScore: number;
  maxChars: number;
  semanticWeight: number;
  hydeEnabled: boolean;
  rerankEnabled: boolean;
  cacheTTL: number;
}

export interface ActivityLog {
  action: string;
  target: string;
  time: string;
}

export type TabKey = 'dashboard' | 'knowledge' | 'prompt' | 'model' | 'rag' | 'metadata';
