// src/lib/db/prompt-versions.test.ts
// M3: Prompt 版本注册表测试

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetDbForTest } from '@/lib/db/connection';
import {
  registerPromptVersion,
  getActivePrompt,
  getExperimentPrompts,
  getAllPromptVersions,
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
    expect(all[0].version).toBe('v1.0.0');
    expect(all[0].is_active).toBe(1);
    expect(all[0].prompt_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('getActivePrompt returns the active version', () => {
    registerPromptVersion({
      version: 'v1.0.0', prompt_content: 'old',
      change_description: null, author: null,
      is_active: 0, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      version: 'v2.0.0', prompt_content: 'new',
      change_description: 'upgrade', author: 'tester',
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    const active = getActivePrompt();
    expect(active?.version).toBe('v2.0.0');
  });

  it('getExperimentPrompts returns only experiment versions', () => {
    registerPromptVersion({
      version: 'v1.0.0', prompt_content: 'control',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      version: 'v1.1.0', prompt_content: 'experiment',
      change_description: 'try new prompt', author: 'tester',
      is_active: 0, is_experiment: 1, experiment_id: 'exp-1', experiment_traffic: 0.1,
    });
    const exps = getExperimentPrompts();
    expect(exps).toHaveLength(1);
    expect(exps[0].version).toBe('v1.1.0');
  });

  it('activatePromptVersion deactivates others', () => {
    registerPromptVersion({
      version: 'v1.0.0', prompt_content: 'a',
      change_description: null, author: null,
      is_active: 1, is_experiment: 0, experiment_id: null, experiment_traffic: 0,
    });
    registerPromptVersion({
      version: 'v2.0.0', prompt_content: 'b',
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
