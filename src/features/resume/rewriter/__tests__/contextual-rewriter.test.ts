// src/features/resume/rewriter/__tests__/contextual-rewriter.test.ts
// Phase 2 (Task 2.1): Contextual STAR rewrite engine tests.
//
// Coverage:
//  1) rewriteResumeStream yields per-section chunks with done flag
//  2) onChunk callback fires for every delta
//  3) System prompt includes match gaps and diagnostic info
//  4) Empty sections get placeholder, no LLM call
//  5) rewriteResume aggregates chunks into RewriteResult with changes
//  6) LLM error propagates to caller
//  7) Change tracking captures before/after/reason

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient, type LLMChunk } from '@/server/llm/llm-client';
import {
  rewriteResumeStream,
  rewriteResume,
} from '../contextual-rewriter';
import type { RewriteRequest, TargetSection } from '../contextual-rewriter';
import type { ResumeDocument, MatchReport } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleResume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张辰', title: '高级后端工程师', yearsOfExperience: 6 },
  experience: [
    {
      company: '蓝芯科技',
      role: '高级后端工程师',
      period: '2023-03 - 至今',
      bullets: ['负责订单中台微服务架构升级', '主导了缓存体系的优化'],
    },
  ],
  projects: [
    { name: '订单中台微服务架构升级', period: '2023-06 - 2023-12', bullets: ['把单体拆成 8 个微服务'] },
  ],
  skills: ['Java', 'Spring Cloud', 'MySQL', 'Redis'],
  education: [{ school: '示例大学', degree: '计算机科学 本科', period: '2016-09 - 2020-07' }],
  raw: '张辰 / 高级后端工程师 / 6年',
};

const sampleMatchReport: MatchReport = {
  strengths: [{ dimension: '架构设计', evidence: '主导微服务架构升级' }],
  gaps: [
    { dimension: '晋升底层逻辑', severity: 'high' },
    { dimension: 'JD匹配', severity: 'medium' },
  ],
  priorities: [
    { rank: 1, action: '在 Top 3 工作描述中添加量化数据', expectedImpact: 'High' },
    { rank: 2, action: '将 JD 中的核心技术栈明确写入技能列表', expectedImpact: 'Medium' },
    { rank: 3, action: '在简历顶部添加 1 行个人亮点总结', expectedImpact: 'Low' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLLMClientWithQueue(
  perCallChunks: string[][],
): { client: LLMClient; streamSpy: ReturnType<typeof vi.fn> } {
  const client = new LLMClient({ apiKey: 'test-key' });
  const queue: string[][] = perCallChunks.map((c) => [...c]);
  const streamSpy = vi.fn(async function* (): AsyncIterable<LLMChunk> {
    const next = queue.shift() ?? [];
    for (const c of next) yield { content: c };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).stream = streamSpy;
  return { client, streamSpy };
}

async function drainStream(
  iter: AsyncIterable<{ section: TargetSection; delta: string; done: boolean }>,
): Promise<Array<{ section: TargetSection; delta: string; done: boolean }>> {
  const out: Array<{ section: TargetSection; delta: string; done: boolean }> = [];
  for await (const c of iter) out.push(c);
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rewriteResumeStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('yields chunks per target section with done flag', async () => {
    const { client } = mockLLMClientWithQueue([
      ['exp-1', 'exp-2'],
      ['proj-1'],
      ['skill-1', 'skill-2', 'skill-3'],
    ]);

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience', 'projects', 'skills'],
    };

    const chunks = await drainStream(rewriteResumeStream(request, client));

    // 3 sections: experience(2 content+1 done) + projects(1 content+1 done) + skills(3 content+1 done) = 9
    expect(chunks).toHaveLength(9);

    // Check sections in order
    const sections = new Set(chunks.map((c) => c.section));
    expect(sections.has('experience')).toBe(true);
    expect(sections.has('projects')).toBe(true);
    expect(sections.has('skills')).toBe(true);

    // Check done count
    const doneChunks = chunks.filter((c) => c.done);
    expect(doneChunks).toHaveLength(3);

    // Collect content per section
    const contentBySection: Record<string, string> = { experience: '', projects: '', skills: '' };
    for (const c of chunks) {
      if (!c.done) contentBySection[c.section] += c.delta;
    }
    expect(contentBySection['experience']).toBe('exp-1exp-2');
    expect(contentBySection['projects']).toBe('proj-1');
    expect(contentBySection['skills']).toBe('skill-1skill-2skill-3');
  });

  it('calls onChunk for every delta', async () => {
    const { client } = mockLLMClientWithQueue([
      ['a', 'b'],
      ['c'],
    ]);

    const onChunk = vi.fn();
    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience', 'projects'],
    };

    await drainStream(rewriteResumeStream(request, client, onChunk));

    // 2 sections: experience(2 content+1 done) + projects(1 content+1 done) = 5 calls
    expect(onChunk).toHaveBeenCalledTimes(5);
    // First call
    expect(onChunk.mock.calls[0]?.[0]).toBe('a');
    // Last call (done for projects)
    expect(onChunk.mock.calls[4]?.[0]).toBe('');
  });

  it('yields placeholder for empty sections without calling LLM', async () => {
    const emptyResume: ResumeDocument = {
      ...sampleResume,
      experience: [],
      projects: [],
      skills: [],
    };

    const { client, streamSpy } = mockLLMClientWithQueue([]);
    const request: RewriteRequest = {
      resume: emptyResume,
      targetSections: ['experience'],
    };

    const chunks = await drainStream(rewriteResumeStream(request, client));

    expect(streamSpy).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(2); // 1 content + 1 done
    expect(chunks[0]!.delta).toBe('（暂无内容，跳过改写）');
    expect(chunks[0]!.done).toBe(false);
    expect(chunks[1]!.done).toBe(true);
  });

  it('respects targetSections order and only rewrites requested sections', async () => {
    const { client } = mockLLMClientWithQueue([
      ['proj-rewrite'],
    ]);

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['projects'],
    };

    const chunks = await drainStream(rewriteResumeStream(request, client));

    const sections = [...new Set(chunks.map((c) => c.section))];
    expect(sections).toEqual(['projects']);
    expect(chunks).toHaveLength(2); // 1 content + 1 done
    const content = chunks.filter((c) => !c.done).map((c) => c.delta).join('');
    expect(content).toBe('proj-rewrite');
  });
});

