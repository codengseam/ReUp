// src/lib/skills-loader.ts
// 阶段 3：把分散在 route.ts（SKILL_PROMPTS）/ assess.ts（HOT_QUERIES）/
// types.ts（QUICK_ENTRIES）/ suggestions.ts（SUGGESTION_DB）的弱类型配置
// 合并为单 JSON 集中管理，启动时由 zod 校验后内存缓存。
//
// 阶段 3 仅"准备数据 + 暴露查询 API"；阶段 4 才把 route.ts 的 SKILL_PROMPTS 切换到
// 这里的 getSkillPrompt(id) 走 JSON（不破坏现有功能）。

// Static JSON import (bundled into both server and client) is the canonical
// path. It works under Next.js Turbopack/webpack and is the source of truth
// for the data shape (the fs-based loader is kept as a dev-time fallback so
// hot-reloading during local script work remains fast and to give
// `node` scripts that don't go through the bundler a way to load it).
import { z } from 'zod';
import skillsJson from '../../../data/skills.json';

const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['promotion', 'interview']),
  trigger: z.string(),
  framework: z.string(),
  steps: z.array(z.string()),
});

const HotQuerySchema = z.object({
  id: z.number(),
  text: z.string(),
  category: z.enum(['promotion', 'interview']),
});

const QuickEntrySchema = z.object({
  label: z.string(),
  icon: z.string(),
  query: z.string(),
});

const SuggestionSchema = z.object({
  keywords: z.array(z.string()),
  suggestion: z.string(),
});

const SkillsFileSchema = z.object({
  version: z.number(),
  skills: z.array(SkillSchema),
  hotQueries: z.array(HotQuerySchema),
  quickEntries: z.array(QuickEntrySchema),
  suggestions: z.array(SuggestionSchema),
});

export type SkillsFile = z.infer<typeof SkillsFileSchema>;
export type SkillEntry = z.infer<typeof SkillSchema>;
export type HotQuery = z.infer<typeof HotQuerySchema>;
export type QuickEntry = z.infer<typeof QuickEntrySchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;

let cache: SkillsFile | null = null;

function getCached(): SkillsFile {
  if (cache) return cache;
  // Static import path (used in browser + Next.js bundles).
  cache = SkillsFileSchema.parse(skillsJson);
  return cache;
}

/**
 * Async load. Resolves with the validated skills file. Safe to call from
 * client and server (uses the bundled JSON in both).
 */
export async function loadSkills(): Promise<SkillsFile> {
  return getCached();
}

/**
 * Sync version: used in boot scripts, tests, and client components.
 * Reads from the bundled JSON (no `fs` access at runtime).
 */
export function loadSkillsSync(): SkillsFile {
  return getCached();
}

export function getHotQueries(): HotQuery[] {
  return cache?.hotQueries ?? [];
}

export function getSkillById(id: string): SkillEntry | undefined {
  return cache?.skills.find((s) => s.id === id);
}

export function getAllSkills(): SkillEntry[] {
  return cache?.skills ?? [];
}

export function getQuickEntries(): QuickEntry[] {
  return cache?.quickEntries ?? [];
}

export function getSuggestions(): Suggestion[] {
  return cache?.suggestions ?? [];
}

/** 测试 / 启动脚本专用：清缓存，便于热更新或重新加载 */
export function _resetForTest(): void {
  cache = null;
}
