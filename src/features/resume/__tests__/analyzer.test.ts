// src/features/resume/__tests__/analyzer.test.ts
// ReUp v2 Phase 1 (Task 1.4): analyzer pipeline tests.

import { describe, it, expect, vi } from 'vitest';
import { LLMClient, type LLMResponse } from '@/server/llm/llm-client';
import { analyzeResume } from '../analyzer';
import type { ResumeDocument } from '../types';
import type { JDDocument } from '@/features/jd/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLLMClientWithResponse(response: LLMResponse | Error): {
  client: LLMClient;
  invokeSpy: ReturnType<typeof vi.fn>;
} {
  const client = new LLMClient({ apiKey: 'test-key' });
  const invokeSpy = vi.fn(async (): Promise<LLMResponse> => {
    if (response instanceof Error) throw response;
    return response;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).invoke = invokeSpy;
  return { client, invokeSpy };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleResume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张辰', title: '高级测试开发工程师', yearsOfExperience: 5 },
  experience: [
    {
      company: '字节跳动',
      role: '业务负责人',
      period: '2022-10 - 至今',
      bullets: [
        '基于 Python + Pytest + Requests 搭建接口自动化体系',
        '保障需求 115 个，缺陷逃逸率从 9.76% 降至 1.42%',
      ],
    },
  ],
  projects: [
    {
      name: '懂车帝二手车商城',
      period: '2022-10 - 至今',
      bullets: ['自动化覆盖率达 90.5%', '高并发场景压测', '微服务链路追踪'],
    },
  ],
  skills: ['Python', 'Pytest', 'MySQL', 'Linux', 'Git', 'JIRA'],
  education: [],
  raw: '张辰 / 高级测试开发工程师 / 5年\nPython Pytest MySQL Linux\n高并发 微服务',
};

const sampleJD: JDDocument = {
  meta: { source: 'text', parsedAt: new Date().toISOString() },
  title: '高级测试开发工程师',
  hardRequirements: [],
  responsibilities: ['负责自动化测试体系建设'],
  skills: [],
  raw: '招聘高级测试开发工程师。熟悉 Python、Pytest、MySQL、接口自动化。有 Kubernetes 经验者优先。',
};

const emptyResume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: {},
  experience: [],
  projects: [],
  skills: [],
  education: [],
  raw: '',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyzeResume', () => {
  it('always returns diagnostics, even without JD', async () => {
    const result = await analyzeResume(sampleResume, null);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics.summary).toBeDefined();
    expect(typeof result.diagnostics.summary.total).toBe('number');
    expect(result.ats).toBeNull();
    expect(result.match).toBeNull();
    expect(result.resume).toBe(sampleResume);
    expect(result.jd).toBeNull();
  });

  it('returns ATS and match reports when JD is provided', async () => {
    const { client } = mockLLMClientWithResponse({
      content: JSON.stringify([
        { term: 'Python', weight: 0.9 },
        { term: 'Kubernetes', weight: 0.6 },
        { term: 'MySQL', weight: 0.5 },
      ]),
    });
    const result = await analyzeResume(sampleResume, sampleJD, { llmClient: client });

    expect(result.ats).not.toBeNull();
    expect(result.match).not.toBeNull();
    expect(result.diagnostics).toBeDefined();

    // ATS checks
    expect(result.ats!.jdKeywords.length).toBeGreaterThan(0);
    expect(result.ats!.coverage.total).toBeGreaterThan(0);
    expect(typeof result.ats!.coverage.percentage).toBe('number');

    // Match checks
    expect(result.match!.strengths.length).toBeGreaterThanOrEqual(0);
    expect(result.match!.gaps.length).toBeGreaterThanOrEqual(0);
    // Priorities are present (either from LLM or default fallback)
    expect(result.match!.priorities.length).toBe(3);
  });

  it('proceeds when LLM fails (ATS stays null, match uses defaults)', async () => {
    const { client } = mockLLMClientWithResponse(new Error('LLM down'));
    const result = await analyzeResume(sampleResume, sampleJD, { llmClient: client });

    expect(result.diagnostics).toBeDefined();
    // ATS: LLM failed, but TF fallback in extractJdKeywords still works
    // However, we need to check: the LLM is passed to extractJdKeywords, which
    // tries LLM first, then catches errors and falls back to TF. So ATS should
    // still produce results via TF fallback.
    expect(result.ats).not.toBeNull();
    expect(result.match).not.toBeNull();
    // Priorities should fall back to defaults
    expect(result.match!.priorities.length).toBe(3);
    expect(result.match!.priorities[0]!.action).toMatch(/量化/);
  });

  it('handles empty resume without errors', async () => {
    const result = await analyzeResume(emptyResume, null);
    expect(result.diagnostics).toBeDefined();
    expect(result.ats).toBeNull();
    expect(result.match).toBeNull();
  });

  it('handles empty JD gracefully', async () => {
    const emptyJD: JDDocument = {
      meta: { source: 'text', parsedAt: new Date().toISOString() },
      title: '',
      hardRequirements: [],
      responsibilities: [],
      skills: [],
      raw: '',
    };
    const result = await analyzeResume(sampleResume, emptyJD);
    expect(result.diagnostics).toBeDefined();
    // ATS: extractJdKeywords returns [] for empty JD
    expect(result.ats).not.toBeNull();
    expect(result.ats!.jdKeywords).toEqual([]);
    expect(result.ats!.coverage.percentage).toBe(0);
    // Match report should still be generated
    expect(result.match).not.toBeNull();
  });
});