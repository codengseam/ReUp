// 共享的模型白名单与类型定义（聊天页 / 管理后台 / 后端 API 都从这里读取）
// 修改时只改这一处即可，避免三处不同步
//
// 模型来源：阿里 DashScope「百炼」免费额度（OpenAI 兼容模式，统一 DASHSCOPE_API_KEY）。
// 所有模型共用同一个 provider，按 expiresAt 升序排列（先消耗快过期的，过期自动跳到下一个）。

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  /** 过期日期（YYYY-MM-DD，本地时区）。该日结束时模型失效，运行时自动跳过。 */
  expiresAt?: string;
  providerType?: string;
  endpoint?: string;
  apiKey?: string;
  modelId?: string;
}

// 免费模型清单（按过期时间升序：先消耗快过期的）。
// qwen3.5-ocr 为 OCR 专用模型，无法用于对话，已从清单中剔除。
export const BUILTIN_MODELS: ModelConfig[] = [
  { id: 'qwen3.6-flash', name: 'Qwen 3.6 Flash', description: '阿里 DashScope 免费额度 · 快过期优先消耗', expiresAt: '2026-07-17' },
  { id: 'qwen3.6-35b-a3b', name: 'Qwen 3.6 35B-A3B', description: '阿里 DashScope 免费额度 · 快过期优先消耗', expiresAt: '2026-07-17' },
  { id: 'qwen3.6-flash-2026-04-16', name: 'Qwen 3.6 Flash (2026-04-16)', description: '阿里 DashScope 免费额度 · 快过期优先消耗', expiresAt: '2026-07-17' },
  { id: 'qwen3.6-max-preview', name: 'Qwen 3.6 Max Preview', description: '阿里 DashScope 免费额度', expiresAt: '2026-07-20' },
  { id: 'kimi-k2.6', name: 'Kimi K2.6', description: '阿里 DashScope 免费额度 · 月之暗面', expiresAt: '2026-07-21' },
  { id: 'qwen3.6-27b', name: 'Qwen 3.6 27B', description: '阿里 DashScope 免费额度', expiresAt: '2026-07-23' },
  { id: 'qwen3.5-plus-2026-04-20', name: 'Qwen 3.5 Plus (2026-04-20)', description: '阿里 DashScope 免费额度', expiresAt: '2026-07-23' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: '阿里 DashScope 免费额度 · DeepSeek', expiresAt: '2026-07-24' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: '阿里 DashScope 免费额度 · DeepSeek', expiresAt: '2026-07-24' },
  { id: 'qwen3.7-max-2026-05-20', name: 'Qwen 3.7 Max (2026-05-20)', description: '阿里 DashScope 免费额度', expiresAt: '2026-08-20' },
  { id: 'qwen3.7-max', name: 'Qwen 3.7 Max', description: '阿里 DashScope 免费额度（额度已部分消耗）', expiresAt: '2026-08-20' },
  { id: 'qwen3.7-max-preview', name: 'Qwen 3.7 Max Preview', description: '阿里 DashScope 免费额度', expiresAt: '2026-08-24' },
  { id: 'qwen3.7-max-2026-05-17', name: 'Qwen 3.7 Max (2026-05-17)', description: '阿里 DashScope 免费额度', expiresAt: '2026-08-24' },
  { id: 'qwen3.7-plus-2026-05-26', name: 'Qwen 3.7 Plus (2026-05-26)', description: '阿里 DashScope 免费额度', expiresAt: '2026-09-01' },
  { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', description: '阿里 DashScope 免费额度', expiresAt: '2026-09-01' },
  { id: 'qwen3.7-max-2026-06-08', name: 'Qwen 3.7 Max (2026-06-08)', description: '阿里 DashScope 免费额度', expiresAt: '2026-09-08' },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', description: '阿里 DashScope 免费额度 · 月之暗面代码模型', expiresAt: '2026-09-14' },
  { id: 'glm-5.2', name: 'GLM 5.2', description: '阿里 DashScope 免费额度 · 智谱', expiresAt: '2026-09-15' },
];

// 供后端 API 校验用的 ID 列表（基于 BUILTIN_MODELS 自动生成）
export const BUILTIN_MODEL_IDS: readonly string[] = BUILTIN_MODELS.map(m => m.id);

// 默认模型 ID：清单中第一个（过期时间最早、优先消耗）。
// 当请求与后台配置都未指定有效模型时使用。
export const DEFAULT_MODEL_ID: string = BUILTIN_MODELS[0]!.id;
