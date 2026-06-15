// src/lib/resume/ats.test.ts
// ReUp v2 Phase 4 P1 (C1-C3): ATS adaptation tests.
//
// 覆盖 (per spec §8.C + task brief):
//  1) extractJdKeywords() ≤ topK, term/weight in [0,1]
//  2) extractJdKeywords() falls back to TF when no LLM
//  3) extractJdKeywords() falls back to TF when LLM throws
//  4) computeAtsCoverage() counts hits for known resume with overlap
//  5) computeAtsCoverage() = 0 when no overlap
//  6) computeAtsCoverage() = 100 when full overlap
//  7) Position suggestions: Python → skills; 团队管理 → basic; 高并发 → projects; default → experience
//  8) Integration: extractJdKeywords + computeAtsCoverage on real fixture → 0 < p < 100

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LLMClient, type LLMResponse } from '@/lib/llm-client';
import { computeAtsCoverage, extractJdKeywords, suggestSectionForKeyword } from './ats';
import type { ResumeDocument } from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_PATH = join(process.cwd(), 'data/user-samples/resume/简历.md');
function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

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
  raw: '张辰 / 测试开发 / 5年',
};

// Mock LLMClient that returns a fixed JSON response (or throws).
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
// Tests
// ---------------------------------------------------------------------------

describe('extractJdKeywords', () => {
  it('returns ≤ topK items, each with term and weight in [0,1]', async () => {
    const { client } = mockLLMClientWithResponse({
      content: JSON.stringify([
        { term: 'Python', weight: 0.9 },
        { term: 'Kubernetes', weight: 0.75 },
        { term: '微服务', weight: 0.6 },
      ]),
    });
    const jd = '招 Python 后端，熟悉 Kubernetes 和微服务架构';
    const out = await extractJdKeywords(jd, { llmClient: client, topK: 5 });

    expect(out.length).toBeLessThanOrEqual(5);
    expect(out.length).toBeGreaterThan(0);
    for (const k of out) {
      expect(typeof k.term).toBe('string');
      expect(k.term.length).toBeGreaterThan(0);
      expect(k.weight).toBeGreaterThanOrEqual(0);
      expect(k.weight).toBeLessThanOrEqual(1);
    }
    // Sorted by weight desc
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.weight).toBeGreaterThanOrEqual(out[i]!.weight);
    }
  });

  it('falls back to TF when LLM is not provided', async () => {
    const jd = 'Python Python Python Kubernetes 微服务 微服务';
    const out = await extractJdKeywords(jd, { topK: 5 });
    expect(out.length).toBeGreaterThan(0);
    // 'Python' is the most frequent → highest weight
    const top = out[0]!;
    expect(top.term).toBe('python');
    // Weight normalised to [0, 1]
    expect(top.weight).toBe(1);
    for (const k of out) {
      expect(k.weight).toBeGreaterThanOrEqual(0);
      expect(k.weight).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to TF when LLM throws', async () => {
    const { client } = mockLLMClientWithResponse(new Error('upstream boom'));
    const jd = 'Kubernetes Kubernetes Docker Docker Docker';
    const out = await extractJdKeywords(jd, { llmClient: client, topK: 5 });
    expect(out.length).toBeGreaterThan(0);
    // 'docker' should be top (freq 3)
    const top = out[0]!;
    expect(top.term).toBe('docker');
    expect(top.weight).toBe(1);
  });

  it('falls back to TF when LLM returns invalid JSON', async () => {
    const { client } = mockLLMClientWithResponse({
      content: 'not-json-at-all-{{{',
    });
    const jd = 'Python Java Go';
    const out = await extractJdKeywords(jd, { llmClient: client, topK: 5 });
    expect(out.length).toBeGreaterThan(0);
    // We just need it to not throw; TF should produce entries
    expect(out[0]!.term).toBeTruthy();
  });

  it('filters out single-character CJK tokens in TF fallback', async () => {
    const jd = '高并发 高并发 熟悉 熟悉 熟悉';
    const out = await extractJdKeywords(jd, { topK: 10 });
    for (const k of out) {
      expect(k.term.length).toBeGreaterThan(1);
    }
    // '熟悉' appears 3 times → should be top
    const top = out[0]!;
    expect(top.term).toBe('熟悉');
    expect(top.weight).toBe(1);
    // '高并' or '并发' bigrams from 高并发 should be present (not the single chars)
    expect(out.some((k) => k.term.includes('高') || k.term.includes('并') || k.term.includes('发'))).toBe(true);
  });
});

