// src/lib/prompts/config.test.ts
// 提示词配置服务测试：验证 server-config.json 与 prompt_versions 的打通

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _resetDbForTest } from '@/lib/db/connection';
import {
  getConfiguredPrompt,
  getEffectivePrompt,
  savePrompt,
  activatePromptVersion,
  getPromptVersionHistory,
  readConfiguredPromptFromConfig,
} from './config';
import { getDefaultPrompt } from './registry';

const realCwd = process.cwd();
let tmp: string;

beforeEach(() => {
  process.env.LOOP_ENGINEERING_DB = ':memory:';
  _resetDbForTest();
  tmp = mkdtempSync(join(tmpdir(), 'reup-prompt-config-'));
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(realCwd);
  if (tmp && existsSync(tmp)) {
    rmSync(tmp, { recursive: true, force: true });
  }
  _resetDbForTest();
});

describe('prompt config service', () => {
  it('getEffectivePrompt returns default when nothing is configured', async () => {
    const p = await getEffectivePrompt('ats');
    expect(p).toBe(getDefaultPrompt('ats'));
  });

  it('getConfiguredPrompt returns null when nothing is configured', async () => {
    expect(await getConfiguredPrompt('match')).toBeNull();
  });

  it('savePrompt writes to server-config and registers a version', async () => {
    await savePrompt('system', 'USER CUSTOM SYSTEM PROMPT');

    const configured = await getConfiguredPrompt('system');
    expect(configured).toBe('USER CUSTOM SYSTEM PROMPT');

    const effective = await getEffectivePrompt('system');
    expect(effective).toBe('USER CUSTOM SYSTEM PROMPT');

    const history = getPromptVersionHistory('system');
    expect(history).toHaveLength(1);
    expect(history[0].prompt_content).toBe('USER CUSTOM SYSTEM PROMPT');
    expect(history[0].is_active).toBe(1);
    expect(history[0].prompt_key).toBe('system');
  });

  it('savePrompt preserves other resume sub-keys', async () => {
    await savePrompt('star', 'USER CUSTOM STAR PROMPT');
    await savePrompt('ats', 'USER CUSTOM ATS PROMPT');

    const configuredStar = await getConfiguredPrompt('star');
    const configuredAts = await getConfiguredPrompt('ats');
    expect(configuredStar).toBe('USER CUSTOM STAR PROMPT');
    expect(configuredAts).toBe('USER CUSTOM ATS PROMPT');
  });

  it('getEffectivePrompt returns registry default when server-config contains a placeholder', async () => {
    await savePrompt('system', 'CUSTOM SYSTEM PROMPT');
    await savePrompt('star', 'CUSTOM STAR');
    await savePrompt('ats', 'CUSTOM ATS');
    await savePrompt('match', 'MATCH-V1');

    expect(await getEffectivePrompt('system')).toBe(getDefaultPrompt('system'));
    expect(await getEffectivePrompt('star')).toBe(getDefaultPrompt('star'));
    expect(await getEffectivePrompt('ats')).toBe(getDefaultPrompt('ats'));
    expect(await getEffectivePrompt('match')).toBe(getDefaultPrompt('match'));
  });

  it('getConfiguredPrompt returns null for known placeholder values', async () => {
    await savePrompt('system', 'CUSTOM SYSTEM PROMPT');
    expect(await getConfiguredPrompt('system')).toBeNull();
  });

  it('activatePromptVersion restores a previous version to active', async () => {
    await savePrompt('match', 'USER MATCH V1');
    await savePrompt('match', 'USER MATCH V2');

    const history = getPromptVersionHistory('match');
    expect(history).toHaveLength(2);

    const v1 = history.find((h) => h.prompt_content === 'USER MATCH V1');
    expect(v1).toBeDefined();

    const ok = await activatePromptVersion('match', v1!.version);
    expect(ok).toBe(true);

    expect(await getConfiguredPrompt('match')).toBe('USER MATCH V1');
    expect(await getEffectivePrompt('match')).toBe('USER MATCH V1');
  });

  it('readConfiguredPromptFromConfig reads the correct slot', () => {
    const config = {
      prompt: 'system-custom',
      resume: {
        starPrompt: 'star-custom',
        atsPrompt: 'ats-custom',
        matchPrompt: 'match-custom',
        config: { topK: 10 },
      },
    };
    expect(readConfiguredPromptFromConfig(config, 'system')).toBe('system-custom');
    expect(readConfiguredPromptFromConfig(config, 'star')).toBe('star-custom');
    expect(readConfiguredPromptFromConfig(config, 'ats')).toBe('ats-custom');
    expect(readConfiguredPromptFromConfig(config, 'match')).toBe('match-custom');
  });
});
