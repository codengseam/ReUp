// src/app/api/chat/__tests__/route-timeout.test.ts
// Regression test for "正在生成答案...一直不消失" bug.
//
// Root cause: after the LLM content stream finishes, the route awaited
// outputGuard / hallucinationCheck (each issuing 1-2 LLM invokes with no
// timeoutMs -> default 60s) BEFORE emitting [DONE]. The frontend's finally
// block (clearing isLoading/status) only runs when the stream closes, so a
// slow guard kept the spinner stuck for 60-180s.
//
// Fix under test: route wraps each guard call in withTimeout(..., 8000).
// On timeout the call degrades gracefully (outputGuard -> safe allow;
// hallucinationCheck -> fail-closed check-error) so the flow proceeds to
// confidence + [DONE] without leaking a raw `error` event after content.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  retrieve: vi.fn(),
  inputGuard: vi.fn(),
  outputGuard: vi.fn(),
  hallucinationCheck: vi.fn(),
  assessConfidence: vi.fn(),
  classifyIntent: vi.fn(),
  recordChatAPICall: vi.fn(),
  recordInputGuardBlocked: vi.fn(),
  recordOutputGuardBlocked: vi.fn(),
  getCustomPrompt: vi.fn(),
  getRAGParams: vi.fn(),
  getModelConfig: vi.fn(),
  getModelCandidates: vi.fn(),
}));

vi.mock('@/server/llm/llm-client', () => ({
  LLMClient: class MockLLMClient {
    stream = mocks.stream;
  },
}));

// Real withTimeout impl is inlined here (mirrors src/server/rag/index.ts)
// so the route's actual timeout path is exercised without pulling in the
// heavy RAG module graph (vector store / embedder / LLM client).
vi.mock('@/server/rag/rag', () => ({
  withTimeout: async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
  retrieve: mocks.retrieve,
  inputGuard: mocks.inputGuard,
  outputGuard: mocks.outputGuard,
  hallucinationCheck: mocks.hallucinationCheck,
  assessConfidence: mocks.assessConfidence,
}));

vi.mock('@/server/llm/intent-classifier', () => ({
  classifyIntent: mocks.classifyIntent,
}));

vi.mock('@/server/db/admin-stats', () => ({
  recordChatAPICall: mocks.recordChatAPICall,
  recordInputGuardBlocked: mocks.recordInputGuardBlocked,
  recordOutputGuardBlocked: mocks.recordOutputGuardBlocked,
}));

vi.mock('@/server/server-config', () => ({
  getCustomPrompt: mocks.getCustomPrompt,
  getRAGParams: mocks.getRAGParams,
  getModelConfig: mocks.getModelConfig,
}));

vi.mock('@/server/runtime-config', () => ({
  getModelCandidates: mocks.getModelCandidates,
}));

import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StreamChunk {
  content: string;
}

function makeStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

function makeRequest(
  messages: Array<{ role: string; content: string }> = [{ role: 'user', content: 'test' }],
): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

async function collectSSEEvents(response: Response): Promise<string[]> {
  const body = response.body;
  if (!body) throw new Error('response has no body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = raw.trim();
      if (line.startsWith('data: ')) events.push(line.slice(6));
      else if (line.startsWith('data:')) events.push(line.slice(5).trim());
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith('data: ')) events.push(tail.slice(6));
  else if (tail.startsWith('data:')) events.push(tail.slice(5).trim());
  return events;
}

interface ParsedEvent {
  raw: string;
  json: Record<string, unknown> | null;
}

function parseEvents(events: string[]): ParsedEvent[] {
  return events.map((raw) => {
    if (raw === '[DONE]') return { raw, json: null };
    try {
      return { raw, json: JSON.parse(raw) as Record<string, unknown> };
    } catch {
      return { raw, json: null };
    }
  });
}