describe('rewriteResume (non-streaming)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates stream chunks into RewriteResult with changes', async () => {
    const { client } = mockLLMClientWithQueue([
      // experience: LLM echoes back headers + STAR bullets
      ['[蓝芯科技 - 高级后端工程师 (2023-03 - 至今)]\n*Situation* 公司订单系统为单体架构\n*Task* 需要拆分为微服务\n*Action* 主导设计并实施微服务架构升级\n*Result* 系统吞吐量提升 40%'],
      // projects
      ['[订单中台微服务架构升级 (2023-06 - 2023-12)]\n*Situation* 原单体架构无法支撑增长\n*Task* 实现微服务化\n*Action* 将单体拆分为 8 个微服务\n*Result* 部署频率从月级提升到周级'],
      // skills
      ['Java, Spring Cloud, MySQL, Redis, Kubernetes, Docker'],
    ]);

    const request: RewriteRequest = {
      resume: sampleResume,
      matchReport: sampleMatchReport,
      targetSections: ['experience', 'projects', 'skills'],
    };

    const result = await rewriteResume(request, client);

    // Check result shape
    expect(result.original).toBe(sampleResume);
    expect(result.rewritten).not.toBe(sampleResume);
    expect(result.changes).toHaveLength(3);

    // Check changes
    const expChange = result.changes.find((c) => c.section === '工作经历');
    expect(expChange).toBeDefined();
    expect(expChange!.before).toContain('蓝芯科技');
    expect(expChange!.after).toContain('*Situation*');
    expect(expChange!.reason).toContain('STAR 法则');

    const projChange = result.changes.find((c) => c.section === '项目经历');
    expect(projChange).toBeDefined();
    expect(projChange!.after).toContain('*Situation*');

    const skillChange = result.changes.find((c) => c.section === '技能列表');
    expect(skillChange).toBeDefined();
    expect(skillChange!.after).toContain('Kubernetes');

    // Check rewritten resume has parsed bullets
    expect(result.rewritten.experience[0]!.bullets.length).toBeGreaterThan(0);
    expect(result.rewritten.experience[0]!.bullets[0]).toContain('*Situation*');
    expect(result.rewritten.skills).toContain('Kubernetes');
  });

  it('propagates LLM errors', async () => {
    const client = new LLMClient({ apiKey: 'test-key' });
    const streamSpy = vi.fn(async function* (): AsyncIterable<LLMChunk> {
      throw new Error('simulated upstream failure');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).stream = streamSpy;

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience'],
    };

    await expect(rewriteResume(request, client)).rejects.toThrow('simulated upstream failure');
  });

  it('returns empty changes when all sections are empty', async () => {
    const emptyResume: ResumeDocument = {
      ...sampleResume,
      experience: [],
      projects: [],
      skills: [],
    };

    const { client } = mockLLMClientWithQueue([]);
    const request: RewriteRequest = {
      resume: emptyResume,
      targetSections: ['experience'],
    };

    const result = await rewriteResume(request, client);
    expect(result.changes).toHaveLength(0);
    expect(result.rewritten.experience).toEqual([]);
  });

  it('works with matchReport undefined', async () => {
    const { client } = mockLLMClientWithQueue([
      ['[蓝芯科技 - 高级后端工程师 (2023-03 - 至今)]\n*Situation* test\n*Task* test\n*Action* test\n*Result* test'],
    ]);

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience'],
    };

    const result = await rewriteResume(request, client);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.reason).toContain('STAR 法则');
  });
});

