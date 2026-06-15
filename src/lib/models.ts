// 共享的模型白名单与类型定义（聊天页 / 管理后台 / 后端 API 都从这里读取）
// 修改时只改这一处即可，避免三处不同步

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  providerType?: string;
  endpoint?: string;
  apiKey?: string;
  modelId?: string;
}

export const BUILTIN_MODELS: ModelConfig[] = [
  // ReUp 本地部署默认：阿里 DashScope 兼容的 Qwen GUI-Plus
  // 与 .env.local 的 DASHSCOPE_* 保持一致；apiKey/baseUrl 由服务端从 env 读取
  { id: 'gui-plus-2026-02-26', name: 'Qwen GUI-Plus', description: '默认模型 · DashScope Qwen GUI-Plus（本地部署）' },
  { id: 'doubao-seed-2-0-pro-260215', name: 'Doubao Pro', description: '旗舰全能模型，复杂推理与长链路任务' },
  { id: 'doubao-seed-2-0-lite-260215', name: 'Doubao Lite', description: '均衡型模型，兼顾性能与成本' },
  { id: 'doubao-seed-2-0-mini-260215', name: 'Doubao Mini', description: '低时延模型，快速响应' },
  { id: 'deepseek-v3-2-251201', name: 'DeepSeek V3', description: '平衡推理能力与输出长度' },
  { id: 'kimi-k2-5-260127', name: 'Kimi K2.5', description: '智能体、代码、视觉理解' },
  { id: 'glm-4-7-251222', name: 'GLM 4.7', description: '更强编程能力与多步骤推理' },
  { id: 'glm-5-0-260211', name: 'GLM 5.0', description: '最新一代大语言模型，全面升级' },
  { id: 'minimax-m2-5-260212', name: 'MiniMax M2.5', description: '高效推理与多模态理解' },
  { id: 'qwen-3-5-plus-260215', name: 'Qwen 3.5 Plus', description: '通义千问旗舰增强版' },
];

// 供后端 API 校验用的 ID 列表（基于 BUILTIN_MODELS 自动生成）
export const BUILTIN_MODEL_IDS: readonly string[] = BUILTIN_MODELS.map(m => m.id);
