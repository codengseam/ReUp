// src/lib/resume/star-rewriter.test.ts
// Phase 3 P0 — B3 STAR 改写 engine (streaming) 单测 (RED → GREEN)
//
// 覆盖:
//  1) rewriteResumeStream 产出 4 段 × (N chunks + 1 done)
//  2) opts.onChunk 对每个 chunk 都同步触发
//  3) 过滤【下一节】与跨段标头
//  4) opts.signal 触发 AbortController → 终止迭代
//  5) rewriteResume 汇总为 StarRewriteResult，confidence ∈ [0, 1]
//  6) llmClient.stream() 抛错 → rewriteResume reject
//  7) 全空简历 → 4 段占位"（暂无内容）"，且不调 LLM
//  8) LLM 输出 JSON 围栏 → 原样透传为文本

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient, type LLMChunk } from '@/lib/llm-client';
import { rewriteResumeStream, rewriteResume, type StarChunk } from './star-rewriter';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake LLMClient whose `.stream()` returns the queued chunks
 * (one queue entry per call). Internally uses vi.spyOn on a real instance.
 */
function mockLLMClientWithQueue(perCallChunks: string[][]): {
  client: LLMClient;
  streamSpy: ReturnType<typeof vi.fn>;
} {
  const client = new LLMClient({ apiKey: 'test-key' });
  const queue: string[][] = perCallChunks.map((c) => [...c]);
  const streamSpy = vi.fn(async function* (): AsyncIterable<LLMChunk> {
    const next = queue.shift() ?? [];
    for (const c of next) yield { content: c };
  });
  // Replace the prototype method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).stream = streamSpy;
  return { client, streamSpy };
}

