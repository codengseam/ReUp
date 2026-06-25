// src/lib/server-config.ts
// 服务端配置持久化：将管理员配置从 localStorage 迁移到服务端 JSON 文件
// 解决换设备/清缓存丢失问题，同时支持知识库 ID 自动发现

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

// 配置路径在运行时根据 process.cwd() 计算，避免模块加载时缓存 cwd。
// 测试可通过 process.chdir() 切换工作目录以使用隔离的临时目录。
function getConfigDir(): string {
  return path.join(process.cwd(), 'data');
}

function getConfigFile(): string {
  return path.join(getConfigDir(), 'server-config.json');
}

// 简单互斥锁，防止并发写入竞态
let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  let release: () => void;
  writeLock = new Promise<void>(resolve => { release = resolve; });
  return prev.then(fn).finally(() => release!());
}

export interface ServerConfig {
  /** 系统提示词 */
  prompt?: string;
  /** 默认模型 ID */
  defaultModelId?: string;
  /** 自定义模型列表 */
  customModels?: Array<{
    id: string;
    name: string;
    providerType: string;
    endpoint: string;
    apiKey: string;
    modelId: string;
  }>;
  /** RAG 参数 */
  ragParams?: {
    topK: number;
    minScore: number;
    maxChars: number;
    semanticWeight: number;
    hydeEnabled: boolean;
    rerankEnabled: boolean;
    cacheTTL: number;
    confidenceHighThreshold?: number;
    confidenceMediumThreshold?: number;
  };
  /** 知识库 ID（自动发现或手动设置） */
  knowledgeBaseId?: string;
  /** 知识库名称 */
  knowledgeBaseName?: string;
  /**
   * 简历模块运行时配置（ReUp v2 Phase 3+）。
   * 子字段独立持久化：每个子键的 POST 只覆盖对应槽位，不影响其他槽位。
   */
  resume?: {
    /** STAR 改写 / 评估的运行时参数 */
    config?: {
      topK?: number;
      confidenceChars?: number;
      fewShotIds?: string[];
      sectionOrder?: string[];
    };
    /** 隐私 / 强制本地模式 */
    privacy?: {
      forcedLocal?: boolean;
    };
    /** STAR 改写自定义 system prompt（字符串） */
    starPrompt?: string;
    /** STAR few-shot 字符串（行分隔的示例 ID 或样例文本） */
    starFewShot?: string;
    /** ATS 评分自定义 prompt */
    atsPrompt?: string;
    /** JD 匹配自定义 prompt */
    matchPrompt?: string;
  };
  /** 更新时间 */
  updatedAt?: string;
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(getConfigDir(), { recursive: true });
  } catch {
    // 目录已存在
  }
}

export async function loadConfig(): Promise<ServerConfig> {
  try {
    await ensureDir();
    const raw = await readFile(getConfigFile(), 'utf-8');
    return JSON.parse(raw) as ServerConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(partial: Partial<ServerConfig>): Promise<ServerConfig> {
  return withLock(async () => {
    let current: ServerConfig = {};
    try {
      const raw = await readFile(getConfigFile(), 'utf-8');
      current = JSON.parse(raw) as ServerConfig;
    } catch {
      // 文件不存在，使用空对象
    }
    const updated: ServerConfig = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    await ensureDir();
    await writeFile(getConfigFile(), JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  });
}

/** 获取知识库 ID（供 chat API 使用） */
export async function getKnowledgeBaseId(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.knowledgeBaseId;
}

/** 获取系统提示词（供 chat API 使用） */
export async function getCustomPrompt(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.prompt;
}

/** 获取默认模型配置（供 chat API 使用） */
export async function getModelConfig(): Promise<{
  defaultModelId?: string;
  customModels?: ServerConfig['customModels'];
}> {
  const config = await loadConfig();
  return {
    defaultModelId: config.defaultModelId,
    customModels: config.customModels,
  };
}

/** 获取 RAG 参数（供 chat API 使用） */
export async function getRAGParams(): Promise<ServerConfig['ragParams']> {
  const config = await loadConfig();
  return config.ragParams;
}
