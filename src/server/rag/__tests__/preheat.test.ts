// src/server/rag/__tests__/preheat.test.ts
// Tests for the cold-start preheater (rag/preheat.ts).
//
// Skip paths are safe to exercise directly (no model import). The run path
// mocks embedder/reranker so no real @xenova/transformers load happens.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const realNodeEnv = process.env.NODE_ENV;
const realPreheat = process.env.REUP_PREHEAT;

// NODE_ENV 在本项目类型中是 readonly, 通过 cast 写入以切换预热门控分支。
function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

const { mockEmbed, mockRerank } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockRerank: vi.fn(),
}));

vi.mock('../embedder', () => ({
  createEmbedder: () => ({
    embed: mockEmbed,
    isReady: () => true,
  }),
}));

vi.mock('../reranker', () => ({
  rerank: mockRerank,
}));

describe('preheatRAG', () => {
  let stdoutWrite: ReturnType<typeof vi.fn>;
  let stderrWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stdoutWrite = vi.fn();
    stderrWrite = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(
      stdoutWrite as unknown as typeof process.stdout.write
    );
    vi.spyOn(process.stderr, 'write').mockImplementation(
      stderrWrite as unknown as typeof process.stderr.write
    );
    mockEmbed.mockReset();
    mockRerank.mockReset();
    delete process.env.REUP_PREHEAT;
    setNodeEnv(realNodeEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    if (realPreheat === undefined) delete process.env.REUP_PREHEAT;
    else process.env.REUP_PREHEAT = realPreheat;
    setNodeEnv(realNodeEnv);
  });

  function stdoutLines(): string[] {
    return stdoutWrite.mock.calls
      .map((c) => (c[0] as string).replace(/\n$/, ''))
      .filter((s) => s.length > 0);
  }

  it('skips with "disabled" when REUP_PREHEAT=0 (even in production)', async () => {
    setNodeEnv('production');
    process.env.REUP_PREHEAT = '0';
    const { preheatRAG } = await import('../preheat');
    await preheatRAG();

    const lines = stdoutLines();
    expect(lines.some((l) => l.includes('skipped (disabled)'))).toBe(true);
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockRerank).not.toHaveBeenCalled();
  });

  it('skips with "non-production" outside production when not opted in', async () => {
    setNodeEnv('development');
    const { preheatRAG } = await import('../preheat');
    await preheatRAG();

    const lines = stdoutLines();
    expect(lines.some((l) => l.includes('skipped (non-production)'))).toBe(true);
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockRerank).not.toHaveBeenCalled();
  });

  it('runs and loads both models in production', async () => {
    setNodeEnv('production');
    mockEmbed.mockResolvedValue(new Array(1024).fill(0));
    mockRerank.mockResolvedValue([]);

    const { preheatRAG } = await import('../preheat');
    await preheatRAG();

    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockEmbed).toHaveBeenCalledWith('preheat');
    expect(mockRerank).toHaveBeenCalledTimes(1);

    const lines = stdoutLines();
    expect(lines.some((l) => l.includes('loading BGE-M3'))).toBe(true);
    expect(lines.some((l) => l.includes('BGE-M3 ready'))).toBe(true);
    expect(lines.some((l) => l.includes('loading reranker'))).toBe(true);
    expect(lines.some((l) => l.includes('reranker ready'))).toBe(true);
    expect(lines.some((l) => l.includes('complete'))).toBe(true);
  });

  it('REUP_PREHEAT=1 forces run outside production', async () => {
    setNodeEnv('development');
    process.env.REUP_PREHEAT = '1';
    mockEmbed.mockResolvedValue([]);
    mockRerank.mockResolvedValue([]);

    const { preheatRAG } = await import('../preheat');
    await preheatRAG();

    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockRerank).toHaveBeenCalledTimes(1);
  });

  it('never rejects when embedder load fails', async () => {
    setNodeEnv('production');
    mockEmbed.mockRejectedValue(new Error('model missing'));
    mockRerank.mockResolvedValue([]);

    const { preheatRAG } = await import('../preheat');
    // Should resolve, not reject.
    await expect(preheatRAG()).resolves.toBeUndefined();

    // reranker still attempted in parallel; failure logged to stderr.
    expect(stderrWrite).toHaveBeenCalled();
  });
});
