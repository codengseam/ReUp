// src/lib/llm-client.ts
// ReUp v2 Phase 1: OpenAI-compatible LLM client for DashScope (Qwen / GUI-Plus).
//
// Design contract (see docs/superpowers/specs/2026-06-14-reup-v2-design.md §5.1):
// - invoke(): POST {baseUrl}/v1/chat/completions (stream: false), return LLMResponse
// - stream(): POST same URL with stream: true, parse SSE `data: {...}` lines, yield LLMChunk
// - Error mapping: 401 -> LLMAuthError, 429 -> LLMRateLimitError, 5xx -> LLMUpstreamError
// - Timeout: 60s default, configurable per call via opts.timeoutMs
// - Config: read DASHSCOPE_* from process.env with documented defaults
//
// No `any`. Zod is used to validate external response shapes so upstream changes
// do not silently leak untyped data into the rest of the app.

import { z } from 'zod';

// ===== Public types =====

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface InvokeOptions {
  /** Override the model id (defaults to the client-level model or DASHSCOPE_CHAT_MODEL). */
  model?: string;
  /** Sampling temperature. Forwarded as-is to the provider. */
  temperature?: number;
  /** Per-call timeout in ms. Defaults to the client-level default (60_000). */
  timeoutMs?: number;
  /** External AbortSignal. Combined with the internal timeout signal. */
  signal?: AbortSignal;
}

export interface LLMResponse {
  /** The assistant message text. */
  content: string;
  /** Token usage, when the provider returns it. */
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  /** The model id echoed back by the provider, if present. */
  model?: string;
}

export interface LLMChunk {
  /** Incremental text delta for this SSE frame. Empty string is valid (no content). */
  content: string;
  /** True on the final chunk (after `[DONE]`); useful to know the stream ended. */
  done?: boolean;
}

export interface LLMClientConfig {
  /** Bearer token. Defaults to process.env.DASHSCOPE_API_KEY. */
  apiKey?: string;
  /** Base URL. Defaults to process.env.DASHSCOPE_BASE_URL. */
  baseUrl?: string;
  /** Default model id. Defaults to process.env.DASHSCOPE_CHAT_MODEL. */
  model?: string;
  /** Default per-call timeout in ms. Defaults to 60_000. */
  defaultTimeoutMs?: number;
}

// ===== Errors =====

export class LLMError extends Error {
  public readonly status?: number;
  public readonly body?: string;
  public readonly cause?: unknown;
  constructor(message: string, opts: { status?: number; body?: string; cause?: unknown } = {}) {
    super(message);
    this.name = 'LLMError';
    this.status = opts.status;
    this.body = opts.body;
    this.cause = opts.cause;
  }
}

export class LLMAuthError extends LLMError {
  constructor(message = 'LLM authentication failed (401)', body?: string) {
    super(message, { status: 401, body });
    this.name = 'LLMAuthError';
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(message = 'LLM rate limit exceeded (429)', body?: string) {
    super(message, { status: 429, body });
    this.name = 'LLMRateLimitError';
  }
}

export class LLMUpstreamError extends LLMError {
  constructor(status: number, body?: string) {
    super(`LLM upstream service error (${status})`, { status, body });
    this.name = 'LLMUpstreamError';
  }
}

export class LLMTimeoutError extends LLMError {
  constructor(message = 'LLM request timed out') {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

// ===== Zod schemas for external responses =====

const MessageSchema = z.object({
  role: z.string().optional(),
  content: z.string().optional(),
});

const ChoiceSchema = z.object({
  index: z.number().optional(),
  message: MessageSchema.optional(),
  delta: MessageSchema.optional(),
  finish_reason: z.string().nullable().optional(),
});

const UsageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  })
  .optional();

const InvokeResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(ChoiceSchema).min(1),
  usage: UsageSchema,
});

const StreamFrameSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(ChoiceSchema),
});

// ===== Defaults (kept as constants for testability + JSDoc) =====
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_CHAT_MODEL = 'gui-plus-2026-02-26';
const DEFAULT_TIMEOUT_MS = 60_000;

/** Strip a trailing `/v1` or `/v1/` from the base URL. */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolveConfig(config: LLMClientConfig = {}): Required<LLMClientConfig> {
  const apiKey = config.apiKey ?? process.env.DASHSCOPE_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new Error('DASHSCOPE_API_KEY is required (set env or pass `apiKey` to LLMClient)');
  }
  const baseUrl = normalizeBaseUrl(
    config.baseUrl ?? process.env.DASHSCOPE_BASE_URL ?? DEFAULT_BASE_URL
  );
  const model = config.model ?? process.env.DASHSCOPE_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
  const defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  return { apiKey, baseUrl, model, defaultTimeoutMs };
}

