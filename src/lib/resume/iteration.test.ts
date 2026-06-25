// src/lib/resume/iteration.test.ts
// Phase 5 — E1 single-section rewrite engine (RED first)
//
// 覆盖:
//  1) rewriteResumeSectionStream 调用 llmClient.stream, 用 buildSectionRewritePrompt,
//     yield StarChunk 序列
//  2) 空 resume + 非空 currentText 仍会调 LLM (与 rewriteResumeStream 的 fast-path 不同)
//  3) rewriteResumeSection 包装: 聚合 → { section, text, confidence }
//  4) Mock LLMClient: spy on .stream() 返回 async generator
//  5) opts.onChunk 同步触发, signal abort 透传

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient, type LLMChunk, type Message } from '@/lib/llm-client';
import {
  rewriteResumeSectionStream,
  rewriteResumeSection,
  type StarChunk,
} from './iteration';
import type { ResumeDocument } from './types';

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
      bullets: ['负责订单中台微服务架构升级'],
    },
  ],
  projects: [
    { name: '订单中台微服务架构升级', period: '2023-06 - 2023-12', bullets: ['把单体拆成 8 个微服务'] },
  ],
  skills: ['Java', 'Spring Cloud'],
  education: [],
  raw: '张辰 / 高级后端工程师 / 6年',
};

