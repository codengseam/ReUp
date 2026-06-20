// src/app/api/chat/route.test.ts
// Chat SSE endpoint tests: validation, safety block, and basic streaming flow.
// All heavy dependencies (LLM, RAG, model registry, config) are mocked so tests
// run without real API keys or vector stores.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------- Mocks (hoisted before imports) ----------------

const {
  mockStream,
  mockInvoke,
  mockRetrieve,
  mockInputGuard,
  mockOutputGuard,
  mockHallucinationCheck,
  mockAssessConfidence,
  mockClassifyIntent,
  mockGetModelCandidates,
  mockIsSafeEndpoint,
  mockRecordChatAPICall,
  mockRecordInputGuardBlocked,
  mockRecordOutputGuardBlocked,
} = vi.hoisted(() => ({
  mockStream: vi.fn(),
  mockInvoke: vi.fn(),
  mockRetrieve: vi.fn(),
  mockInputGuard: vi.fn(),
  mockOutputGuard: vi.fn(),
  mockHallucinationCheck: vi.fn(),
  mockAssessConfidence: vi.fn(),
  mockClassifyIntent: vi.fn(),
  mockGetModelCandidates: vi.fn(),
  mockIsSafeEndpoint: vi.fn(),
  mockRecordChatAPICall: vi.fn(),
  mockRecordInputGuardBlocked: vi.fn(),
  mockRecordOutputGuardBlocked: vi.fn(),
}));

vi.mock('@/lib/llm-client', () => ({
  LLMClient: vi.fn(function () {
    return {
      stream: mockStream,
      invoke: mockInvoke,
    };
  }),
}));

vi.mock('@/lib/rag', () => ({
  retrieve: mockRetrieve,
  withTimeout: <T>(p: Promise<T>) => p,
  inputGuard: mockInputGuard,
  outputGuard: mockOutputGuard,
  hallucinationCheck: mockHallucinationCheck,
  assessConfidence: mockAssessConfidence,
}));

vi.mock('@/lib/intent-classifier', () => ({
  classifyIntent: mockClassifyIntent,
}));

vi.mock('@/lib/admin-stats', () => ({
  recordChatAPICall: mockRecordChatAPICall,
  recordInputGuardBlocked: mockRecordInputGuardBlocked,
  recordOutputGuardBlocked: mockRecordOutputGuardBlocked,
}));

vi.mock('@/lib/url-safety', () => ({
  isSafeEndpoint: mockIsSafeEndpoint,
}));

vi.mock('@/lib/server-config', () => ({
  getCustomPrompt: vi.fn().mockResolvedValue(undefined),
  getRAGParams: vi.fn().mockResolvedValue(undefined),
  getModelConfig: vi.fn().mockResolvedValue({}),
  getSafetyConfig: vi.fn().mockResolvedValue({
    intentClassifierMode: 'unified',
    highRiskPatterns: [{ pattern: '暴力', category: '暴力' }],
    mediumRiskPatterns: [],
    blockedMessage: 'Blocked by test',
    offTopicMessage: 'Off-topic by test',
  }),
}));

vi.mock('@/lib/runtime-config', () => ({
  getModelCandidates: mockGetModelCandidates,
}));

vi.mock('@/lib/models', () => ({
  BUILTIN_MODEL_IDS: ['qwen3.6-plus-2026-04-02'],
}));

// ---------------- Imports (must come after vi.mock) ----------------

import { POST } from './route';

function makeJsonReq(body: unknown): Request {
  return new Request('http://localhost:8080/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readSseEvents(res: Response): Promise<unknown[]> {
  const reader = res.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = '';
  const events: unknown[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        events.push(JSON.parse(data));
      } catch {
        // ignore malformed
      }
    }
  }
  return events;
}

beforeEach(() => {
  mockStream.mockReset();
  mockInvoke.mockReset();
  mockRetrieve.mockReset();
  mockInputGuard.mockReset();
  mockOutputGuard.mockReset();
  mockHallucinationCheck.mockReset();
  mockAssessConfidence.mockReset();
  mockClassifyIntent.mockReset();
  mockGetModelCandidates.mockReset();
  mockIsSafeEndpoint.mockReset();
  mockRecordChatAPICall.mockReset();
  mockRecordInputGuardBlocked.mockReset();
  mockRecordOutputGuardBlocked.mockReset();

  // Default happy-path mocks
  mockClassifyIntent.mockResolvedValue({
    intent: 'general',
    strategy: 'direct',
    rewrittenQuery: 'hello',
    subQueries: [],
    riskLevel: 'low',
    reason: 'default',
  });
  mockRetrieve.mockResolvedValue({
    context: '',
    citations: [],
    results: [],
    rewrittenQuery: 'hello',
    strategy: 'direct',
    status: 'generating',
  });
  mockGetModelCandidates.mockResolvedValue([
    { model: 'qwen3.6-plus-2026-04-02', baseUrl: 'https://test', apiKey: 'sk-test' },
  ]);
  mockStream.mockImplementation(async function* () {
    yield { content: 'Hi' };
  });
  mockOutputGuard.mockResolvedValue({ safe: true });
  mockHallucinationCheck.mockResolvedValue({ faithful: true });
  mockAssessConfidence.mockReturnValue({ level: 'high', score: 0.9, reason: 'mock' });
});

describe('POST /api/chat', () => {
  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost:8080/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it('returns 400 when messages is missing', async () => {
    const res = await POST(makeJsonReq({}) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'messages is required' });
  });

  it('returns 400 when high-risk pattern is matched', async () => {
    const res = await POST(makeJsonReq({ messages: [{ role: 'user', content: '暴力攻击' }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('暴力');
    expect(mockRecordInputGuardBlocked).toHaveBeenCalled();
  });

  it('returns a streaming response on successful path', async () => {
    const res = await POST(makeJsonReq({ messages: [{ role: 'user', content: 'hello' }] }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');

    const events = await readSseEvents(res);
    const contentEvents = events.filter(e => typeof e === 'object' && e !== null && 'content' in e);
    expect(contentEvents).toContainEqual({ content: 'Hi' });
  });

  it('sends status and meta events before content', async () => {
    const res = await POST(makeJsonReq({ messages: [{ role: 'user', content: 'hello' }] }) as never);
    const events = await readSseEvents(res);
    const statuses = events
      .filter(e => typeof e === 'object' && e !== null && 'status' in e)
      .map(e => (e as { status: string }).status);
    expect(statuses).toContain('understanding');
    expect(statuses).toContain('searching');
    expect(statuses).toContain('generating');
  });
});
