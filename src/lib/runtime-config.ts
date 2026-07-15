// src/lib/runtime-config.ts
// 运行时密钥存储：API Keys 安全读写，env-var 兜底，永不暴露原始 key。
// 同时提供内置 model registry 和 fallback chain 解析。
//
// 存储位置: data/.runtime-config.json  (已加入 .gitignore)
// 读取优先级: env-var > runtime-config.json
// 暴露策略: GET 返回掩码值，POST 仅接受替换不做合并

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, '.runtime-config.json');

export interface ProviderApiKey {
  endpoint: string;
  apiKey: string;
  provider?: string;
}

export interface RuntimeConfig {
  apiKeys?: Record<string, ProviderApiKey>;
  updatedAt?: string;
}

const MASK = '***MASKED***';
export const RUNTIME_CONFIG_FILE = CONFIG_FILE;

let writeLock: Promise<void> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  let release: () => void;
  writeLock = new Promise<void>(resolve => { release = resolve; });
  return prev.then(fn).finally(() => release!());
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch { /* already exists */ }
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    await ensureDir();
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as RuntimeConfig;
  } catch {
    return {};
  }
}

export async function saveRuntimeConfig(partial: Partial<RuntimeConfig>): Promise<RuntimeConfig> {
  return withLock(async () => {
    let current: RuntimeConfig = {};
    try {
      const raw = await readFile(CONFIG_FILE, 'utf-8');
      current = JSON.parse(raw) as RuntimeConfig;
    } catch { /* file does not exist */ }
    // Deep-merge apiKeys: 新 partial 中的 provider 覆盖对应槽位，其他 provider 保留
    const mergedApiKeys: Record<string, ProviderApiKey> = {
      ...(current.apiKeys ?? {}),
      ...(partial.apiKeys ?? {}),
    };
    const updated: RuntimeConfig = {
      ...current,
      ...partial,
      apiKeys: Object.keys(mergedApiKeys).length > 0 ? mergedApiKeys : undefined,
      updatedAt: new Date().toISOString(),
    };
    await ensureDir();
    await writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  });
}

/**
 * 用掩码替换所有 apiKey 值，返回一个安全的视图（用于管理后台展示）。
 * GET /api/admin/runtime-config 直接返回这个。
 */
export function maskRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  if (!config.apiKeys) return { updatedAt: config.updatedAt };
  const masked: Record<string, ProviderApiKey> = {};
  for (const [k, v] of Object.entries(config.apiKeys)) {
    masked[k] = {
      endpoint: v.endpoint,
      apiKey: v.apiKey ? MASK : '',
      provider: v.provider,
    };
  }
  return { apiKeys: masked, updatedAt: config.updatedAt };
}

/** 防御性：解决掩码值（避免循环写入） */
export function resolveMasked(value: string): string {
  if (value === MASK) return '';
  return value;
}

// ===== env-var 兜底读取 =====
/** DashScope API Key: env > runtime-config > undefined */
export function getDashScopeApiKey(): string | undefined {
  return process.env.DASHSCOPE_API_KEY?.trim() || undefined;
}

/** 智谱 API Key: env > runtime-config > undefined */
export function getZhipuApiKey(): string | undefined {
  return process.env.ZHIPU_API_KEY?.trim() || undefined;
}

/** 通用 provider key 读取（含 runtime-config 合并） */
export async function getApiKeyForProvider(provider: 'dashscope' | 'zhipu'): Promise<string | undefined> {
  const envKey = provider === 'dashscope' ? getDashScopeApiKey() : getZhipuApiKey();
  if (envKey) return envKey;
  const cfg = await loadRuntimeConfig();
  return cfg.apiKeys?.[provider]?.apiKey?.trim() || undefined;
}

// ===== Model registry + 过期感知轮换 (expiration-aware rotation) =====
//
// 所有内置模型共用 DashScope (OpenAI 兼容) provider 与同一个 DASHSCOPE_API_KEY。
// 每个模型带 expiresAt (YYYY-MM-DD, 本地时区)：该日结束时模型失效，运行时自动跳过。
// 轮换策略：先消耗快过期的模型；某个模型过期后，getModelCandidates 会自动跳过它，
// 降级到下一个有效模型，实现「每过期一个，自动换下一个」。

export type BuiltinModelId = keyof typeof BUILTIN_MODEL_REGISTRY;

export interface ModelRegistryEntry {
  provider: 'dashscope' | 'zhipu';
  /** 实际发送给 provider 的 model 名称 */
  modelName: string;
  /** 过期日期 (YYYY-MM-DD, 本地时区)。该日结束时模型失效。 */
  expiresAt?: string;
}

