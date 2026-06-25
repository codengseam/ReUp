// src/lib/observability/langfuse.ts
// I1: 没有配置 LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY 时不构造客户端 (no-op)
// 防止默认 baseUrl 上无谓发请求

import type { Langfuse } from 'langfuse';

let _langfuse: Langfuse | null = null;
let _initialized = false;

export function getLangfuse(): Langfuse | null {
  if (_initialized) return _langfuse;
  _initialized = true;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;

  if (!publicKey || !secretKey) {
    console.warn('[Langfuse] keys missing, observability disabled (no-op)');
    _langfuse = null;
    return null;
  }

  // 延迟加载 langfuse，未配置 keys 时不引入运行时依赖
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LangfuseCtor = require('langfuse').Langfuse as new (options: Record<string, unknown>) => Langfuse;
  _langfuse = new LangfuseCtor({
    publicKey,
    secretKey,
    baseUrl: baseUrl || 'http://localhost:3001',
    flushAt: 1,
    flushInterval: 5000,
  });
  return _langfuse;
}

export interface TraceContext {
  traceId: string;
  trace: ReturnType<Langfuse['trace']> | null;
}

export function startTrace(name: string, userId?: string, sessionId?: string): TraceContext {
  const langfuse = getLangfuse();
  if (!langfuse) return { traceId: '', trace: null };
  const trace = langfuse.trace({ name, userId, sessionId });
  return { traceId: trace.id, trace };
}

export function recordGeneration(
  trace: ReturnType<Langfuse['trace']> | null,
  name: string,
  model: string,
  input: string,
  output: string,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  metadata?: Record<string, unknown>,
) {
  if (!trace) return;
  trace.generation({ name, model, input, output, usage, metadata });
}

export function recordSpan(
  trace: ReturnType<Langfuse['trace']> | null,
  name: string,
  input?: Record<string, unknown>,
  output?: Record<string, unknown>,
) {
  if (!trace) return null;
  return trace.span({ name, input, output });
}
