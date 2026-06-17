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
  /** 置信度阈值：high 等级下限（默认 0.50） */
  confidenceHighThreshold: number;
  /** 置信度阈值：medium 等级下限（默认 0.25） */
  confidenceMediumThreshold: number;
}

export interface ActivityLog {
  action: string;
  target: string;
  time: string;
}

/**
 * Admin 后台 Tab 枚举（按 spec §3.5 顺序）
 * - dashboard: 概览
 * - knowledge: 知识库（L2 检索，4 维度：按书/按分类/按章/按节）
 * - framework-skills: Skill 框架（L1：8 个对话层 Skill，展示 SKILL.md 完整内容）
 * - prompt: 提示词
 * - model: 模型配置
 * - rag: RAG 参数
 * - metadata: 分类（L2 浏览，19 个细分类 + 1 个通用兜底）
 * - runtime-config: API Keys（管理 DashScope / Zhipu 密钥，运行时热替换）
 * - eval-dashboard: 评估看板 (M2: RAGAS 指标 + 队列状态)
 * - experiments: 实验管理 (M3: HITL 半自动闭环)
 */
export type TabKey =
  | 'dashboard'
  | 'knowledge'
  | 'framework-skills'
  | 'prompt'
  | 'model'
  | 'rag'
  | 'metadata'
  | 'runtime-config'
  | 'eval-dashboard'
  | 'experiments';