/** A promise that never resolves — simulates a hung LLM invoke inside a guard. */
function hangingPromise<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/api/chat SSE guard timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.getModelConfig.mockResolvedValue({ defaultModelId: undefined, customModels: undefined });
    mocks.getCustomPrompt.mockResolvedValue(undefined);
    mocks.getRAGParams.mockResolvedValue(undefined);
    mocks.getModelCandidates.mockResolvedValue([
      { model: 'test-model', baseUrl: 'http://localhost', apiKey: 'test-key' },
    ]);
    mocks.classifyIntent.mockResolvedValue({
      intent: 'general',
      strategy: 'direct',
      rewrittenQuery: 'test',
      riskLevel: 'low',
      reason: 'mock',
      subQueries: undefined,
      category: undefined,
    });
    mocks.retrieve.mockResolvedValue({
      context: 'mock context',
      citations: [{ id: 1, content: 'cite-1', source: 'src-1' }],
      results: [{ content: 'result-1', score: 0.9, docId: 'd1' }],
      rewrittenQuery: 'rw',
      strategy: 'direct',
      status: 'generating',
    });
    mocks.inputGuard.mockResolvedValue({ safe: true, riskLevel: 'low' });
    mocks.outputGuard.mockResolvedValue({ safe: true, riskLevel: 'low' });
    mocks.hallucinationCheck.mockResolvedValue({ faithful: true, hasHallucination: false });
    mocks.assessConfidence.mockReturnValue({ level: 'high', score: 0.9, reason: 'mock' });
    mocks.recordChatAPICall.mockResolvedValue(undefined);
    mocks.recordInputGuardBlocked.mockResolvedValue(undefined);
    mocks.recordOutputGuardBlocked.mockResolvedValue(undefined);
    mocks.stream.mockReturnValue(makeStream([{ content: 'Hello' }]));
  });

  // withTimeout budget is 8000ms; allow slack. Must be well under the old 60s hang.
  const DONE_BUDGET_MS = 12_000;
  const TEST_TIMEOUT_MS = 20_000;

  it(
    'terminates stream within timeout when outputGuard hangs (no raw error leaked)',
    async () => {
      // outputGuard's internal LLM invoke is hung — guard never returns.
      mocks.outputGuard.mockReturnValue(hangingPromise());
      // hallucinationCheck returns fast so it does not extend the test.
      mocks.hallucinationCheck.mockResolvedValue({ faithful: true, hasHallucination: false });

      const start = Date.now();
      const response = await POST(makeRequest());
      const events = await collectSSEEvents(response);
      const elapsed = Date.now() - start;
      const parsed = parseEvents(events);

      // [DONE] must be the terminal event, arriving within the timeout budget.
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]).toBe('[DONE]');
      expect(elapsed).toBeLessThan(DONE_BUDGET_MS);

      // Graceful degradation: no raw `error` event should be emitted after the
      // content stream. (A timeout must not surface as a user-facing error
      // once the answer has already been streamed.)
      const errorEvent = parsed.find((e) => e.json && 'error' in e.json);
      expect(errorEvent).toBeUndefined();

      // Flow continues past the timed-out guard: confidence is still emitted.
      const confEvent = parsed.find((e) => e.json && 'confidence' in e.json);
      expect(confEvent).toBeTruthy();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'terminates stream within timeout when hallucinationCheck hangs and degrades fail-closed',
    async () => {
      mocks.outputGuard.mockResolvedValue({ safe: true, riskLevel: 'low' });
      // hallucinationCheck's internal LLM invoke is hung — never returns.
      mocks.hallucinationCheck.mockReturnValue(hangingPromise());

      const start = Date.now();
      const response = await POST(makeRequest());
      const events = await collectSSEEvents(response);
      const elapsed = Date.now() - start;
      const parsed = parseEvents(events);

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]).toBe('[DONE]');
      expect(elapsed).toBeLessThan(DONE_BUDGET_MS);

      // No raw error event (graceful degradation, not outer-catch fallback).
      const errorEvent = parsed.find((e) => e.json && 'error' in e.json);
      expect(errorEvent).toBeUndefined();

      // Fail-closed degradation mirrors hallucinationCheck's internal
      // check-error path: a hallucination_warning is emitted.
      const hw = parsed.find(
        (e) => e.json && (e.json as { type?: string }).type === 'hallucination_warning',
      );
      expect(hw).toBeTruthy();
      const hwJson = hw!.json as { lowConfidence: boolean; hallucinationDetected: boolean };
      expect(hwJson.lowConfidence).toBe(true);
      expect(hwJson.hallucinationDetected).toBe(false);

      // Confidence still emitted (flow did not abort).
      const confEvent = parsed.find((e) => e.json && 'confidence' in e.json);
      expect(confEvent).toBeTruthy();
    },
    TEST_TIMEOUT_MS,
  );
});
