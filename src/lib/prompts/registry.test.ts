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

  it('each default prompt is longer than 200 chars and contains key directives', () => {
    const system = getDefaultPrompt('system');
    expect(system.length).toBeGreaterThan(200);
    expect(system).toContain('资深 HR');
    expect(system).toContain('总裁');
    expect(system).toContain('[1]');
    expect(system).toContain('8 个 Skill');
    expect(system).toContain('禁止');

    const star = getDefaultPrompt('star');
    expect(star.length).toBeGreaterThan(200);
    expect(star).toContain('Situation');
    expect(star).toContain('Task');
    expect(star).toContain('Action');
    expect(star).toContain('Result');
    expect(star).toContain('禁止捏造');

    const ats = getDefaultPrompt('ats');
    expect(ats.length).toBeGreaterThan(200);
    expect(ats).toContain('JSON');
    expect(ats).toContain('weight');

    const match = getDefaultPrompt('match');
    expect(match.length).toBeGreaterThan(200);
    expect(match).toContain('strengths');
    expect(match).toContain('gaps');
    expect(match).toContain('priorities');
    expect(match).toContain('简历原文');
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
