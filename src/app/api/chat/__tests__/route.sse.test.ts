// src/app/api/chat/__tests__/route.sse.test.ts
// SSE contract test for /api/chat POST handler.
//
// Mocks LLMClient + all RAG functions + server/runtime config so the route
// runs deterministically. Asserts on the enqueued `data:` SSE lines:
// searching -> generating -> content chunks -> [confidence] -> [DONE],
// plus meta / hallucination_warning behaviour.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mock fns (referenced by vi.mock factories below)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  retrieve: vi.fn(),
  withTimeout: vi.fn(),
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

vi.mock('@/server/rag/rag', () => ({
  retrieve: mocks.retrieve,
  withTimeout: mocks.withTimeout,
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

// ---------------------------------------------------------------------------
// Imports (must come after vi.mock)
// ---------------------------------------------------------------------------

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

/** Read the SSE response body and return every `data:` payload (string, untrimmed of payload). */
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/api/chat SSE contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress the route's noisy timer / status logs.
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
    // withTimeout passes the promise through unchanged.
    mocks.withTimeout.mockImplementation((promise: Promise<unknown>) => promise);
    mocks.inputGuard.mockResolvedValue({ safe: true, riskLevel: 'low' });
    mocks.outputGuard.mockResolvedValue({ safe: true, riskLevel: 'low' });
    mocks.hallucinationCheck.mockResolvedValue({ faithful: true, hasHallucination: false });
    mocks.assessConfidence.mockReturnValue({ level: 'high', score: 0.9, reason: 'mock' });
    mocks.recordChatAPICall.mockResolvedValue(undefined);
    mocks.recordInputGuardBlocked.mockResolvedValue(undefined);
    mocks.recordOutputGuardBlocked.mockResolvedValue(undefined);
    mocks.stream.mockReturnValue(
      makeStream([{ content: 'Hello' }, { content: ' world' }]),
    );
  });

  it('emits status: searching then status: generating', async () => {
    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const statuses = parsed
      .filter((e) => e.json && 'status' in e.json)
      .map((e) => (e.json as { status: string }).status);

    const searchingIdx = statuses.indexOf('searching');
    const generatingIdx = statuses.indexOf('generating');
    expect(searchingIdx).toBeGreaterThanOrEqual(0);
    expect(generatingIdx).toBeGreaterThanOrEqual(0);
    expect(generatingIdx).toBeGreaterThan(searchingIdx);
  });

  it('streams content chunks in order', async () => {
    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const chunks = parsed
      .filter((e) => e.json && typeof (e.json as { content?: unknown }).content === 'string')
      .map((e) => (e.json as { content: string }).content);

    expect(chunks).toEqual(['Hello', ' world']);
    expect(chunks.join('')).toBe('Hello world');
  });

  it('emits meta with citations when RAG returns results', async () => {
    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const metaEvent = parsed.find((e) => e.json && 'meta' in e.json);
    expect(metaEvent).toBeTruthy();
    const meta = (metaEvent!.json as { meta: { citations: Array<{ content: string }> } }).meta;
    expect(meta.citations).toHaveLength(1);
    expect(meta.citations[0]!.content).toBe('cite-1');
  });

  it('emits confidence field', async () => {
    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const confEvent = parsed.find((e) => e.json && 'confidence' in e.json);
    expect(confEvent).toBeTruthy();
    const json = confEvent!.json as { confidence: string; confidenceScore: number };
    expect(json.confidence).toBe('high');
    expect(json.confidenceScore).toBe(0.9);
  });

  it('emits [DONE] terminator', async () => {
    const response = await POST(makeRequest());
    const events = await collectSSEEvents(response);
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toBe('[DONE]');
  });

  it('emits hallucination_warning (lowConfidence:true, hallucinationDetected:false) when hallucinationCheck fails with check-error', async () => {
    mocks.hallucinationCheck.mockResolvedValue({
      faithful: false,
      reason: 'check-error',
      hasHallucination: false,
    });

    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const hw = parsed.find(
      (e) => e.json && (e.json as { type?: string }).type === 'hallucination_warning',
    );
    expect(hw).toBeTruthy();
    const json = hw!.json as { lowConfidence: boolean; hallucinationDetected: boolean };
    expect(json.lowConfidence).toBe(true);
    expect(json.hallucinationDetected).toBe(false);
  });

  it('emits hallucination_warning (lowConfidence:true, hallucinationDetected:false) when hallucinationCheck returns unparseable', async () => {
    mocks.hallucinationCheck.mockResolvedValue({
      faithful: false,
      reason: 'unparseable',
      hasHallucination: false,
    });

    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const hw = parsed.find(
      (e) => e.json && (e.json as { type?: string }).type === 'hallucination_warning',
    );
    expect(hw).toBeTruthy();
    const json = hw!.json as { lowConfidence: boolean; hallucinationDetected: boolean };
    expect(json.lowConfidence).toBe(true);
    expect(json.hallucinationDetected).toBe(false);
  });

  it('emits hallucination_warning (hallucinationDetected:true) when hallucinationCheck confirms a hallucination', async () => {
    // Real hallucination: faithful=false, hasHallucination=true, no reason field.
    mocks.hallucinationCheck.mockResolvedValue({
      faithful: false,
      hasHallucination: true,
    });

    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const hw = parsed.find(
      (e) => e.json && (e.json as { type?: string }).type === 'hallucination_warning',
    );
    expect(hw).toBeTruthy();
    const json = hw!.json as { lowConfidence: boolean; hallucinationDetected: boolean };
    expect(json.lowConfidence).toBe(true);
    expect(json.hallucinationDetected).toBe(true);
  });

  it('emits safetyWarning + replaceContent when outputGuard returns unsafe', async () => {
    mocks.outputGuard.mockResolvedValue({
      safe: false,
      reason: 'violence detected',
      category: '暴力',
    });

    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const warnEvent = parsed.find((e) => e.json && 'safetyWarning' in e.json);
    expect(warnEvent).toBeTruthy();
    const json = warnEvent!.json as { safetyWarning: string; replaceContent: string };
    expect(json.safetyWarning).toBe('⚠️ 回复内容已触发安全审核，已替换为安全提示');
    expect(json.replaceContent).toBe('抱歉，生成的内容涉及暴力话题，已自动替换。请重新提问。');
  });

  it('falls back to 敏感 in replaceContent when outputGuard omits category', async () => {
    mocks.outputGuard.mockResolvedValue({
      safe: false,
      reason: 'unsafe content',
    });

    const response = await POST(makeRequest());
    const parsed = parseEvents(await collectSSEEvents(response));
    const warnEvent = parsed.find((e) => e.json && 'safetyWarning' in e.json);
    expect(warnEvent).toBeTruthy();
    const json = warnEvent!.json as { safetyWarning: string; replaceContent: string };
    expect(json.safetyWarning).toBe('⚠️ 回复内容已触发安全审核，已替换为安全提示');
    expect(json.replaceContent).toBe('抱歉，生成的内容涉及敏感话题，已自动替换。请重新提问。');
  });
});