/** Drain an AsyncIterable into an array of StarChunk. */
async function drain(iter: AsyncIterable<StarChunk>): Promise<StarChunk[]> {
  const out: StarChunk[] = [];
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

  // 1) 4 段 × (N + 1 done) 形式
  it('yields 4 sections × (3 chunks + 1 done) for a mock LLM emitting 3 chunks per section', async () => {
    const { client } = mockLLMClientWithQueue([
      ['M1-1', 'M1-2', 'M1-3'],
      ['S1-1', 'S1-2', 'S1-3'],
      ['X1-1', 'X1-2', 'X1-3'],
      ['J1-1', 'J1-2', 'J1-3'],
    ]);
    const chunks = await drain(rewriteResumeStream(sampleResume, { llmClient: client }));

    // 总数 = 4 段 * (3 个内容 + 1 个 done) = 16
    expect(chunks).toHaveLength(16);

    // 段顺序
    const sectionOrder: string[] = [];
    let lastSection: string | null = null;
    for (const c of chunks) {
      if (c.section !== lastSection) {
        sectionOrder.push(c.section);
        lastSection = c.section;
      }
    }
    expect(sectionOrder).toEqual(['我的分析', 'STAR改写', '底层心法', '建议']);

    // 每段恰好 1 个 done=true
    const doneChunks = chunks.filter((c) => c.done);
    expect(doneChunks).toHaveLength(4);
    for (const d of doneChunks) {
      expect(d.delta).toBe('');
    }

    // 收集每段非 done chunk 的 delta
    const bySection: Record<string, string> = {
      我的分析: '',
      STAR改写: '',
      底层心法: '',
      建议: '',
    };
    for (const c of chunks) {
      if (!c.done) bySection[c.section] += c.delta;
    }
    expect(bySection['我的分析']).toBe('M1-1M1-2M1-3');
    expect(bySection['STAR改写']).toBe('S1-1S1-2S1-3');
    expect(bySection['底层心法']).toBe('X1-1X1-2X1-3');
    expect(bySection['建议']).toBe('J1-1J1-2J1-3');
  });

  // 2) opts.onChunk 同步触发
  it('calls opts.onChunk for every chunk (synchronously, before yielding)', async () => {
    const { client } = mockLLMClientWithQueue([
      ['a', 'b'],
      ['c'],
      ['d', 'e', 'f'],
      ['g'],
    ]);
    const onChunk = vi.fn();
    await drain(rewriteResumeStream(sampleResume, { llmClient: client, onChunk }));

    // 2 + 1 + 1 (done) + 3 + 1 (done) + 1 (done) + 1 + 1 (done) = 11
    expect(onChunk).toHaveBeenCalledTimes(11);
    // 第 1 个调用的 chunk.section 应是 "我的分析"
    const firstCall = onChunk.mock.calls[0]?.[0] as StarChunk;
    expect(firstCall.section).toBe('我的分析');
    expect(firstCall.done).toBe(false);
    // 段边界
    const called = onChunk.mock.calls.map((c) => c[0] as StarChunk);
    const seenDone = called.filter((c) => c.done);
    expect(seenDone).toHaveLength(4);
  });

  // 3) 过滤【下一节】与跨段标头
  it('strips "【下一节】" and any other section markers that leak into the delta', async () => {
    const { client } = mockLLMClientWithQueue([
      // 段 1: LLM 自报家门 + 偷偷写了下一节开头
      ['【我的分析】', '分析内容', '【下一节】', '漏到下一节的内容', '【STAR改写】'],
      // 段 2: LLM 在段 2 输出了【底层心法】(跨段泄漏)
      ['【STAR改写】', 'STAR 内容', '【底层心法】', '漏的'],
      // 段 3: 干净
      ['底层心法内容'],
      // 段 4: 干净
      ['建议内容'],
    ]);
    const chunks = await drain(rewriteResumeStream(sampleResume, { llmClient: client }));

    const collect = (section: string): string =>
      chunks
        .filter((c) => c.section === section && !c.done)
        .map((c) => c.delta)
        .join('');

    expect(collect('我的分析')).toBe('分析内容');
    // 段 1 中"【下一节】漏到下一节的内容【STAR改写】"必须被剥离
    expect(collect('STAR改写')).toBe('STAR 内容');
    // 段 2 中【底层心法】漏的 也要被剥离
    expect(collect('底层心法')).toBe('底层心法内容');
    expect(collect('建议')).toBe('建议内容');
  });

  // 4) AbortSignal 终止迭代
  it('respects opts.signal: AbortController stops the iteration mid-stream', async () => {
    // 让 stream 永远不结束（不主动 yield 也不 close），仅当 signal 触发 abort 时立刻抛
    const abortError = new DOMException('Aborted', 'AbortError');
    const { client } = mockLLMClientWithQueue([]); // queue 为空, 但 mock 会立刻结束 - 不够

    // 重新构造一个能感知 signal 的 mock
    const client2 = new LLMClient({ apiKey: 'test-key' });
    const streamSpy = vi.fn(async function* (
      _messages: unknown[],
      opts?: { signal?: AbortSignal },
    ): AsyncIterable<LLMChunk> {
      // 第一段: 先 yield 一个 chunk，然后等待 signal
      yield { content: 'first-chunk' };
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
    (client2 as any).stream = streamSpy;

    void client; // keep TS happy

    const ac = new AbortController();
    const collected: StarChunk[] = [];
    const iter = rewriteResumeStream(sampleResume, { llmClient: client2, signal: ac.signal });
    const it = iter[Symbol.asyncIterator]();

    const first = await it.next();
    expect(first.done).toBe(false);
    expect(first.value.delta).toBe('first-chunk');
    collected.push(first.value);

    // 中止
    ac.abort();

    // 后续 next() 应抛 AbortError
    await expect(it.next()).rejects.toBeInstanceOf(DOMException);
  });

  // 8) JSON 围栏透传（不解析）
  it('passes JSON-fenced content through as plain text (no JSON parsing)', async () => {
    const jsonPayload = '```json\n{"foo": "bar"}\n```';
    const { client } = mockLLMClientWithQueue([
      [jsonPayload],
      ['ok'],
      ['ok'],
      ['ok'],
    ]);
    const chunks = await drain(rewriteResumeStream(sampleResume, { llmClient: client }));
    const collect = (section: string): string =>
      chunks
        .filter((c) => c.section === section && !c.done)
        .map((c) => c.delta)
        .join('');
    // 段 1 应当是 JSON 围栏的原始字符串
    expect(collect('我的分析')).toBe(jsonPayload);
    // 其余段透传
    expect(collect('STAR改写')).toBe('ok');
  });

  // 3b) 泄漏标头出现在 delta 中部 (前面有内容)
  it('truncates at a leak marker that appears mid-delta and keeps the prefix', async () => {
    const { client } = mockLLMClientWithQueue([
      // 单个 chunk 内, 泄漏标头在中部, 前面有内容
      ['前面内容【下一节】后面被丢弃'],
      ['段2纯文本'],
      ['段3'],
      ['段4'],
    ]);
    const chunks = await drain(rewriteResumeStream(sampleResume, { llmClient: client }));
    const collect = (section: string): string =>
      chunks
        .filter((c) => c.section === section && !c.done)
        .map((c) => c.delta)
        .join('');
    // 段 1 应当只保留 "前面内容", 标头及之后被截断
    expect(collect('我的分析')).toBe('前面内容');
    expect(collect('STAR改写')).toBe('段2纯文本');
  });
});

describe('rewriteResume (non-streaming wrapper)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 5) 汇总为 StarRewriteResult，confidence ∈ [0, 1]
  it('collects all chunks into sections and returns confidence in [0, 1]', async () => {
    const { client } = mockLLMClientWithQueue([
      Array.from({ length: 5 }, (_, i) => `m${i}`),
      Array.from({ length: 10 }, (_, i) => `s${i}`),
      Array.from({ length: 3 }, (_, i) => `x${i}`),
      Array.from({ length: 2 }, (_, i) => `j${i}`),
    ]);
    const result = await rewriteResume(sampleResume, { llmClient: client });

    expect(result.sections['我的分析']).toBe('m0m1m2m3m4');
    expect(result.sections['STAR改写']).toBe('s0s1s2s3s4s5s6s7s8s9');
    expect(result.sections['底层心法']).toBe('x0x1x2');
    expect(result.sections['建议']).toBe('j0j1');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(typeof result.confidence).toBe('number');
  });

  it('confidence = 0 when total characters is 0, and caps at 1 for very large output', async () => {
    // 0-char 全段 → confidence 应为 0
    const { client: c1 } = mockLLMClientWithQueue([[''], [''], [''], ['']]);
    const r1 = await rewriteResume(sampleResume, { llmClient: c1 });
    expect(r1.confidence).toBe(0);

    // 极大输出 (>2000 字符) → confidence 应被 cap 在 1
    const huge = 'x'.repeat(3000);
    const { client: c2 } = mockLLMClientWithQueue([[huge], [huge], [huge], [huge]]);
    const r2 = await rewriteResume(sampleResume, { llmClient: c2 });
    expect(r2.confidence).toBe(1);
  });

  // 6) LLM 抛错 → reject
  it('throws if llmClient.stream() throws (e.g. 401 / 429)', async () => {
    const client = new LLMClient({ apiKey: 'test-key' });
    const streamSpy = vi.fn(async function* (): AsyncIterable<LLMChunk> {
      throw new Error('simulated upstream failure');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).stream = streamSpy;
    await expect(rewriteResume(sampleResume, { llmClient: client })).rejects.toThrow(/simulated upstream failure/);
  });

  // 7) 全空简历 → 占位文本，不调 LLM
  it('returns 4 placeholder sections ("（暂无内容）") without calling LLM when resume is empty', async () => {
    const empty: ResumeDocument = {
      meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '',
    };
    const { client, streamSpy } = mockLLMClientWithQueue([]);
    const result = await rewriteResume(empty, { llmClient: client });

    // 不应调 LLM
    expect(streamSpy).not.toHaveBeenCalled();
    expect(result.sections['我的分析']).toBe('（暂无内容）');
    expect(result.sections['STAR改写']).toBe('（暂无内容）');
    expect(result.sections['底层心法']).toBe('（暂无内容）');
    expect(result.sections['建议']).toBe('（暂无内容）');
    // 占位文本 "（暂无内容）" 是 6 个字符 (含 2 个全角括号),
    // 4 段共 24 字符, confidence = min(1, 24/2000) = 0.012
    expect(result.confidence).toBeCloseTo(24 / 2000, 10);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.05);
  });

  it('still returns placeholder when only experience is empty (other fields non-empty)', async () => {
    const partial: ResumeDocument = {
      ...sampleResume,
      experience: [],
      projects: [],
    };
    const { client, streamSpy } = mockLLMClientWithQueue([]);
    const result = await rewriteResume(partial, { llmClient: client });
    expect(streamSpy).not.toHaveBeenCalled();
    expect(result.sections['STAR改写']).toBe('（暂无内容）');
  });
});
