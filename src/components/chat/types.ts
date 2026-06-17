export interface ThinkingStep {
  step: number;
  title: string;
  description: string;
  status: 'running' | 'completed';
  details?: string;
}

import type { MessageError } from '@/server/llm/error-classifier';

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
  category?: 'promotion' | 'interview';
}

// 复用共享的 ModelConfig 类型（实际定义在 src/lib/models.ts）
export type { ModelConfig } from '@/shared/config/models';

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
export { BUILTIN_MODELS as AVAILABLE_MODELS } from '@/shared/config/models';

// 快捷入口
export const QUICK_ENTRIES = [
  { label: '晋升困惑', icon: 'TrendingUp', query: '我绩效很好，为什么没晋升？' },
  { label: '面试准备', icon: 'Target', query: '怎么自我介绍最加分？' },
  { label: '反问设计', icon: 'HelpCircle', query: '面试最后问什么问题？' },
];

// 优秀提问案例库
export const EXAMPLE_QUERIES = [
  {
    category: '晋升',
    badExample: '怎么晋升？',
    goodExample: '我P6做了2年核心业务，绩效连续2次A，但晋升答辩没过，可能是什么原因？',
    tip: '补充具体背景信息'
  },
  {
    category: '晋升',
    badExample: '我该学什么技术才能晋升？',
    goodExample: '作为技术负责人，我该学什么方向才能从P7升到P8？',
    tip: '说明当前职级和目标职级'
  },
  {
    category: '晋升',
    badExample: '业务没亮点怎么办？',
    goodExample: '我做的业务很稳定但不出彩，如何在晋升中体现价值？',
    tip: '描述具体困境而非笼统提问'
  },
  {
    category: '面试',
    badExample: '面试不会回答怎么办？',
    goodExample: '面试时被问到不懂的技术栈，怎么优雅地转场？',
    tip: '聚焦具体场景'
  },
  {
    category: '面试',
    badExample: '简历怎么写？',
    goodExample: '简历上的项目比较平淡，怎么挖掘出亮点？',
    tip: '指出具体问题点'
  },
  {
    category: '面试',
    badExample: '面试最后问什么？',
    goodExample: '面试最后反问环节，问什么问题能给面试官留下好印象？',
    tip: '明确场景和目的'
  },
];

// 8个Skills
export const SKILLS = [
  { name: '晋升底层逻辑', category: '晋升类', icon: '📈', trigger: '我绩效很好，为什么没晋升？' },
  { name: '晋升三大原则', category: '晋升类', icon: '🎯', trigger: '我该学什么技术才能晋升？' },
  { name: '能力三重境界', category: '晋升类', icon: '🏔️', trigger: '这个业务做了两年还能怎么提升？' },
  { name: '领域专家演进', category: '晋升类', icon: '🧭', trigger: '升了总监天天开会怎么办？' },
  { name: '素质模型对齐', category: '面试类', icon: '🧊', trigger: '怎么自我介绍最加分？' },
  { name: '亮点挖掘', category: '面试类', icon: '💎', trigger: '简历没亮点怎么办？' },
  { name: '盲区导航', category: '面试类', icon: '🛡️', trigger: '面试被问住怎么圆？' },
  { name: '反问框架', category: '面试类', icon: '❓', trigger: '面试最后问什么问题？' },
];

// 输入联想建议
export const INPUT_SUGGESTIONS_DB = [
  '我绩效很好，为什么没晋升？',
  '我的经历没有亮点怎么办？',
  '面试被问住不会回答怎么圆？',
  '升了总监天天开会怎么办？',
  '怎么自我介绍最加分？',
  '面试最后问什么问题？',
  '如何在现有业务中继续提升？',
  '该学什么技术才能晋升？',
  '从P7到P8需要做哪些关键转变？',
  '跳槽面试需要特别注意什么？',
];

