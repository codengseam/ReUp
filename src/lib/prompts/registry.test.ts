// src/lib/prompts/registry.test.ts
// 统一提示词注册表单元测试

import { describe, it, expect } from 'vitest';
import {
  getAllPromptSpecs,
  getPromptSpec,
  getDefaultPrompt,
  configKeyToPromptKind,
  PROMPT_REGISTRY,
} from './registry';

describe('prompt registry', () => {
  it('exposes 4 managed prompt kinds in fixed order', () => {
    const specs = getAllPromptSpecs();
    expect(specs.map((s) => s.key)).toEqual(['system', 'star', 'ats', 'match']);
  });

  it('each spec has non-empty label, description and default prompt', () => {
    for (const spec of getAllPromptSpecs()) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.description.length).toBeGreaterThan(0);
      expect(spec.defaultPrompt.length).toBeGreaterThan(0);
      expect(spec.configKey.length).toBeGreaterThan(0);
    }
  });

  it('star default prompt is no longer empty', () => {
    expect(getDefaultPrompt('star').length).toBeGreaterThan(0);
    expect(getDefaultPrompt('star')).toContain('STAR');
  });

  it('getPromptSpec returns the correct spec', () => {
    expect(getPromptSpec('system').configKey).toBe('prompt');
    expect(getPromptSpec('star').configKey).toBe('resume.starPrompt');
    expect(getPromptSpec('ats').configKey).toBe('resume.atsPrompt');
    expect(getPromptSpec('match').configKey).toBe('resume.matchPrompt');
  });

  it('configKeyToPromptKind maps config keys back to kinds', () => {
    expect(configKeyToPromptKind('prompt')).toBe('system');
    expect(configKeyToPromptKind('resume.starPrompt')).toBe('star');
    expect(configKeyToPromptKind('resume.atsPrompt')).toBe('ats');
    expect(configKeyToPromptKind('resume.matchPrompt')).toBe('match');
    expect(configKeyToPromptKind('resume.config')).toBeUndefined();
  });

  it('PROMPT_REGISTRY is keyed by kind', () => {
    expect(PROMPT_REGISTRY.system.key).toBe('system');
    expect(PROMPT_REGISTRY.star.key).toBe('star');
    expect(PROMPT_REGISTRY.ats.key).toBe('ats');
    expect(PROMPT_REGISTRY.match.key).toBe('match');
  });
});
