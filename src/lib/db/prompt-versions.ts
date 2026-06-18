// src/lib/db/prompt-versions.ts
// M3: Prompt 版本注册表 - 支持实验与回滚

import { createHash } from 'node:crypto';
import { getDb } from './connection';

export interface PromptVersion {
  id: number;
  prompt_key: string;
  version: string;
  prompt_content: string;
  prompt_hash: string;
  change_description: string | null;
  author: string | null;
  is_active: number;
  is_experiment: number;
  experiment_id: string | null;
  experiment_traffic: number;
  created_at: number;
}

export type PromptVersionInput = Omit<PromptVersion, 'id' | 'prompt_hash' | 'created_at'>;

/** 受支持的提示词分类键 */
export type PromptKey = 'system' | 'star' | 'ats' | 'match';

/** SHA256(prompt_content) - 用于去重和审计 */
export function hashPrompt(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function registerPromptVersion(input: PromptVersionInput): number {
  const db = getDb();
  const hash = hashPrompt(input.prompt_content);
  const r = db.prepare(`
    INSERT INTO prompt_versions
      (prompt_key, version, prompt_content, prompt_hash, change_description, author,
       is_active, is_experiment, experiment_id, experiment_traffic)
    VALUES (@prompt_key, @version, @prompt_content, @prompt_hash, @change_description, @author,
            @is_active, @is_experiment, @experiment_id, @experiment_traffic)
  `).run({
    prompt_key: input.prompt_key ?? '',
    version: input.version,
    prompt_content: input.prompt_content,
    prompt_hash: hash,
    change_description: input.change_description,
    author: input.author,
    is_active: input.is_active ? 1 : 0,
    is_experiment: input.is_experiment ? 1 : 0,
    experiment_id: input.experiment_id,
    experiment_traffic: input.experiment_traffic,
  });
  return Number(r.lastInsertRowid);
}

export function getActivePrompt(promptKey?: PromptKey): PromptVersion | null {
  const db = getDb();
  const sql = promptKey
    ? 'SELECT * FROM prompt_versions WHERE is_active = 1 AND prompt_key = ? ORDER BY id DESC LIMIT 1'
    : 'SELECT * FROM prompt_versions WHERE is_active = 1 ORDER BY id DESC LIMIT 1';
  const stmt = db.prepare(sql);
  const row = (promptKey ? stmt.get(promptKey) : stmt.get()) as PromptVersion | undefined;
  return row ?? null;
}

export function getExperimentPrompts(): PromptVersion[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM prompt_versions WHERE is_experiment = 1 ORDER BY id')
    .all() as PromptVersion[];
}

export function getAllPromptVersions(): PromptVersion[] {
  const db = getDb();
  return db.prepare('SELECT * FROM prompt_versions ORDER BY id DESC').all() as PromptVersion[];
}

export function getPromptVersionsByKey(promptKey: PromptKey): PromptVersion[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM prompt_versions WHERE prompt_key = ? ORDER BY id DESC')
    .all(promptKey) as PromptVersion[];
}

export function getPromptByVersion(version: string, promptKey?: PromptKey): PromptVersion | null {
  const db = getDb();
  const sql = promptKey
    ? 'SELECT * FROM prompt_versions WHERE version = ? AND prompt_key = ?'
    : 'SELECT * FROM prompt_versions WHERE version = ?';
  const stmt = db.prepare(sql);
  const row = (promptKey ? stmt.get(version, promptKey) : stmt.get(version)) as PromptVersion | undefined;
  return row ?? null;
}

/** 激活指定版本 (会自动 deactive 同 key 其它版本) */
export function activatePromptVersion(version: string, promptKey?: PromptKey): boolean {
  const db = getDb();
  const target = getPromptByVersion(version, promptKey);
  if (!target) return false;
  const tx = db.transaction(() => {
    if (promptKey) {
      db.prepare('UPDATE prompt_versions SET is_active = 0 WHERE prompt_key = ?').run(promptKey);
    } else {
      db.prepare('UPDATE prompt_versions SET is_active = 0').run();
    }
    db.prepare('UPDATE prompt_versions SET is_active = 1 WHERE id = ?').run(target.id);
  });
  tx();
  return true;
}
