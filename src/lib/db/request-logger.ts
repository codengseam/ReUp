// src/lib/db/request-logger.ts
// M1: request_logs 写入 + 查询
// insertRequestLog 在 chat 流式响应完成后调用 (controller.close() 之前)

import { getDb } from './connection';

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
  ).run(input);
}

export function getRequestLog(requestId: string) {
  return getDb().prepare('SELECT * FROM request_logs WHERE request_id = ?').get(requestId);
}
