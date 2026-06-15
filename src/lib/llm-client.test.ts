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
  LLMAllCandidatesFailedError,
  type ModelCandidate,
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
    process.env.DASHSCOPE_CHAT_MODEL = 'qwen3.6-plus-2026-04-02';
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
      expect(body.model).toBe('qwen3.6-plus-2026-04-02');
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

  // ================================================================
  // 多 model 候选 fallback (opts.models)
  // ================================================================
  describe('multi-candidate fallback (opts.models)', () => {
    const candA: ModelCandidate = {
      model: 'qwen3.6-plus-2026-04-02',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-A',
    };
    const candB: ModelCandidate = {
      model: 'qwen3.6-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-A',
    };

    describe('invoke()', () => {
      it('uses the first candidate when it succeeds', async () => {
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ choices: [{ message: { content: 'first' } }] })
        );
        const client = new LLMClient();
        const r = await client.invoke([{ role: 'user', content: 'q' }], { models: [candA, candB] });
        expect(r.content).toBe('first');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
        expect(body.model).toBe('qwen3.6-plus-2026-04-02');
      });

      it('falls back to the next candidate on 5xx', async () => {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'oops' } }, 503))
          .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'second' } }] }));
        const client = new LLMClient();
        const r = await client.invoke([{ role: 'user', content: 'q' }], { models: [candA, candB] });
        expect(r.content).toBe('second');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string).model).toBe('qwen3.6-plus');
      });

      it('falls back on 404 (model not found)', async () => {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'no model' } }, 404))
          .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'fb' } }] }));
        const client = new LLMClient();
        const r = await client.invoke([{ role: 'user', content: 'q' }], { models: [candA, candB] });
        expect(r.content).toBe('fb');
      });

      it('falls back on 429 (rate limit)', async () => {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'rl' } }, 429))
          .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'rl-fb' } }] }));
        const client = new LLMClient();
        const r = await client.invoke([{ role: 'user', content: 'q' }], { models: [candA, candB] });
        expect(r.content).toBe('rl-fb');
      });

      it('throws LLMAllCandidatesFailedError when all candidates fail', async () => {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'fail-1' } }, 500))
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'fail-2' } }, 500));
        const client = new LLMClient();
        let caught: unknown = null;
        try {
          await client.invoke([{ role: 'user', content: 'q' }], { models: [candA, candB] });
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(LLMAllCandidatesFailedError);
        const err = caught as LLMAllCandidatesFailedError;
        expect(err.attempts).toHaveLength(2);
        expect(err.attempts[0].model).toBe('qwen3.6-plus-2026-04-02');
        expect(err.attempts[1].model).toBe('qwen3.6-plus');
      });

      it('throws LLMAuthError immediately on 401 (does NOT try next)', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'unauth' } }, 401));
        const client = new LLMClient();
        await expect(
          client.invoke([{ role: 'user', content: 'q' }], { models: [candA, candB] })
        ).rejects.toBeInstanceOf(LLMAuthError);
        expect(fetchMock).toHaveBeenCalledTimes(1); // 第二候选没尝试
      });

      it('each candidate uses its own baseUrl + apiKey (cross-provider fallback)', async () => {
        const glm: ModelCandidate = {
          model: 'GLM-4.7-Flash',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          apiKey: 'glm-key',
        };
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'dash down' } }, 500))
          .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'glm-ok' } }] }));
        const client = new LLMClient();
        const r = await client.invoke([{ role: 'user', content: 'q' }], { models: [candA, glm] });
        expect(r.content).toBe('glm-ok');
        const [, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
        const [, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
        const url1 = (fetchMock.mock.calls[0] as [string, RequestInit])[0];
        const url2 = (fetchMock.mock.calls[1] as [string, RequestInit])[0];
        expect(url1).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/v1/chat/completions');
        expect(url2).toBe('https://open.bigmodel.cn/api/paas/v4/v1/chat/completions');
        expect((init1.headers as Record<string, string>).Authorization).toBe('Bearer sk-A');
        expect((init2.headers as Record<string, string>).Authorization).toBe('Bearer glm-key');
        // suppress unused-var
        void init1; void init2;
      });
    });

    describe('stream()', () => {
      it('falls back to next candidate when first returns non-OK (no chunks yielded yet)', async () => {
        // First: 5xx response (no streaming body)
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'upstream' } }, 503))
          .mockResolvedValueOnce(sseResponse([
            'data: {"choices":[{"delta":{"content":"fb"}}]}\n\n',
            'data: [DONE]\n\n',
          ]));
        const client = new LLMClient();
        const collected: string[] = [];
        for await (const chunk of client.stream([{ role: 'user', content: 'q' }], { models: [candA, candB] })) {
          collected.push(chunk.content);
        }
        expect(collected).toEqual(['fb']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('throws immediately on 401 even for stream()', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'unauth' } }, 401));
        const client = new LLMClient();
        let caught: unknown = null;
        try {
          for await (const _ of client.stream([{ role: 'user', content: 'q' }], { models: [candA, candB] })) {
            void _;
          }
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(LLMAuthError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('does NOT silently switch models mid-stream (after first chunk, no second call)', async () => {
        // First candidate: yields one chunk, then stream ends cleanly (no error, just no more data).
        // Verify the second candidate is NOT called even though the stream completed.
        fetchMock.mockResolvedValueOnce(sseStreamResponse([
          'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
        ]));
        // No second mock queued — if second call happens, it will get undefined and fail.
        const client = new LLMClient();
        const collected: string[] = [];
        for await (const chunk of client.stream([{ role: 'user', content: 'q' }], { models: [candA, candB] })) {
          collected.push(chunk.content);
        }
        expect(collected).toEqual(['first']); // first chunk was yielded
        // Should NOT have called second candidate (first one succeeded → return)
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('throws LLMAllCandidatesFailedError when all candidates fail without yielding', async () => {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'fail-1' } }, 500))
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'fail-2' } }, 500));
        const client = new LLMClient();
        let caught: unknown = null;
        try {
          for await (const _ of client.stream([{ role: 'user', content: 'q' }], { models: [candA, candB] })) {
            void _;
          }
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(LLMAllCandidatesFailedError);
      });
    });
  });
});
