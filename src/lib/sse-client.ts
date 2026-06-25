// src/lib/sse-client.ts
// SSE 解析 + 指数退避重连。纯 fetch/ReadableStream，不引第三方。

export interface SSEOptions {
  url: string;
  method?: 'POST' | 'GET';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onEvent: (event: Record<string, unknown>) => void;
  onError?: (err: Error) => void;
  onDone?: () => void;
  maxRetries?: number;
}

export async function consumeSSE(opts: SSEOptions): Promise<void> {
  const maxRetries = opts.maxRetries ?? 3;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    if (opts.signal?.aborted) return;
    try {
      const res = await fetch(opts.url, {
        method: opts.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneSeen = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') { doneSeen = true; continue; }
          try { opts.onEvent(JSON.parse(data)); } catch { /* skip */ }
        }
      }
      if (doneSeen) { opts.onDone?.(); return; }
      throw new Error('stream ended without [DONE]');
    } catch (err) {
      if (opts.signal?.aborted) return;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxRetries) break;
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  opts.onError?.(lastError ?? new Error('SSE failed'));
}
