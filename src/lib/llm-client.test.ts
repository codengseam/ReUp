// src/lib/llm-client.test.ts
// TDD tests for the OpenAI-compatible LLM client wrapper over DashScope.
// All network calls are mocked via vi.stubGlobal('fetch', ...).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMClient,
  LLMAuthError,
  LLMRateLimitError,
  LLMUpstreamError,
  LLMTimeoutError,
} from './llm-client';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function sseResponse(chunks: string[]): Response {
  const body = chunks.join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function sseStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('LLMClient', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // Ensure env defaults don't leak between tests
    process.env.DASHSCOPE_API_KEY = 'test-key';
    process.env.DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    process.env.DASHSCOPE_CHAT_MODEL = 'gui-plus-2026-02-26';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('throws if DASHSCOPE_API_KEY is unset', () => {
      delete process.env.DASHSCOPE_API_KEY;
      expect(() => new LLMClient()).toThrow(/DASHSCOPE_API_KEY/);
    });

    it('accepts explicit apiKey in config (no env lookup)', () => {
      delete process.env.DASHSCOPE_API_KEY;
      expect(() => new LLMClient({ apiKey: 'override' })).not.toThrow();
    });

    it('reads baseUrl and model from env when not provided', () => {
      const client = new LLMClient();
      // Reflect: introspect via a throwaway call to a non-existent URL would be silly;
      // we verify by inspecting the URL sent to fetch in invoke() tests below.
      expect(client).toBeInstanceOf(LLMClient);
    });
  });

  describe('invoke()', () => {
    it('returns parsed content from a mocked fetch response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'hi' } }] })
      );
      const client = new LLMClient();
      const result = await client.invoke([{ role: 'user', content: 'hello' }]);
      expect(result.content).toBe('hi');
    });

    it('passes messages + model + non-stream flag in request body', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'ok' } }] })
      );
      const client = new LLMClient({ model: 'custom-model' });
      await client.invoke([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'q' },
      ], { temperature: 0.3 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/v1/chat/completions');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('custom-model');
      expect(body.stream).toBe(false);
      expect(body.temperature).toBe(0.3);
      expect(body.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'q' },
      ]);
    });

    it('uses default model from DASHSCOPE_CHAT_MODEL when not overridden', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'ok' } }] })
      );
      const client = new LLMClient();
      await client.invoke([{ role: 'user', content: 'q' }]);
      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.model).toBe('gui-plus-2026-02-26');
    });

    it('throws LLMAuthError on 401 response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'invalid api key' } }, 401)
      );
      const client = new LLMClient();
      await expect(
        client.invoke([{ role: 'user', content: 'q' }])
      ).rejects.toBeInstanceOf(LLMAuthError);
    });

    it('throws LLMRateLimitError on 429 response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'rate limit' } }, 429)
      );
      const client = new LLMClient();
      await expect(
        client.invoke([{ role: 'user', content: 'q' }])
      ).rejects.toBeInstanceOf(LLMRateLimitError);
    });

    it('throws LLMUpstreamError on 500 response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'oops' } }, 500)
      );
      const client = new LLMClient();
      await expect(
        client.invoke([{ role: 'user', content: 'q' }])
      ).rejects.toBeInstanceOf(LLMUpstreamError);
    });

    it('throws LLMUpstreamError on 502/503/504 server errors', async () => {
      const client = new LLMClient();
      for (const status of [502, 503, 504]) {
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ error: { message: 'bad gateway' } }, status)
        );
        await expect(
          client.invoke([{ role: 'user', content: 'q' }])
        ).rejects.toBeInstanceOf(LLMUpstreamError);
      }
    });

    it('throws LLMUpstreamError on 4xx (non-401/429) responses', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'bad request' } }, 400)
      );
      const client = new LLMClient();
      await expect(
        client.invoke([{ role: 'user', content: 'q' }])
      ).rejects.toBeInstanceOf(LLMUpstreamError);
    });

    it('returns usage + model when provider includes them', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          model: 'echoed-model-id',
          choices: [{ message: { role: 'assistant', content: 'hi' } }],
          usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
        })
      );
      const client = new LLMClient();
      const r = await client.invoke([{ role: 'user', content: 'q' }]);
      expect(r.content).toBe('hi');
      expect(r.model).toBe('echoed-model-id');
      expect(r.usage).toEqual({ promptTokens: 3, completionTokens: 5, totalTokens: 8 });
    });

    it('throws LLMError on non-JSON response body', async () => {
      fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
      const client = new LLMClient();
      await expect(
        client.invoke([{ role: 'user', content: 'q' }])
      ).rejects.toThrow(/non-JSON/);
    });

    it('accepts a custom baseUrl', () => {
      const client = new LLMClient({ baseUrl: 'https://example.com/v1/' });
      expect(client.config.baseUrl).toBe('https://example.com/v1');
    });

    it('rejects with LLMTimeoutError when fetch takes longer than timeoutMs', async () => {
      // Mock that respects the AbortSignal: never resolves unless aborted, then rejects.
      fetchMock.mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (signal) {
              if (signal.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }
              signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          })
      );
      const client = new LLMClient();
      const start = Date.now();
      await expect(
        client.invoke([{ role: 'user', content: 'q' }], { timeoutMs: 50 })
      ).rejects.toBeInstanceOf(LLMTimeoutError);
      const elapsed = Date.now() - start;
      // Sanity: should bail out around the timeout, not hang forever.
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('stream()', () => {
    it('yields 3 chunks from a mocked SSE response with 3 data lines + [DONE]', async () => {
      const sse = [
        'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"c"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      fetchMock.mockResolvedValueOnce(sseResponse(sse));
      const client = new LLMClient();

      const collected: string[] = [];
      for await (const chunk of client.stream([{ role: 'user', content: 'q' }])) {
        collected.push(chunk.content);
      }
      expect(collected).toEqual(['a', 'b', 'c']);
    });

    it('strips the [DONE] sentinel and does not yield it as a chunk', async () => {
      const sse = [
        'data: {"choices":[{"delta":{"content":"only"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      fetchMock.mockResolvedValueOnce(sseResponse(sse));
      const client = new LLMClient();

      const collected: string[] = [];
      for await (const chunk of client.stream([{ role: 'user', content: 'q' }])) {
        collected.push(chunk.content);
      }
      expect(collected).toEqual(['only']);
      // No chunk should be the literal [DONE]
      expect(collected).not.toContain('[DONE]');
    });

    it('sends stream: true in the request body', async () => {
      const sse = ['data: [DONE]\n\n'];
      fetchMock.mockResolvedValueOnce(sseResponse(sse));
      const client = new LLMClient();
      // Drain the stream
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of client.stream([{ role: 'user', content: 'q' }])) {
        // empty
      }
      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.stream).toBe(true);
    });

    it('yields nothing when the stream has no candidates and no content delta', async () => {
      const sse = [
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{}]}\n\n',
        'data: [DONE]\n\n',
      ];
      fetchMock.mockResolvedValueOnce(sseResponse(sse));
      const client = new LLMClient();
      const collected: string[] = [];
      for await (const chunk of client.stream([{ role: 'user', content: 'q' }])) {
        collected.push(chunk.content);
      }
      expect(collected).toEqual([]);
    });

    it('handles a streaming body delivered via ReadableStream (multi-chunk)', async () => {
      const sse = [
        'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"y"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"z"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      fetchMock.mockResolvedValueOnce(sseStreamResponse(sse));
      const client = new LLMClient();
      const collected: string[] = [];
      for await (const chunk of client.stream([{ role: 'user', content: 'q' }])) {
        collected.push(chunk.content);
      }
      expect(collected).toEqual(['x', 'y', 'z']);
    });

    it('yields nothing when response body is null', async () => {
      // Response with ok=true but body=null
      const res = new Response(null, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      // Override body to null
      Object.defineProperty(res, 'body', { value: null, configurable: true });
      fetchMock.mockResolvedValueOnce(res);
      const client = new LLMClient();
      const collected: string[] = [];
      for await (const chunk of client.stream([{ role: 'user', content: 'q' }])) {
        collected.push(chunk.content);
      }
      expect(collected).toEqual([]);
    });

    it('skips unparseable SSE frames without aborting the stream', async () => {
      const sse = [
        'data: not-json\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      fetchMock.mockResolvedValueOnce(sseResponse(sse));
      const client = new LLMClient();
      const collected: string[] = [];
      for await (const chunk of client.stream([{ role: 'user', content: 'q' }])) {
        collected.push(chunk.content);
      }
      expect(collected).toEqual(['ok']);
    });

    it('throws typed error when stream() gets a non-OK response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'nope' } }, 401)
      );
      const client = new LLMClient();
      let caught: unknown = null;
      try {
        // Drain the iterable to trigger the error
        for await (const _ of client.stream([{ role: 'user', content: 'q' }])) {
          void _;
        }
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(LLMAuthError);
    });
  });
});
