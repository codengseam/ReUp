// src/lib/db/request-logger.ts
// M1: request_logs 写入 + 查询
// insertRequestLog 在 chat 流式响应完成后调用 (controller.close() 之前)
// C-7 修复: query/answer/context_text 入库前截断到 16KB (DoS 防御)

import { getDb } from './connection';

const MAX_TEXT_LENGTH = 16384; // 16KB, 防 DoS (C-7 修复)
const MAX_CONTEXT_LENGTH = 65536; // 64KB, context 包含 RAG chunks

function truncate(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  if (s.length <= max) return s;
  return s.slice(0, max);
}

export interface RequestLogInput {
  request_id: string;
  user_id?: string | null;
  session_id?: string | null;
  query: string;
  rewritten_query?: string | null;
  answer?: string | null;
  strategy?: string | null;
  model_id?: string | null;
  prompt_version?: string | null;
  experiment_id?: string | null;
  variant?: string | null;
  doc_ids?: string | null;
  // I4: 真实进 LLM 的 context 文本
  context_text?: string | null;
  top_score?: number | null;
  result_count?: number;
  has_recall?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  latency_ms?: number;
  error?: string | null;
}

export function insertRequestLog(input: RequestLogInput): void {
  const db = getDb();
  // C-7: 强制 size 限制 (防 DoS 撑爆 SQLite)
  const safe = {
    ...input,
    query: truncate(input.query, MAX_TEXT_LENGTH) ?? '',
    answer: truncate(input.answer, MAX_TEXT_LENGTH),
    context_text: truncate(input.context_text, MAX_CONTEXT_LENGTH),
    error: truncate(input.error, 1000),
  };
  db.prepare(
    `INSERT OR REPLACE INTO request_logs (
      request_id, user_id, session_id, query, rewritten_query, answer,
      strategy, model_id, prompt_version, experiment_id, variant,
      doc_ids, context_text, top_score, result_count, has_recall,
      prompt_tokens, completion_tokens, total_tokens, cost, latency_ms, error
    ) VALUES (
      @request_id, @user_id, @session_id, @query, @rewritten_query, @answer,
      @strategy, @model_id, @prompt_version, @experiment_id, @variant,
      @doc_ids, @context_text, @top_score, @result_count, @has_recall,
      @prompt_tokens, @completion_tokens, @total_tokens, @cost, @latency_ms, @error
    )`
  ).run(safe);
}

export function getRequestLog(requestId: string) {
  return getDb().prepare('SELECT * FROM request_logs WHERE request_id = ?').get(requestId);
}
