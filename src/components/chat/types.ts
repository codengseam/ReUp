export interface ThinkingStep {
  step: number;
  title: string;
  description: string;
  status: 'running' | 'completed';
  details?: string;
}

import type { MessageError } from '@/lib/error-classifier';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: CitationData[];
  strategy?: string;
  confidence?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
  safetyWarning?: string;
  transferToHuman?: boolean;
  transferReason?: string;
  hallucinationDetected?: boolean;
  correctedFrom?: string;
  thinkingSteps?: ThinkingStep[];
  /** 错误状态：LLM 不可用 / 网络异常 / 业务报错等 */
  error?: MessageError;
}

export interface CitationData {
  id: number;
  content: string;
  fullContent?: string;
  source: string;
  skillName?: string;
  category?: string;
}

// 复用共享的 ModelConfig 类型（实际定义在 src/lib/models.ts）
export type { ModelConfig } from '@/lib/models';

export interface CustomProvider {
  id: string;
  name: string;
  providerType: string;
  endpoint: string;
  apiKey: string;
  modelId: string;
}

export const PROVIDER_TEMPLATES: { type: string; name: string; endpoint: string }[] = [
  { type: 'openai', name: 'OpenAI 兼容', endpoint: 'https://api.openai.com/v1' },
  { type: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4' },
  { type: 'moonshot', name: '月之暗面', endpoint: 'https://api.moonshot.cn/v1' },
  { type: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
  { type: 'dashscope', name: '阿里云 DashScope', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { type: 'custom', name: '自定义', endpoint: '' },
];

// 复用共享的模型白名单（实际数据来自 src/lib/models.ts）
export { BUILTIN_MODELS as AVAILABLE_MODELS } from '@/lib/models';

// 快捷入口（通用示例，可按需替换为具体领域的快捷入口）
export const QUICK_ENTRIES = [
  { label: '功能介绍', icon: 'Sparkles', query: '这个系统能帮我做什么？' },
  { label: '使用指南', icon: 'BookOpen', query: '如何使用知识库问答功能？' },
  { label: '常见问题', icon: 'HelpCircle', query: '有哪些常见问题？' },
];

// 优秀提问案例库（通用示例）
export const EXAMPLE_QUERIES = [
  {
    category: '基础',
    badExample: '怎么用？',
    goodExample: '这个系统的知识库问答功能具体怎么使用？',
    tip: '补充具体功能名称'
  },
  {
    category: '基础',
    badExample: '能做什么？',
    goodExample: '这个系统能帮我回答哪些类型的问题？',
    tip: '说明你想了解的方面'
  },
  {
    category: '基础',
    badExample: '不好用',
    goodExample: '回答不够准确时，我该如何优化提问以获得更好的结果？',
    tip: '描述具体问题而非笼统评价'
  },
  {
    category: '进阶',
    badExample: '怎么配置？',
    goodExample: '如何在管理后台配置自定义的 LLM API 密钥？',
    tip: '聚焦具体配置项'
  },
  {
    category: '进阶',
    badExample: '知识库怎么用？',
    goodExample: '如何向知识库添加新的文档？添加后多久能被检索到？',
    tip: '指出具体操作场景'
  },
  {
    category: '进阶',
    badExample: '能自定义吗？',
    goodExample: '能否自定义 AI 助手的角色和回答风格？如何配置？',
    tip: '明确场景和目的'
  },
];

// Skills 列表（从 data/skills.json 动态加载，前端默认为空）
export const SKILLS: { name: string; category: string; icon: string; trigger: string }[] = [];

// 输入联想建议（通用示例）
export const INPUT_SUGGESTIONS_DB = [
  '这个系统能帮我做什么？',
  '如何使用知识库问答功能？',
  '有哪些常见问题？',
  '如何配置自定义 LLM API？',
  '如何向知识库添加文档？',
  '回答不准确时怎么优化提问？',
  '能否自定义 AI 助手的角色？',
  '如何查看对话历史记录？',
  '系统支持哪些 LLM 模型？',
  '如何导出对话内容？',
];