function endpointUrl(baseUrl: string): string {
  return `${baseUrl}/v1/chat/completions`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function raiseForStatus(res: Response, body: string): Promise<void> {
  if (res.ok) return;
  if (res.status === 401) throw new LLMAuthError('LLM authentication failed (401)', body);
  if (res.status === 429) throw new LLMRateLimitError('LLM rate limit exceeded (429)', body);
  if (res.status >= 500) throw new LLMUpstreamError(res.status, body);
  // Other non-OK status codes still surface as upstream errors so the caller can decide.
  throw new LLMUpstreamError(res.status, body);
}

interface AbortControllerHandle {
  signal: AbortSignal;
  cancel: () => void;
  timedOut: boolean;
}

function buildAbortSignal(opts: InvokeOptions | undefined, defaultTimeoutMs: number): AbortControllerHandle {
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? defaultTimeoutMs;
  const handle: AbortControllerHandle = {
    signal: controller.signal,
    cancel: () => {
      // no-op; placeholder, replaced below after we know the timer id
    },
    timedOut: false,
  };
  const timer = setTimeout(() => {
    handle.timedOut = true;
    controller.abort();
  }, timeoutMs);
  handle.cancel = () => clearTimeout(timer);
  // If the caller passed their own signal, fan-in to our controller.
  if (opts?.signal) {
    if (opts.signal.aborted) {
      controller.abort();
    } else {
      opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  return handle;
}

// ===== Client =====

export class LLMClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly defaultTimeoutMs: number;

  constructor(config: LLMClientConfig = {}) {
    const resolved = resolveConfig(config);
    this.apiKey = resolved.apiKey;
    this.baseUrl = resolved.baseUrl;
    this.model = resolved.model;
    this.defaultTimeoutMs = resolved.defaultTimeoutMs;
  }

  /** Resolved config (useful for tests + debugging). */
  public get config(): Readonly<Required<LLMClientConfig>> {
    return {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.model,
      defaultTimeoutMs: this.defaultTimeoutMs,
    };
  }

  /**
   * Non-streaming chat completion. Returns the assistant text and any usage info.
   * Throws LLMAuthError / LLMRateLimitError / LLMUpstreamError / LLMTimeoutError on failure.
   */
  async invoke(messages: Message[], opts?: InvokeOptions): Promise<LLMResponse> {
    const body = {
      model: opts?.model ?? this.model,
      messages,
      stream: false,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    };

    const aborter = buildAbortSignal(opts, this.defaultTimeoutMs);
    let res: Response;
    try {
      res = await fetch(endpointUrl(this.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: aborter.signal,
      });
    } catch (err) {
      if (this.wasTimedOut(aborter, err)) {
        throw new LLMTimeoutError();
      }
      throw new LLMError(
        `LLM network error: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    } finally {
      aborter.cancel();
    }

    const text = await safeReadText(res);
    await raiseForStatus(res, text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new LLMError('LLM returned non-JSON response', {
        status: res.status,
        body: text,
        cause: err,
      });
    }

    const validated = InvokeResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new LLMError('LLM response did not match expected schema', {
        status: res.status,
        body: text,
      });
    }
    const data = validated.data;
    const firstChoice = data.choices[0];
    const content = firstChoice?.message?.content ?? '';

    return {
      content,
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * Streaming chat completion. Yields LLMChunk for every `data: {...}` SSE frame
   * that contains a non-empty `delta.content`. The `data: [DONE]` sentinel is
   * consumed and does NOT produce a chunk.
   *
   * Throws LLMAuthError / LLMRateLimitError / LLMUpstreamError / LLMTimeoutError
   * if the initial HTTP response is not OK or the stream errors out.
   */
  async *stream(messages: Message[], opts?: InvokeOptions): AsyncIterable<LLMChunk> {
    const body = {
      model: opts?.model ?? this.model,
      messages,
      stream: true,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    };

    const aborter = buildAbortSignal(opts, this.defaultTimeoutMs);
    let res: Response;
    try {
      res = await fetch(endpointUrl(this.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: aborter.signal,
      });
    } catch (err) {
      if (this.wasTimedOut(aborter, err)) {
        throw new LLMTimeoutError();
      }
      throw new LLMError(
        `LLM network error: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    } finally {
      // Don't cancel yet: we still need the response body below.
    }

    // Only consume the body via .text() on error responses, otherwise the
    // stream becomes locked and the reader below will throw.
    if (!res.ok) {
      aborter.cancel();
      const text = await safeReadText(res);
      await raiseForStatus(res, text);
      // raiseForStatus throws; this line is unreachable but keeps the type checker happy.
      throw new LLMError('unreachable', { status: res.status, body: text });
    }

    if (!res.body) {
      aborter.cancel();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line.length === 0 || !line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data.length === 0) continue;
          if (data === '[DONE]') {
            // Sentinel: consume silently, do NOT yield a chunk.
            continue;
          }
          let frame: unknown;
          try {
            frame = JSON.parse(data);
          } catch {
            // Skip unparseable frames rather than aborting the whole stream.
            continue;
          }
          const validated = StreamFrameSchema.safeParse(frame);
          if (!validated.success) continue;
          const delta = validated.data.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield { content: delta };
          }
        }
      }
    } finally {
      aborter.cancel();
      try {
        reader.releaseLock();
      } catch {
        // Ignore: reader may already be released by the runtime.
      }
    }
  }

  private wasTimedOut(aborter: AbortControllerHandle, err: unknown): boolean {
    if (aborter.timedOut) return true;
    if (err instanceof Error && err.name === 'AbortError') {
      return aborter.signal.aborted;
    }
    return false;
  }
}
