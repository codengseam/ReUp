import { describe, it, expect, vi } from 'vitest';
import { evaluateInterview, type InterviewMessage, type InterviewReport } from '../evaluator';
import type { LLMClient } from '@/server/llm/llm-client';
import type { ResumeDocument } from '@/features/resume/types';

function makeResume(): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: new Date().toISOString() },
    basic: { name: '张三', title: '前端工程师', yearsOfExperience: 5 },
    experience: [
      { company: 'A公司', role: '高级前端', period: '2022-2024', bullets: ['负责核心业务开发'] },
    ],
    projects: [],
    skills: ['React', 'TypeScript'],
    education: [],
    raw: 'test',
  };
}

function createMockLLM(responseText: string): LLMClient {
  return {
    invoke: vi.fn().mockResolvedValue({ content: responseText }),
    stream: vi.fn(),
    config: { apiKey: 'test', baseUrl: 'http://test', model: 'test', defaultTimeoutMs: 5000 },
  } as unknown as LLMClient;
}

function createFailingLLM(): LLMClient {
  return {
    invoke: vi.fn().mockRejectedValue(new Error('LLM error')),
    stream: vi.fn(),
    config: { apiKey: 'test', baseUrl: 'http://test', model: 'test', defaultTimeoutMs: 5000 },
  } as unknown as LLMClient;
}

describe('evaluateInterview', () => {
  const messages: InterviewMessage[] = [
    { role: 'interviewer', content: '请做自我介绍' },
    { role: 'candidate', content: '我叫张三，5年前端经验，擅长React和TypeScript。' },
    { role: 'interviewer', content: '请说说你在A公司的项目' },
    { role: 'candidate', content: '在A公司我负责核心业务开发，使用React重构了旧系统，性能提升50%。' },
  ];

  it('returns empty report for empty messages', async () => {
    const llm = createMockLLM('{}');
    const report = await evaluateInterview([], makeResume(), llm);

    expect(report.overallScore).toBe(0);
    expect(report.weaknesses).toContain('未进行任何面试对话');
    expect(report.summary).toContain('尚未开始');
  });

  it('parses LLM JSON response correctly', async () => {
    const json = JSON.stringify({
      overallScore: 8,
      strengths: ['表达清晰', '项目经验丰富'],
      weaknesses: ['技术深度不够'],
      phaseScores: { '自我介绍': 8, '项目深挖': 7, '技术考察': 0, '行为面试': 0 },
      suggestions: ['多练习技术题', '准备行为面试案例'],
      summary: '候选人整体表现良好，表达清晰有逻辑。',
    });
    const llm = createMockLLM(json);
    const report = await evaluateInterview(messages, makeResume(), llm);

    expect(report.overallScore).toBe(8);
    expect(report.strengths).toEqual(['表达清晰', '项目经验丰富']);
    expect(report.weaknesses).toEqual(['技术深度不够']);
    expect(report.phaseScores).toEqual({ '自我介绍': 8, '项目深挖': 7, '技术考察': 0, '行为面试': 0 });
    expect(report.suggestions).toEqual(['多练习技术题', '准备行为面试案例']);
    expect(report.summary).toContain('整体表现良好');
  });

  it('handles JSON in markdown code block', async () => {
    const json = JSON.stringify({
      overallScore: 7,
      strengths: ['亮点'],
      weaknesses: ['不足'],
      phaseScores: {},
      suggestions: ['建议'],
      summary: '总结',
    });
    const llm = createMockLLM('```json\n' + json + '\n```');
    const report = await evaluateInterview(messages, makeResume(), llm);

    expect(report.overallScore).toBe(7);
    expect(report.summary).toBe('总结');
  });

  it('returns fallback on LLM failure', async () => {
    const llm = createFailingLLM();
    const report = await evaluateInterview(messages, makeResume(), llm);

    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.weaknesses.length).toBeGreaterThan(0);
    expect(report.summary).toContain('系统原因');
  });

  it('returns fallback on invalid JSON', async () => {
    const llm = createMockLLM('not valid json at all');
    const report = await evaluateInterview(messages, makeResume(), llm);

    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.weaknesses.length).toBeGreaterThan(0);
  });

  it('rounds scores to integers', async () => {
    const json = JSON.stringify({
      overallScore: 7.8,
      strengths: ['a'],
      weaknesses: ['b'],
      phaseScores: { '自我介绍': 6.2 },
      suggestions: ['c'],
      summary: 'd',
    });
    const llm = createMockLLM(json);
    const report = await evaluateInterview(messages, makeResume(), llm);

    expect(report.overallScore).toBe(8);
    expect(report.phaseScores['自我介绍']).toBe(6);
  });

  it('handles missing fields gracefully', async () => {
    const llm = createMockLLM('{}');
    const report = await evaluateInterview(messages, makeResume(), llm);

    expect(report.overallScore).toBe(0);
    expect(report.strengths).toEqual([]);
    expect(report.weaknesses).toEqual([]);
    expect(report.phaseScores).toEqual({});
    expect(report.suggestions).toEqual([]);
    expect(report.summary).toBe('');
  });
});