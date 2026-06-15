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
  // 默认：阿里 DashScope Qwen 3.6 Plus（带日期后缀优先，失败自动 fallback 到不带后缀版）
  { id: 'qwen3.6-plus-2026-04-02', name: 'Qwen 3.6 Plus (2026-04-02)', description: '默认模型 · 阿里 DashScope Qwen 3.6 Plus（带日期后缀），失败自动 fallback 到不带后缀版' },
  { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus', description: '阿里 DashScope Qwen 3.6 Plus（无日期后缀），主模型的降级目标' },
  // 智谱 GLM Flash 系列（4 个免费模型，按能力降序排列，自动 fallback）
  { id: 'GLM-4.7-Flash', name: 'GLM 4.7 Flash', description: '智谱 GLM 4.7 Flash（免费），跨 provider 备选' },
  { id: 'GLM-4.5-Flash', name: 'GLM 4.5 Flash', description: '智谱 GLM 4.5 Flash（免费），GLM-4.7-Flash 的降级目标' },
  { id: 'GLM-4-Flash-250414', name: 'GLM 4 Flash (250414)', description: '智谱 GLM 4 Flash 250414 版（免费），GLM-4.5-Flash 的降级目标' },
  { id: 'GLM-4-Flash', name: 'GLM 4 Flash', description: '智谱 GLM 4 Flash（免费），GLM 系列兜底' },
];

// 供后端 API 校验用的 ID 列表（基于 BUILTIN_MODELS 自动生成）
export const BUILTIN_MODEL_IDS: readonly string[] = BUILTIN_MODELS.map(m => m.id);
