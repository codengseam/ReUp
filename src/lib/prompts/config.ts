// src/lib/prompts/config.ts
// 提示词配置服务：将 server-config.json（当前生效配置）与 prompt_versions
// 表（版本历史）打通，实现“可配置 + 版本管理”。
//
// - 读取：优先返回管理员在 admin UI 保存的自定义提示词；未配置时返回注册表默认值。
// - 写入：保存到 server-config.json 的同时，在 prompt_versions 注册一个新版本。
// - 激活：可将某个历史版本重新置为生效，并写回 server-config.json。

import { loadConfig, saveConfig, type ServerConfig } from '@/server/server-config';
import {
  registerPromptVersion,
  getPromptVersionsByKey,
  getPromptByVersion,
  activatePromptVersion as activateDbPromptVersion,
  type PromptKey,
} from '@/lib/db/prompt-versions';
import {
  type PromptKind,
  getPromptSpec,
  getDefaultPrompt,
  configKeyToPromptKind,
} from './registry';

const PROMPT_KEY_TO_KIND: Record<PromptKey, PromptKind> = {
  system: 'system',
  star: 'star',
  ats: 'ats',
  match: 'match',
};

/** 把 PromptKind 映射到 prompt_versions 使用的 prompt_key */
export function kindToPromptKey(kind: PromptKind): PromptKey {
  return kind;
}

/** 把 prompt_versions 的 prompt_key 映射回 PromptKind */
export function promptKeyToKind(key: PromptKey): PromptKind {
  return PROMPT_KEY_TO_KIND[key];
}

/** 从 server-config.json 中读取指定 kind 的已配置提示词（可能为 undefined） */
export function readConfiguredPromptFromConfig(
  config: ServerConfig,
  kind: PromptKind,
): string | undefined {
  switch (kind) {
    case 'system':
      return config.prompt;
    case 'star':
      return config.resume?.starPrompt;
    case 'ats':
      return config.resume?.atsPrompt;
    case 'match':
      return config.resume?.matchPrompt;
  }
}

/** 构造用于 saveConfig 的 partial（只覆盖指定 kind 的槽位，保留 resume 其他子键） */
function buildServerConfigPartial(
  current: ServerConfig,
  kind: PromptKind,
  content: string,
): Partial<ServerConfig> {
  switch (kind) {
    case 'system':
      return { prompt: content };
    case 'star':
      return { resume: { ...(current.resume ?? {}), starPrompt: content } };
    case 'ats':
      return { resume: { ...(current.resume ?? {}), atsPrompt: content } };
    case 'match':
      return { resume: { ...(current.resume ?? {}), matchPrompt: content } };
  }
}

/** 获取当前生效提示词：自定义 > 注册表默认 */
export async function getEffectivePrompt(kind: PromptKind): Promise<string> {
  const config = await loadConfig();
  const configured = readConfiguredPromptFromConfig(config, kind);
  if (configured && configured.trim().length > 0) return configured;
  return getDefaultPrompt(kind);
}

/** 获取当前已保存的自定义提示词；未配置时返回 null（用于 admin UI 判断是否为默认） */
export async function getConfiguredPrompt(kind: PromptKind): Promise<string | null> {
  const config = await loadConfig();
  const configured = readConfiguredPromptFromConfig(config, kind);
  return configured && configured.trim().length > 0 ? configured : null;
}

export interface SavePromptOptions {
  /** 变更说明，会写入 prompt_versions.change_description */
  changeDescription?: string;
  /** 作者标识，会写入 prompt_versions.author */
  author?: string;
}

/** 保存提示词：写入 server-config.json + 在 prompt_versions 注册新版本 */
export async function savePrompt(
  kind: PromptKind,
  content: string,
  opts: SavePromptOptions = {},
): Promise<void> {
  const key = kindToPromptKey(kind);
  const version = generateVersion(kind);

  // 1) 持久化当前生效配置（读取 current 以保留 resume 其他子键）
  const current = await loadConfig();
  await saveConfig(buildServerConfigPartial(current, kind, content));

  // 2) 注册版本（DB 异常不应阻塞配置保存）
  try {
    registerPromptVersion({
      prompt_key: key,
      version,
      prompt_content: content,
      change_description: opts.changeDescription ?? null,
      author: opts.author ?? null,
      is_active: 1,
      is_experiment: 0,
      experiment_id: null,
      experiment_traffic: 0,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[prompt-config] failed to register version for ${kind}:`, err);
  }
}

/** 激活某个历史版本：将其置为 active 并写回 server-config.json */
export async function activatePromptVersion(kind: PromptKind, version: string): Promise<boolean> {
  const key = kindToPromptKey(kind);
  const target = getPromptByVersion(version, key);
  if (!target) return false;

  const ok = activateDbPromptVersion(version, key);
  if (!ok) return false;

  const current = await loadConfig();
  await saveConfig(buildServerConfigPartial(current, kind, target.prompt_content));
  return true;
}

/** 获取某个 kind 的版本历史（按 id 降序） */
export function getPromptVersionHistory(kind: PromptKind) {
  return getPromptVersionsByKey(kindToPromptKey(kind));
}

/** 按 admin config key 获取 PromptKind；未知 key 返回 undefined */
export { configKeyToPromptKind };

/** 按 PromptKind 获取注册表规格（含 configKey、默认文本等） */
export { getPromptSpec };

function generateVersion(kind: PromptKind): string {
  const now = new Date();
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '-' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0') +
    '-' +
    String(now.getMilliseconds()).padStart(3, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${kind}-${ts}-${rand}`;
}
