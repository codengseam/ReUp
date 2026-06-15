// src/lib/llm-client.ts
// ReUp v2 Phase 1 + Phase 4: OpenAI-compatible LLM client.
//
// 设计要点：
// - invoke() / stream() 支持单 model 或多 model 候选（自动 fallback）
// - 候选链：opts.models (Array<ModelCandidate>)，缺省时退化为单 model 模式
// - Fallback 规则：401/403 (认证) 中止整个链；其他错误（404/429/5xx）继续下一个候选
// - 全部失败抛 LLMAllCandidatesFailedError，包含每个候选的最后错误
// - Config: 读 env-var 作为缺省；显式传入覆盖

import { z } from 'zod';

// ===== Public types =====

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface ModelCandidate {
  /** 实际发送给 provider 的 model 名称 */
  model: string;
  /** provider 完整 base URL（含 /v1） */
  baseUrl: string;
  /** provider 完整 API Key */
  apiKey: string;
}

export interface InvokeOptions {
  /** 单 model 模式：指定 model id（baseUrl/apiKey 用构造器配置） */
  model?: string;
  /** 多 model 候选模式：按顺序尝试，失败自动 fallback */
  models?: ModelCandidate[];
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

/** 所有候选都失败的聚合错误 */
export class LLMAllCandidatesFailedError extends LLMError {
  public readonly attempts: Array<{ model: string; error: Error }>;
  constructor(attempts: Array<{ model: string; error: Error }>) {
    const summary = attempts
      .map(a => `${a.model}: ${a.error.message}`)
      .join('; ');
    super(`All LLM candidates failed (${attempts.length}): ${summary}`);
    this.name = 'LLMAllCandidatesFailedError';
    this.attempts = attempts;
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
const DEFAULT_CHAT_MODEL = 'qwen3.6-plus-2026-04-02';
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
  const trimmed = baseUrl.replace(/\/+$/, '');
  // baseUrl 通常形如 `https://.../compatible-mode/v1`，已含 /v1；此时仅追加 /chat/completions
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
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
   * Normalize InvokeOptions → ModelCandidate[] 列表。
   * - opts.models 直接返回
   * - 否则用 [opts.model ?? this.model, this.baseUrl, this.apiKey] 包装成单元素
   */
  private resolveCandidates(opts?: InvokeOptions): ModelCandidate[] {
    if (opts?.models && opts.models.length > 0) return opts.models;
    return [{ model: opts?.model ?? this.model, baseUrl: this.baseUrl, apiKey: this.apiKey }];
  }

  /**
   * Non-streaming chat completion. Returns the assistant text and any usage info.
   * Throws LLMAllCandidatesFailedError when all candidates fail; LLMAuthError aborts the chain.
   * Single-candidate mode preserves the original error type (backward compat).
   */
  async invoke(messages: Message[], opts?: InvokeOptions): Promise<LLMResponse> {
    const candidates = this.resolveCandidates(opts);
    if (candidates.length === 1) {
      // Single-candidate: throw underlying error directly (backward compat with single-model tests)
      return this.invokeOnce(messages, candidates[0]!, opts);
    }
    // Multi-candidate: try each, wrap failures in LLMAllCandidatesFailedError
    const attempts: Array<{ model: string; error: Error }> = [];
    for (const c of candidates) {
      try {
        return await this.invokeOnce(messages, c, opts);
      } catch (err) {
        const e = err instanceof Error ? err : new LLMError(String(err));
        attempts.push({ model: c.model, error: e });
        // 401/403 认证失败：所有候选都会失败，立即抛出
        if (e instanceof LLMAuthError) throw e;
        // 其他错误（404/429/5xx/timeout）继续下一个候选
      }
    }
    throw new LLMAllCandidatesFailedError(attempts);
  }

  /** 单候选的非流式调用（内部方法） */
  private async invokeOnce(
    messages: Message[],
    candidate: ModelCandidate,
    opts?: InvokeOptions
  ): Promise<LLMResponse> {
    const body = {
      model: candidate.model,
      messages,
      stream: false,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    };

    const aborter = buildAbortSignal(opts, this.defaultTimeoutMs);
    let res: Response;
    try {
      res = await fetch(endpointUrl(candidate.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidate.apiKey}`,
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
   * 多候选 fallback 行为：
   * - 候选 N 启动失败（401/403/5xx/timeout/非 OK）：立即尝试候选 N+1
   * - 候选 N 已 yield 至少一个 chunk 后出错：不再 fallback（让调用方看到错误）
   * - 401 整个链中止
   *
   * Single-candidate mode preserves the original error type (backward compat).
   * Multi-candidate: throws LLMAllCandidatesFailedError when no candidate produced any chunk.
   */
  async *stream(messages: Message[], opts?: InvokeOptions): AsyncIterable<LLMChunk> {
    const candidates = this.resolveCandidates(opts);
    if (candidates.length === 1) {
      // Single-candidate: yield directly (errors propagate naturally)
      yield* this.streamOnce(messages, candidates[0]!, opts);
      return;
    }
    // Multi-candidate fallback
    const attempts: Array<{ model: string; error: Error }> = [];
    for (const c of candidates) {
      let yielded = false;
      try {
        for await (const chunk of this.streamOnce(messages, c, opts)) {
          yielded = true;
          yield chunk;
        }
        return; // 第一个成功候选 → 结束链
      } catch (err) {
        const e = err instanceof Error ? err : new LLMError(String(err));
        attempts.push({ model: c.model, error: e });
        if (e instanceof LLMAuthError) throw e;
        if (yielded) throw e; // 已 yield 任何 chunk：无法透明切换
        // 未 yield：继续下一个候选
      }
    }
    throw new LLMAllCandidatesFailedError(attempts);
  }

  /** 单候选的流式调用（内部方法） */
  private async *streamOnce(
    messages: Message[],
    candidate: ModelCandidate,
    opts?: InvokeOptions
  ): AsyncIterable<LLMChunk> {
    const body = {
      model: candidate.model,
      messages,
      stream: true,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    };

    const aborter = buildAbortSignal(opts, this.defaultTimeoutMs);
    let res: Response;
    try {
      res = await fetch(endpointUrl(candidate.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidate.apiKey}`,
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
