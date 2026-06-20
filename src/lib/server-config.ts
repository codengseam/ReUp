// src/lib/server-config.ts
// 服务端配置持久化：将管理员配置从 localStorage 迁移到服务端 JSON 文件
// 解决换设备/清缓存丢失问题，同时支持知识库 ID 自动发现

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'server-config.json');

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
  /** 安全与意图分类配置 */
  safetyConfig?: SafetyConfig;
  /** 知识库 ID（自动发现或手动设置） */
  knowledgeBaseId?: string;
  /** 知识库名称 */
  knowledgeBaseName?: string;
  /** 更新时间 */
  updatedAt?: string;
}

export interface SafetyConfig {
  /** 意图分类器模式：unified（默认）或 legacy */
  intentClassifierMode: 'unified' | 'legacy';
  /** 高危正则模式：命中后直接拦截 */
  highRiskPatterns: Array<{ pattern: string; category: string }>;
  /** 中危正则模式：命中后标记为中风险 */
  mediumRiskPatterns: Array<{ pattern: string; category: string }>;
  /** 命中敏感内容后的统一拦截提示 */
  blockedMessage: string;
  /** 话题越界时的兜底提示 */
  offTopicMessage: string;
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    // 目录已存在
  }
}

export async function loadConfig(): Promise<ServerConfig> {
  try {
    await ensureDir();
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as ServerConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(partial: Partial<ServerConfig>): Promise<ServerConfig> {
  return withLock(async () => {
    let current: ServerConfig = {};
    try {
      const raw = await readFile(CONFIG_FILE, 'utf-8');
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
    await writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
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

/** 默认高危正则模式 */
export const DEFAULT_HIGH_RISK_PATTERNS: Array<{ pattern: string; category: string }> = [
  { pattern: '暴力攻击|暴力伤害|威胁杀人|故意伤人|杀人|自杀身亡|自残行为|教唆自杀', category: '暴力' },
  { pattern: '色情内容|裸体照片|性交易|黄色网站', category: '色情' },
  { pattern: '种族歧视|仇恨言论|侮辱人格|人身攻击', category: '仇恨' },
  { pattern: '制造炸弹|恐怖袭击|爆炸袭击|恐怖组织', category: '恐怖' },
];

/** 默认中危正则模式 */
export const DEFAULT_MEDIUM_RISK_PATTERNS: Array<{ pattern: string; category: string }> = [
  { pattern: '密码|token|key|secret|credential', category: '安全信息' },
];

/** 默认拦截提示（可在 server-config.json 中覆盖） */
export const DEFAULT_BLOCKED_MESSAGE = '抱歉，您的问题涉及敏感内容，我无法回答。请尝试提出与本应用主题相关的问题。';

/** 默认越界提示（可在 server-config.json 中覆盖） */
export const DEFAULT_OFF_TOPIC_MESSAGE = '我是本应用的 AI 助手。请提出与本应用主题相关的问题，我会尽力为您解答。';

/** 获取安全与意图分类配置（chat API 使用） */
export async function getSafetyConfig(): Promise<SafetyConfig> {
  const config = await loadConfig();
  return {
    intentClassifierMode: config.safetyConfig?.intentClassifierMode ?? 'unified',
    highRiskPatterns: config.safetyConfig?.highRiskPatterns ?? DEFAULT_HIGH_RISK_PATTERNS,
    mediumRiskPatterns: config.safetyConfig?.mediumRiskPatterns ?? DEFAULT_MEDIUM_RISK_PATTERNS,
    blockedMessage: config.safetyConfig?.blockedMessage ?? DEFAULT_BLOCKED_MESSAGE,
    offTopicMessage: config.safetyConfig?.offTopicMessage ?? DEFAULT_OFF_TOPIC_MESSAGE,
  };
}