// 内置模型清单（与 src/shared/config/models.ts 的 BUILTIN_MODELS 保持一致）。
// 排序：按 expiresAt 升序（先消耗快过期的）。
export const BUILTIN_MODEL_REGISTRY = {
  'qwen3.6-flash': { provider: 'dashscope' as const, modelName: 'qwen3.6-flash', expiresAt: '2026-07-17' },
  'qwen3.6-35b-a3b': { provider: 'dashscope' as const, modelName: 'qwen3.6-35b-a3b', expiresAt: '2026-07-17' },
  'qwen3.6-flash-2026-04-16': { provider: 'dashscope' as const, modelName: 'qwen3.6-flash-2026-04-16', expiresAt: '2026-07-17' },
  'qwen3.6-max-preview': { provider: 'dashscope' as const, modelName: 'qwen3.6-max-preview', expiresAt: '2026-07-20' },
  'kimi-k2.6': { provider: 'dashscope' as const, modelName: 'kimi-k2.6', expiresAt: '2026-07-21' },
  'qwen3.6-27b': { provider: 'dashscope' as const, modelName: 'qwen3.6-27b', expiresAt: '2026-07-23' },
  'qwen3.5-plus-2026-04-20': { provider: 'dashscope' as const, modelName: 'qwen3.5-plus-2026-04-20', expiresAt: '2026-07-23' },
  'deepseek-v4-pro': { provider: 'dashscope' as const, modelName: 'deepseek-v4-pro', expiresAt: '2026-07-24' },
  'deepseek-v4-flash': { provider: 'dashscope' as const, modelName: 'deepseek-v4-flash', expiresAt: '2026-07-24' },
  'qwen3.7-max-2026-05-20': { provider: 'dashscope' as const, modelName: 'qwen3.7-max-2026-05-20', expiresAt: '2026-08-20' },
  'qwen3.7-max': { provider: 'dashscope' as const, modelName: 'qwen3.7-max', expiresAt: '2026-08-20' },
  'qwen3.7-max-preview': { provider: 'dashscope' as const, modelName: 'qwen3.7-max-preview', expiresAt: '2026-08-24' },
  'qwen3.7-max-2026-05-17': { provider: 'dashscope' as const, modelName: 'qwen3.7-max-2026-05-17', expiresAt: '2026-08-24' },
  'qwen3.7-plus-2026-05-26': { provider: 'dashscope' as const, modelName: 'qwen3.7-plus-2026-05-26', expiresAt: '2026-09-01' },
  'qwen3.7-plus': { provider: 'dashscope' as const, modelName: 'qwen3.7-plus', expiresAt: '2026-09-01' },
  'qwen3.7-max-2026-06-08': { provider: 'dashscope' as const, modelName: 'qwen3.7-max-2026-06-08', expiresAt: '2026-09-08' },
  'kimi-k2.7-code': { provider: 'dashscope' as const, modelName: 'kimi-k2.7-code', expiresAt: '2026-09-14' },
  'glm-5.2': { provider: 'dashscope' as const, modelName: 'glm-5.2', expiresAt: '2026-09-15' },
} satisfies Record<string, ModelRegistryEntry>;

export const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DEFAULT_ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

export interface ModelCandidate {
  /** 实际发送给 provider 的 model 名称 */
  model: string;
  /** provider 完整 base URL（含 /v1） */
  baseUrl: string;
  /** provider 完整 API Key */
  apiKey: string;
}

/**
 * 判断模型是否已过期。expiresAt 为 YYYY-MM-DD（本地时区），该日结束时即视为过期。
 * 缺省 expiresAt 视为永不过期。
 */
export function isModelExpired(expiresAt: string | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const parts = expiresAt.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return false;
  const [y, m, d] = parts;
  // 该日 23:59:59.999（本地时区）之后即过期
  const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
  return now > endOfDay;
}

/**
 * 返回所有未过期模型 id，按 expiresAt 升序排列（先消耗快过期的）。
 */
export function getValidModelIdsSorted(now: Date = new Date()): BuiltinModelId[] {
  return (Object.keys(BUILTIN_MODEL_REGISTRY) as BuiltinModelId[])
    .filter(id => !isModelExpired(BUILTIN_MODEL_REGISTRY[id].expiresAt, now))
    .sort((a, b) => {
      const ea = BUILTIN_MODEL_REGISTRY[a].expiresAt ?? '9999-12-31';
      const eb = BUILTIN_MODEL_REGISTRY[b].expiresAt ?? '9999-12-31';
      return ea.localeCompare(eb);
    });
}

async function buildDashScopeCandidate(modelName: string): Promise<ModelCandidate | null> {
  const apiKey = await getApiKeyForProvider('dashscope');
  if (!apiKey) return null;
  return { model: modelName, baseUrl: DEFAULT_DASHSCOPE_BASE_URL, apiKey };
}

/**
 * 给定一个 primary model id，返回 [primary(若有效), ...其余有效模型按过期升序] 的候选列表。
 * - 自动跳过已过期模型与缺 key 的 provider
 * - primary 已过期时，自动降级到下一个有效模型（实现「过期自动换下一个」）
 * - 无可用模型或缺 key 时返回 []
 */
export async function getModelCandidates(
  primaryModelId: BuiltinModelId | string
): Promise<ModelCandidate[]> {
  const apiKey = await getApiKeyForProvider('dashscope');
  if (!apiKey) return [];
  const validIds = getValidModelIdsSorted();
  if (validIds.length === 0) return [];

  // 排定顺序：primary 优先（若它存在且未过期），其余按过期升序追加
  const ordered: BuiltinModelId[] = [];
  const primary = primaryModelId as BuiltinModelId;
  if (
    BUILTIN_MODEL_REGISTRY[primary] &&
    !isModelExpired(BUILTIN_MODEL_REGISTRY[primary].expiresAt)
  ) {
    ordered.push(primary);
  }
  for (const id of validIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  const out: ModelCandidate[] = [];
  for (const id of ordered) {
    const c = await buildDashScopeCandidate(BUILTIN_MODEL_REGISTRY[id].modelName);
    if (c) out.push(c);
  }
  return out;
}

/**
 * 返回默认轮换候选列表：所有未过期模型按 expiresAt 升序（先消耗快过期的）。
 * 供未显式指定模型的内部调用方使用，实现自动轮换。
 */
export async function getDefaultModelCandidates(): Promise<ModelCandidate[]> {
  const apiKey = await getApiKeyForProvider('dashscope');
  if (!apiKey) return [];
  const validIds = getValidModelIdsSorted();
  const out: ModelCandidate[] = [];
  for (const id of validIds) {
    const c = await buildDashScopeCandidate(BUILTIN_MODEL_REGISTRY[id].modelName);
    if (c) out.push(c);
  }
  return out;
}