describe('system prompt construction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('includes match gaps in the prompt sent to LLM', async () => {
    // Capture the messages passed to LLMClient.stream()
    const client = new LLMClient({ apiKey: 'test-key' });
    const capturedMessages: Array<Array<{ role: string; content: string }>> = [];
    const streamSpy = vi.fn(async function* (
      messages: Array<{ role: string; content: string }>,
    ): AsyncIterable<LLMChunk> {
      capturedMessages.push(messages);
      yield { content: 'test output' };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).stream = streamSpy;

    const request: RewriteRequest = {
      resume: sampleResume,
      matchReport: sampleMatchReport,
      targetSections: ['experience'],
    };

    await rewriteResume(request, client);

    expect(capturedMessages.length).toBeGreaterThan(0);
    const systemMsg = capturedMessages[0]!.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain('晋升底层逻辑');
    expect(systemMsg!.content).toContain('JD匹配');
    expect(systemMsg!.content).toContain('JD 匹配差距');
    expect(systemMsg!.content).toContain('优化优先级');
  });

  it('includes diagnostic issues in the prompt sent to LLM', async () => {
    const client = new LLMClient({ apiKey: 'test-key' });
    const capturedMessages: Array<Array<{ role: string; content: string }>> = [];
    const streamSpy = vi.fn(async function* (
      messages: Array<{ role: string; content: string }>,
    ): AsyncIterable<LLMChunk> {
      capturedMessages.push(messages);
      yield { content: 'test output' };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).stream = streamSpy;

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience'],
    };

    await rewriteResume(request, client);

    const systemMsg = capturedMessages[0]!.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain('简历诊断问题');
  });

  it('includes STAR guidelines in the prompt', async () => {
    const client = new LLMClient({ apiKey: 'test-key' });
    const capturedMessages: Array<Array<{ role: string; content: string }>> = [];
    const streamSpy = vi.fn(async function* (
      messages: Array<{ role: string; content: string }>,
    ): AsyncIterable<LLMChunk> {
      capturedMessages.push(messages);
      yield { content: 'test output' };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).stream = streamSpy;

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience'],
    };

    await rewriteResume(request, client);

    const systemMsg = capturedMessages[0]!.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain('STAR 法则');
    expect(systemMsg!.content).toContain('Situation');
    expect(systemMsg!.content).toContain('Task');
    expect(systemMsg!.content).toContain('Action');
    expect(systemMsg!.content).toContain('Result');
  });
});

describe('streaming output', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('streams content incrementally via onChunk', async () => {
    const { client } = mockLLMClientWithQueue([
      ['chunk1', 'chunk2', 'chunk3'],
    ]);

    const received: string[] = [];
    const onChunk = (chunk: string) => received.push(chunk);

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience'],
    };

    await rewriteResume(request, client, onChunk);

    expect(received).toEqual(['chunk1', 'chunk2', 'chunk3', '']);
  });

  it('streams multiple sections with onChunk', async () => {
    const { client } = mockLLMClientWithQueue([
      ['e1', 'e2'],
      ['p1'],
    ]);

    const received: string[] = [];
    const onChunk = (chunk: string) => received.push(chunk);

    const request: RewriteRequest = {
      resume: sampleResume,
      targetSections: ['experience', 'projects'],
    };

    await rewriteResume(request, client, onChunk);

    // e1, e2, '' (done), p1, '' (done)
    expect(received).toEqual(['e1', 'e2', '', 'p1', '']);
  });
});