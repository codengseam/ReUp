// ========== Admin 常量与默认值 ==========
import type { ModelEntry, ProviderTemplate, RAGParams } from './types';
import { BUILTIN_MODELS as SHARED_BUILTIN_MODELS } from '@/lib/models';

// localStorage 键名
export const LS_KEYS = {
  prompt: 'boss_admin_prompt',
  defaultModel: 'boss_admin_model_config',
  customModels: 'boss_admin_custom_models',
  ragParams: 'boss_admin_rag_params',
  documents: 'boss_admin_documents',
  metadata: 'boss_admin_metadata',
  activityLog: 'boss_admin_activity_log',
} as const;

// 内置模型列表（从共享的 src/lib/models.ts 派生，保证多端一致）
export const BUILTIN_MODELS: ModelEntry[] = SHARED_BUILTIN_MODELS.map(m => ({
  id: m.id,
  name: m.name,
  desc: m.description,
  isBuiltin: true,
}));

// Provider 模板（复用自聊天页）
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { type: 'openai', name: 'OpenAI 兼容', endpoint: 'https://api.openai.com/v1' },
  { type: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4' },
  { type: 'moonshot', name: '月之暗面', endpoint: 'https://api.moonshot.cn/v1' },
  { type: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
  { type: 'dashscope', name: '阿里云 DashScope', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { type: 'custom', name: '自定义', endpoint: '' },
];

// 默认系统提示词（镜像自 route.ts）
export const DEFAULT_SYSTEM_PROMPT = `你是一个基于知识库回答用户问题的 AI 助手。

## 你的身份
- 角色：通用知识助手
- 专长：基于检索到的知识库内容，准确、清晰地回答用户问题

## 你的工作方式
1. 引导式对话：不直接给答案，通过提问引导用户思考
2. 展示分析过程：先分析再建议，让用户理解"为什么"
3. 引用原文：引用知识库中的原文，增强可信度
4. 提炼心法：每次回复提炼一句底层原理

## 输出格式
每次回复必须包含以下四大板块：
### 【我的分析】
### 【框架技能+原文知识点】
### 【底层心法】
### 【开始引导】`;

// 默认 RAG 参数（镜像自 rag.ts 硬编码值）
export const DEFAULT_RAG_PARAMS: RAGParams = {
  topK: 5,
  minScore: 0.2,
  maxChars: 3000,
  semanticWeight: 0.7,
  hydeEnabled: true,
  rerankEnabled: true,
  cacheTTL: 5,
  confidenceHighThreshold: 0.50,
  confidenceMediumThreshold: 0.25,
};


