// src/lib/db/prompt-versions.test.ts
// M3: Prompt 版本注册表测试

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetDbForTest } from '@/lib/db/connection';
import {
  registerPromptVersion,
  getActivePrompt,
  getExperimentPrompts,
  getAllPromptVersions,
  getPromptVersionsByKey,
  getPromptByVersion,
  activatePromptVersion,
  hashPrompt,
} from './prompt-versions';

beforeEach(() => {
  process.env.LOOP_ENGINEERING_DB = ':memory:';
  _resetDbForTest();
});

afterEach(() => {
  _resetDbForTest();
});

describe('hashPrompt', () => {
  it('returns sha256 hex', () => {
    const h = hashPrompt('test content');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
  it('same content gives same hash', () => {
    expect(hashPrompt('a')).toBe(hashPrompt('a'));
  });
  it('different content gives different hash', () => {
    expect(hashPrompt('a')).not.toBe(hashPrompt('b'));
  });
});

describe('registerPromptVersion', () => {
  it('inserts and retrieves a version', () => {
    const id = registerPromptVersion({
      prompt_key: 'system',
      version: 'v1.0.0',
      prompt_content: 'You are a helpful assistant',
      change_description: 'initial',
      author: 'tester',
      is_active: 1,
      is_experiment: 0,
      experiment_id: null,
      experiment_traffic: 0,
    });
    expect(id).toBeGreaterThan(0);
    const all = getAllPromptVersions();
    expect(all).toHaveLength(1);
    expect(all[0].prompt_key).toBe('system');
    expect(all[0].version).toBe('v1.0.0');
    expect(all[0].is_active).toBe(1);
    expect(all[0].prompt_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('getActivePrompt returns the active version', () => {
    registerPromptVersion({
      prompt_key: 'system', version: 'v1.0.0', prompt_content: 'old',
      change_description: null, author: null,
      is_active: 0, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'system', version: 'v2.0.0', prompt_content: 'new',
      change_description: 'upgrade', author: 'tester',
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    const active = getActivePrompt();
    expect(active?.version).toBe('v2.0.0');
  });

  it('getExperimentPrompts returns only experiment versions', () => {
    registerPromptVersion({
      prompt_key: 'system', version: 'v1.0.0', prompt_content: 'control',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'system', version: 'v1.1.0', prompt_content: 'experiment',
      change_description: 'try new prompt', author: 'tester',
      is_active: 0, is_experiment: 1, experiment_id: 'exp-1', experiment_traffic: 0.1,
    });
    const exps = getExperimentPrompts();
    expect(exps).toHaveLength(1);
    expect(exps[0].version).toBe('v1.1.0');
  });

  it('activatePromptVersion deactivates others', () => {
    registerPromptVersion({
      prompt_key: 'system', version: 'v1.0.0', prompt_content: 'a',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'system', version: 'v2.0.0', prompt_content: 'b',
      change_description: null, author: null,
      is_active: 0, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    const ok = activatePromptVersion('v2.0.0');
    expect(ok).toBe(true);
    const active = getActivePrompt();
    expect(active?.version).toBe('v2.0.0');
    // v1.0.0 应该是 inactive
    const v1 = getPromptByVersion('v1.0.0');
    expect(v1?.is_active).toBe(0);
  });

  it('activatePromptVersion returns false for missing version', () => {
    expect(activatePromptVersion('nonexistent')).toBe(false);
  });
});

describe('prompt_key support', () => {
  it('getPromptVersionsByKey returns only versions for that key', () => {
    registerPromptVersion({
      prompt_key: 'system', version: 'v1', prompt_content: 'system-prompt',
      change_description: null, author: null,
      is_active: 0, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'star', version: 'v1', prompt_content: 'star-prompt',
      change_description: null, author: null,
      is_active: 0, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'star', version: 'v2', prompt_content: 'star-prompt-v2',
      change_description: null, author: null,
      is_active: 0, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });

    expect(getPromptVersionsByKey('system')).toHaveLength(1);
    expect(getPromptVersionsByKey('star')).toHaveLength(2);
    expect(getPromptVersionsByKey('ats')).toHaveLength(0);
  });

  it('getActivePrompt filters by prompt_key', () => {
    registerPromptVersion({
      prompt_key: 'system', version: 'v1', prompt_content: 'system-active',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'star', version: 'v1', prompt_content: 'star-active',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });

    expect(getActivePrompt('system')?.version).toBe('v1');
    expect(getActivePrompt('star')?.prompt_content).toBe('star-active');
  });

  it('activatePromptVersion only deactivates versions with the same key', () => {
    registerPromptVersion({
      prompt_key: 'system', version: 'v1', prompt_content: 'system-old',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'star', version: 'v1', prompt_content: 'star-old',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      prompt_key: 'star', version: 'v2', prompt_content: 'star-new',
      change_description: null, author: null,
      is_active: 0, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });

    expect(activatePromptVersion('v2', 'star')).toBe(true);
    expect(getActivePrompt('star')?.version).toBe('v2');
    expect(getActivePrompt('system')?.version).toBe('v1');
  });
});
