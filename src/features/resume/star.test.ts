// src/lib/resume/prompts/star.test.ts
// Phase 3 P0 — B2 STAR 改写 prompt 模板单测（RED → GREEN）
// 覆盖：system/user 结构、4 段标识、Few-shot 可控、Skills 注入、纯函数、不抛错

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadSkillsSync } from '@/server/rag/skills-loader';
import type { ResumeDocument } from './types';

// 注：被测模块在测试模块之后 import，便于对 console.warn 做 spy。
// 见末尾 dynamic import。
type BuildStarFn = (resume: ResumeDocument, opts?: { exampleIds?: string[] }) => { system: string; user: string };
let buildStarRewritePrompt: BuildStarFn;
let MAX_PROMPT_TOKENS: number;

const sampleResume: ResumeDocument = {
  meta: { version: '1', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: {
    name: '张辰',
    title: '高级后端工程师',
    yearsOfExperience: 6,
  },
  experience: [
    {
      company: '蓝芯科技',
      role: '高级后端工程师',
      period: '2023-03 - 至今',
      bullets: [
        '负责订单中台微服务架构升级',
        '主导了缓存体系的优化',
      ],
    },
  ],
  projects: [
    {
      name: '订单中台微服务架构升级',
      period: '2023-06 - 2023-12',
      bullets: ['把单体拆成 8 个微服务'],
    },
  ],
  skills: ['Java', 'Spring Cloud', 'MySQL', 'Redis'],
  education: [
    { school: '示例大学', degree: '计算机科学 本科', period: '2016-09 - 2020-07' },
  ],
  raw: '张辰 / 高级后端工程师 / 6年',
};

describe('buildStarRewritePrompt', () => {
  beforeAll(async () => {
    // 触发 skills 缓存加载（与 skills-loader.test 保持一致）
    loadSkillsSync();
    const mod = await import('./star');
    buildStarRewritePrompt = mod.buildStarRewritePrompt as BuildStarFn;
    MAX_PROMPT_TOKENS = mod.MAX_PROMPT_TOKENS;
  });

  // 1) 返回结构
  it('returns { system, user } with both non-empty', () => {
    const r = buildStarRewritePrompt(sampleResume);
    expect(typeof r.system).toBe('string');
    expect(typeof r.user).toBe('string');
    expect(r.system.length).toBeGreaterThan(0);
    expect(r.user.length).toBeGreaterThan(0);
  });

  // 2) System 包含 STAR + 4 段标识
  it('system prompt mentions STAR and all 4 section markers', () => {
    const r = buildStarRewritePrompt(sampleResume);
    expect(r.system).toContain('STAR');
    expect(r.system).toContain('【我的分析】');
    expect(r.system).toContain('【STAR改写】');
    expect(r.system).toContain('【底层心法】');
    expect(r.system).toContain('【建议】');
  });

  // 3) System 默认至少包含 1 个 few-shot
  it('system prompt contains at least one few-shot example by default', () => {
    const r = buildStarRewritePrompt(sampleResume);
    // example-1 的 persona 含「张辰 / 高级后端工程师」或 「蓝芯科技」
    const hasExample1 =
      r.system.includes('张辰') ||
      r.system.includes('蓝芯科技') ||
      r.system.includes('example-1');
    expect(hasExample1).toBe(true);
  });

  // 4) User prompt 包含 basic.name 或 basic.title
  it('user prompt includes basic.name or basic.title for context', () => {
    const r = buildStarRewritePrompt(sampleResume);
    const hasName = r.user.includes('张辰');
    const hasTitle = r.user.includes('高级后端工程师');
    expect(hasName || hasTitle).toBe(true);
  });

  // 5) opts.exampleIds = [] → 无 few-shot
  it('opts.exampleIds = [] injects no few-shot examples', () => {
    const r = buildStarRewritePrompt(sampleResume, { exampleIds: [] });
    // 至少 example-1 的人名不应再出现
    expect(r.system).not.toContain('张辰');
    expect(r.system).not.toContain('蓝芯科技');
    expect(r.system).not.toContain('example-1');
  });

  // 6) opts.exampleIds = ['example-1', 'example-2'] → 两个 example 都注入
  it('opts.exampleIds = [example-1, example-2] injects both examples', () => {
    const r = buildStarRewritePrompt(sampleResume, {
      exampleIds: ['example-1', 'example-2'],
    });
    expect(r.system).toContain('张辰');
    expect(r.system).toContain('蓝芯科技');
    expect(r.system).toContain('李冉');
    expect(r.system).toContain('启明互娱');
  });

  // 7) 8 Skills 注入
  it('system prompt includes the 8 skills from data/skills.json', () => {
    const r = buildStarRewritePrompt(sampleResume);
    // 任取一个已知的 skill name 验证（来自 data/skills.json）
    expect(r.system).toContain('晋升底层逻辑');
    expect(r.system).toContain('反问框架');
    // 8 个 id 都在 SKILL_SUMMARIES 块中
    const allSkills = loadSkillsSync().skills;
    for (const s of allSkills) {
      expect(r.system).toContain(s.name);
    }
  });

  // 8) 纯函数：同样输入 → 同样输出（不调 LLM）
  it('is pure: same input -> same output, no LLM call', async () => {
    // 全局 fetch / openai 调用 spy 应未被触发
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r1 = buildStarRewritePrompt(sampleResume);
    const r2 = buildStarRewritePrompt(sampleResume);
    expect(r1.system).toBe(r2.system);
    expect(r1.user).toBe(r2.user);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // 9) MAX_PROMPT_TOKENS 导出
  it('exports MAX_PROMPT_TOKENS = 12000', () => {
    expect(MAX_PROMPT_TOKENS).toBe(12000);
  });

  // 10) 超长 bullets 不抛错
  it('does not crash on a resume with very long bullets array', () => {
    const longResume: ResumeDocument = {
      ...sampleResume,
      experience: [
        {
          company: 'Stress Co',
          role: '工程师',
          period: '2020 - 至今',
          bullets: Array.from({ length: 200 }, (_, i) =>
            `bullet-${i}: ${'性能优化、缓存、限流、监控'.repeat(20)}`,
          ),
        },
      ],
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = buildStarRewritePrompt(longResume);
    expect(r.system.length).toBeGreaterThan(0);
    expect(r.user.length).toBeGreaterThan(0);
    // 应当 warn 一次 token 超限
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
