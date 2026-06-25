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

// ===== Model registry + fallback chain =====

export type BuiltinModelId =
  | 'qwen3.6-plus-2026-04-02'
  | 'qwen3.6-plus'
  | 'GLM-4.7-Flash'
  | 'GLM-4.5-Flash'
  | 'GLM-4-Flash-250414'
  | 'GLM-4-Flash';

export interface ModelRegistryEntry {
  provider: 'dashscope' | 'zhipu';
  /** 实际发送给 provider 的 model 名称 */
  modelName: string;
  /** 同一 provider 内的降级链（按顺序） */
  fallbackChain: BuiltinModelId[];
}

export const BUILTIN_MODEL_REGISTRY: Record<BuiltinModelId, ModelRegistryEntry> = {
  'qwen3.6-plus-2026-04-02': {
    provider: 'dashscope',
    modelName: 'qwen3.6-plus-2026-04-02',
    fallbackChain: ['qwen3.6-plus'],
  },
  'qwen3.6-plus': {
    provider: 'dashscope',
    modelName: 'qwen3.6-plus',
    fallbackChain: [],
  },
  'GLM-4.7-Flash': {
    provider: 'zhipu',
    modelName: 'GLM-4.7-Flash',
    fallbackChain: ['GLM-4.5-Flash', 'GLM-4-Flash-250414', 'GLM-4-Flash'],
  },
  'GLM-4.5-Flash': {
    provider: 'zhipu',
    modelName: 'GLM-4.5-Flash',
    fallbackChain: ['GLM-4-Flash-250414', 'GLM-4-Flash'],
  },
  'GLM-4-Flash-250414': {
    provider: 'zhipu',
    modelName: 'GLM-4-Flash-250414',
    fallbackChain: ['GLM-4-Flash'],
  },
  'GLM-4-Flash': {
    provider: 'zhipu',
    modelName: 'GLM-4-Flash',
    fallbackChain: [],
  },
};

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
 * 给定一个 primary model id，返回 [primary, ...fallback] 的候选列表。
 * - 自动跳过缺 key 的 provider
 * - 同一个 provider 内的降级按 registry 顺序
 * - 找不到或无 key 时返回 []
 */
export async function getModelCandidates(
  primaryModelId: BuiltinModelId | string
): Promise<ModelCandidate[]> {
  const entry = BUILTIN_MODEL_REGISTRY[primaryModelId as BuiltinModelId];
  if (!entry) return [];
  const out: ModelCandidate[] = [];
  const seen = new Set<string>();
  const push = async (id: BuiltinModelId) => {
    if (seen.has(id)) return;
    seen.add(id);
    const e = BUILTIN_MODEL_REGISTRY[id];
    if (!e) return;
    const c = await buildCandidate(e);
    if (c) out.push(c);
  };
  await push(primaryModelId as BuiltinModelId);
  for (const fb of entry.fallbackChain) {
    await push(fb);
  }
  return out;
}

async function buildCandidate(entry: ModelRegistryEntry): Promise<ModelCandidate | null> {
  let apiKey: string | undefined;
  let baseUrl: string;
  if (entry.provider === 'dashscope') {
    apiKey = await getApiKeyForProvider('dashscope');
    baseUrl = DEFAULT_DASHSCOPE_BASE_URL;
  } else if (entry.provider === 'zhipu') {
    apiKey = await getApiKeyForProvider('zhipu');
    baseUrl = DEFAULT_ZHIPU_BASE_URL;
  } else {
    return null;
  }
  if (!apiKey) return null;
  return { model: entry.modelName, baseUrl, apiKey };
}
