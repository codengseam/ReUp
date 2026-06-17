// src/lib/db/feedback.ts
// M2: 用户反馈表操作 (SQLite 版, 替代 feedback-store.ts JSON 文件)
// 关键修复 (Loop Engineering Round 2):
// - I-6: feedback 改用 SQLite, 避免 feedback-store 内存缓存 + 异步 flush 竞态
// - C-3: thumbs_down 反馈触发评估 (高优先级入队, 强制 LLM 评估这次回答)

import { getDb } from './connection';
import { enqueueEvalJob } from './eval-jobs';

export type FeedbackReason =
  | 'thumbs_up'
  | 'thumbs_down'
  | 'too_vague'
  | 'wrong'
  | 'unhelpful'
  | 'other';

export interface FeedbackRecord {
  id: string;
  request_id: string | null;
  message_id: string | null;
  reason: FeedbackReason;
  comment: string | null;
  created_at: number;
}

const VALID_REASONS: ReadonlySet<FeedbackReason> = new Set([
  'thumbs_up', 'thumbs_down', 'too_vague', 'wrong', 'unhelpful', 'other',
]);

// 校验 reason 防止 SQL 注入或脏数据
export function isValidReason(s: string): s is FeedbackReason {
  return VALID_REASONS.has(s as FeedbackReason);
}

// 写入反馈; 若 reason === 'thumbs_down' 且 request_id 存在, 触发高优先级评估
export function recordFeedback(input: {
  id: string;
  request_id: string | null;
  message_id: string | null;
  reason: FeedbackReason;
  comment?: string | null;
}): FeedbackRecord {
  const db = getDb();
  const rec: FeedbackRecord = {
    id: input.id,
    request_id: input.request_id,
    message_id: input.message_id,
    reason: input.reason,
    comment: input.comment ?? null,
    created_at: Math.floor(Date.now() / 1000),
  };
  db.prepare(
    `INSERT OR REPLACE INTO feedback (id, request_id, message_id, reason, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(rec.id, rec.request_id, rec.message_id, rec.reason, rec.comment, rec.created_at);

  // C-3 修复: 差评入队 (priority=1, 仅高优先级)
  if (rec.reason === 'thumbs_down' && rec.request_id) {
    try {
      enqueueEvalJob(rec.request_id, 1);
    } catch (e) {
      console.warn('[Feedback] thumbs_down enqueue failed:', e);
    }
  }

  return rec;
}

export function getFeedbackByRequestId(requestId: string): FeedbackRecord[] {
  return getDb().prepare(
    `SELECT * FROM feedback WHERE request_id = ? ORDER BY created_at DESC`,
  ).all(requestId) as FeedbackRecord[];
}

export function getFeedbackStats(sinceDays = 30): {
  total: number;
  thumbs_up: number;
  thumbs_down: number;
  thumbs_down_rate: number;
  by_reason: Record<string, number>;
} {
  const db = getDb();
  const sinceTs = Math.floor(Date.now() / 1000) - sinceDays * 86400;
  const rows = db.prepare(
    `SELECT reason, COUNT(*) AS c FROM feedback WHERE created_at >= ? GROUP BY reason`,
  ).all(sinceTs) as Array<{ reason: string; c: number }>;
  const by_reason: Record<string, number> = {};
  let total = 0, up = 0, down = 0;
  for (const r of rows) {
    by_reason[r.reason] = r.c;
    total += r.c;
    if (r.reason === 'thumbs_up') up = r.c;
    if (r.reason === 'thumbs_down') down = r.c;
  }
  return {
    total,
    thumbs_up: up,
    thumbs_down: down,
    thumbs_down_rate: total > 0 ? down / total : 0,
    by_reason,
  };
}