const emptyResume: ResumeDocument = {
  ...sampleResume,
  experience: [],
  projects: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake LLMClient with a programmable per-call stream queue. */
function mockLLMClientWithQueue(perCallChunks: string[][]): {
  client: LLMClient;
  streamSpy: ReturnType<typeof vi.fn>;
} {
  const client = new LLMClient({ apiKey: 'test-key' });
  const queue: string[][] = perCallChunks.map((c) => [...c]);
  const streamSpy = vi.fn(async function* (
    messages: Message[],
  ): AsyncIterable<LLMChunk> {
    void messages;
    const next = queue.shift() ?? [];
    for (const c of next) yield { content: c };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).stream = streamSpy;
  return { client, streamSpy };
}

/** Drain an AsyncIterable into a list. */
async function drain(iter: AsyncIterable<StarChunk>): Promise<StarChunk[]> {
  const out: StarChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rewriteResumeSectionStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls llmClient.stream with the focused section prompt and yields chunks + done', async () => {
    const { client, streamSpy } = mockLLMClientWithQueue([
      ['改进后的【STAR改写】内容 alpha', 'beta'],
    ]);
    const chunks = await drain(
      rewriteResumeSectionStream(sampleResume, 'STAR改写', 'old section text', {
        llmClient: client,
      }),
    );

    expect(streamSpy).toHaveBeenCalledTimes(1);
    const [messages, opts] = streamSpy.mock.calls[0] as [Message[], { signal?: AbortSignal } | undefined];
    expect(Array.isArray(messages)).toBe(true);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    // user prompt 包含目标 section 标识
    expect(messages[1]?.content).toContain('【STAR改写】');
    // user prompt 包含 currentText 作为起点
    expect(messages[1]?.content).toContain('old section text');
    void opts;

    // Section markers stripped: 收尾 "【STAR改写】" 也应被剥离, 只剩正文
    const nonDone = chunks.filter((c) => !c.done);
    const text = nonDone.map((c) => c.delta).join('');
    expect(text).toBe('改进后的内容 alphabeta');
    // 段名恒等于请求的 section
    for (const c of chunks) expect(c.section).toBe('STAR改写');
    // 必须有 done chunk
    expect(chunks.filter((c) => c.done).length).toBe(1);
  });

  it('still calls LLM for empty resume (no fast-path placeholder) when currentText is non-empty', async () => {
    const { client, streamSpy } = mockLLMClientWithQueue([['any content']]);
    const chunks = await drain(
      rewriteResumeSectionStream(emptyResume, '我的分析', '请基于...', {
        llmClient: client,
      }),
    );
    expect(streamSpy).toHaveBeenCalledTimes(1);
    // 一定有真实 LLM chunk (不返回 "（暂无内容）")
    const text = chunks.filter((c) => !c.done).map((c) => c.delta).join('');
    expect(text).toBe('any content');
  });

  it('emits opts.onChunk for every chunk (including the done chunk)', async () => {
    const { client } = mockLLMClientWithQueue([['a', 'b', 'c']]);
    const onChunk = vi.fn();
    await drain(
      rewriteResumeSectionStream(sampleResume, '建议', 'old', {
        llmClient: client,
        onChunk,
      }),
    );
    // 3 个内容 chunk + 1 个 done
    expect(onChunk).toHaveBeenCalledTimes(4);
    const calls = onChunk.mock.calls.map((c) => c[0] as StarChunk);
    expect(calls.filter((c) => c.done).length).toBe(1);
    expect(calls[0]?.section).toBe('建议');
  });

  it('strips the current section marker if LLM re-emits it mid-stream (silent removal)', async () => {
    const { client } = mockLLMClientWithQueue([
      ['prefix', '【我的分析】', 'suffix'],
    ]);
    const chunks = await drain(
      rewriteResumeSectionStream(sampleResume, '我的分析', 'current', {
        llmClient: client,
      }),
    );
    const text = chunks.filter((c) => !c.done).map((c) => c.delta).join('');
    // stripOwnMarker 静默删除当前段自身标头, 后续内容保留
    expect(text).toBe('prefixsuffix');
  });

  it('passes AbortSignal through to llmClient.stream and rejects on abort', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    const client = new LLMClient({ apiKey: 'test-key' });
    const streamSpy = vi.fn(async function* (
      _messages: Message[],
      opts?: { signal?: AbortSignal },
    ): AsyncIterable<LLMChunk> {
      yield { content: 'first' };
      if (opts?.signal) {
        await new Promise<void>((resolve, reject) => {
          if (opts.signal?.aborted) {
            reject(abortError);
            return;
          }
          opts.signal?.addEventListener('abort', () => reject(abortError), { once: true });
        });
      }
      yield { content: 'never' };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).stream = streamSpy;

    const ac = new AbortController();
    const iter = rewriteResumeSectionStream(sampleResume, 'STAR改写', 'cur', {
      llmClient: client,
      signal: ac.signal,
    });
    const it = iter[Symbol.asyncIterator]();

    const first = await it.next();
    expect(first.done).toBe(false);
    expect(first.value.delta).toBe('first');

    ac.abort();
    await expect(it.next()).rejects.toBeInstanceOf(DOMException);
  });

  it('propagates LLM upstream errors', async () => {
    const client = new LLMClient({ apiKey: 'test-key' });
    const streamSpy = vi.fn(async function* (): AsyncIterable<LLMChunk> {
      throw new Error('upstream 503');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).stream = streamSpy;

    await expect(
      drain(
        rewriteResumeSectionStream(sampleResume, 'STAR改写', 'cur', {
          llmClient: client,
        }),
      ),
    ).rejects.toThrow(/upstream 503/);
  });
});

describe('rewriteResumeSection (non-streaming wrapper)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates chunks into { section, text, confidence }', async () => {
    const { client } = mockLLMClientWithQueue([
      Array.from({ length: 5 }, (_, i) => `c${i}`),
    ]);
    const result = await rewriteResumeSection(
      sampleResume,
      '底层心法',
      'old text',
      { llmClient: client },
    );
    expect(result.section).toBe('底层心法');
    expect(result.text).toBe('c0c1c2c3c4');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('caps confidence at 1 for very long outputs', async () => {
    const big = 'x'.repeat(3000);
    const { client } = mockLLMClientWithQueue([[big]]);
    const result = await rewriteResumeSection(
      sampleResume,
      '建议',
      'old',
      { llmClient: client },
    );
    expect(result.confidence).toBe(1);
  });

  it('confidence = 0 for empty output', async () => {
    const { client } = mockLLMClientWithQueue([['']]);
    const result = await rewriteResumeSection(
      sampleResume,
      '建议',
      'old',
      { llmClient: client },
    );
    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });
});