describe('computeAtsCoverage', () => {
  it('correctly counts hits for a known resume with overlapping keywords', () => {
    const kws = [
      { term: 'Python', weight: 0.5 },
      { term: 'Kubernetes', weight: 0.3 },
      { term: '高并发', weight: 0.2 },
    ];
    const cov = computeAtsCoverage(sampleResume, kws);
    // Python (in skills + bullets) → hit (0.5)
    // Kubernetes → miss (0.3)
    // 高并发 (in projects) → hit (0.2)
    expect(cov.hits).toBeCloseTo(0.7, 5);
    expect(cov.total).toBeCloseTo(1.0, 5);
    expect(cov.percentage).toBeCloseTo(70.0, 1);
  });

  it('returns percentage 0 when no keywords match', () => {
    const kws = [
      { term: 'Cobol', weight: 0.5 },
      { term: 'Fortran', weight: 0.5 },
    ];
    const cov = computeAtsCoverage(sampleResume, kws);
    expect(cov.hits).toBe(0);
    expect(cov.total).toBe(1);
    expect(cov.percentage).toBe(0);
  });

  it('returns percentage 100 when all keywords match', () => {
    const kws = [
      { term: 'Python', weight: 0.5 },
      { term: 'Pytest', weight: 0.3 },
      { term: 'MySQL', weight: 0.2 },
    ];
    const cov = computeAtsCoverage(sampleResume, kws);
    expect(cov.hits).toBeCloseTo(1.0, 5);
    expect(cov.total).toBeCloseTo(1.0, 5);
    expect(cov.percentage).toBe(100);
  });

  it('is case-insensitive', () => {
    const kws = [
      { term: 'PYTHON', weight: 0.5 },
      { term: 'pytest', weight: 0.5 },
    ];
    const cov = computeAtsCoverage(sampleResume, kws);
    expect(cov.hits).toBeCloseTo(1.0, 5);
    expect(cov.percentage).toBe(100);
  });

  it('returns percentage 0 when keyword list is empty', () => {
    const cov = computeAtsCoverage(sampleResume, []);
    expect(cov.hits).toBe(0);
    expect(cov.total).toBe(0);
    expect(cov.percentage).toBe(0);
  });
});

describe('suggestSectionForKeyword', () => {
  it('routes known tools/tech to skills', () => {
    expect(suggestSectionForKeyword('Python')).toBe('skills');
    expect(suggestSectionForKeyword('Kubernetes')).toBe('skills');
    expect(suggestSectionForKeyword('MySQL')).toBe('skills');
  });

  it('routes 团队/沟通/管理-style terms to basic or experience', () => {
    expect(suggestSectionForKeyword('团队管理')).toBe('basic');
    expect(suggestSectionForKeyword('沟通能力')).toBe('basic');
    expect(suggestSectionForKeyword('协作精神')).toBe('basic');
  });

  it('routes project terms like 高并发/微服务 to projects', () => {
    expect(suggestSectionForKeyword('高并发')).toBe('projects');
    expect(suggestSectionForKeyword('微服务')).toBe('projects');
    expect(suggestSectionForKeyword('分布式系统')).toBe('projects');
  });

  it('defaults ambiguous keywords to experience', () => {
    expect(suggestSectionForKeyword('React')).toBe('experience');
    expect(suggestSectionForKeyword('代码审查')).toBe('experience');
  });
});

describe('integration: extractJdKeywords + computeAtsCoverage on real fixture', () => {
  it('yields a percentage strictly between 0 and 100 for a partial-overlap JD', async () => {
    // Parse the real fixture into a ResumeDocument.
    const { parseMdResume } = await import('./parser-md');
    const doc = parseMdResume(loadFixture());
    expect(doc.experience.length).toBeGreaterThan(0);

    // Use TF (no LLM) for determinism. The JD has many Python/MySQL hits (in
    // the resume) and some non-overlap (Kubernetes/Cobol), so we expect 0 < p < 100.
    const jd =
      '招聘测试开发工程师。熟悉 Python、Pytest、MySQL、接口自动化。' +
      '有 Kubernetes 经验者优先。能写 Golang 微服务。';
    const kws = await extractJdKeywords(jd, { topK: 10 });
    expect(kws.length).toBeGreaterThan(0);
    const cov = computeAtsCoverage(doc, kws);

    expect(cov.total).toBeGreaterThan(0);
    expect(cov.percentage).toBeGreaterThan(0);
    expect(cov.percentage).toBeLessThan(100);
  });
});
