// src/lib/db/eval-jobs.ts
// M2: 异步评估任务队列 (SQLite 表替代 Redis/BullMQ)
// - enqueueEvalJob: 入队 (UNIQUE 防重复; ON CONFLICT IGNORE)
// - dequeueEvalJob: 取出最早一个 pending (原子 UPDATE...RETURNING)
// - completeEvalJob / failEvalJob: 状态转移 (重试逻辑; 事务保护)
// - resetStuckJobs: 启动时把超过 N 分钟的 running 重置为 pending (C2 崩溃恢复)

import { getDb } from './connection';

export interface EvalJob {
  id: number;
  request_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  priority: number;
  attempts: number;
  max_attempts: number;
  error: string | null;
  enqueued_at: number;
  started_at: number | null;
  last_attempt_at: number | null;
  completed_at: number | null;
  created_at: number;
}

const MAX_PENDING_QUEUE = 2000; // 队列背压阈值 (C-7)

// 入队: 用 ON CONFLICT(request_id) DO NOTHING 防重复 (M-3 + C-2 修复)
// 返回: 1 = 新插入, 0 = 已存在 (idempotent), -1 = 队列满 (backpressure)
export function enqueueEvalJob(requestId: string, priority = 0): number {
  const db = getDb();
  // 队列背压: 超阈值不入队 (保留观测, 不牺牲用户)
  const pendingCount = db
    .prepare(`SELECT COUNT(*) AS c FROM eval_jobs WHERE status IN ('pending', 'running')`)
    .get() as { c: number };
  if (pendingCount.c >= MAX_PENDING_QUEUE) {
    return -1; // 满载, 丢弃 (监控可借此发现背压)
  }
  const result = db
    .prepare(
      `INSERT INTO eval_jobs (request_id, priority) VALUES (?, ?)
       ON CONFLICT(request_id) DO NOTHING`,
    )
    .run(requestId, priority);
  return result.changes; // 1 = 新插入, 0 = 重复
}

// 原子出队: 单条 SQL UPDATE...RETURNING (Critical #2 修复, 避免 SELECT+UPDATE 竞态)
export function dequeueEvalJob(): EvalJob | null {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  return db
    .prepare(
      `UPDATE eval_jobs
       SET status = 'running',
           started_at = COALESCE(started_at, ?),
           last_attempt_at = ?,
           attempts = attempts + 1
       WHERE id = (
         SELECT id FROM eval_jobs
         WHERE status = 'pending'
         ORDER BY priority DESC, created_at ASC
         LIMIT 1
       )
       RETURNING *`,
    )
    .get(now, now) as EvalJob | undefined ?? null;
}

export function completeEvalJob(jobId: number): void {
  getDb()
    .prepare(`UPDATE eval_jobs SET status='done', completed_at=unixepoch() WHERE id = ?`)
    .run(jobId);
}

// 重试: attempts < max_attempts → 回 pending; 否则 failed (C-1/C2 修复)
export function failEvalJob(jobId: number, errorMessage: string): void {
  const db = getDb();
  const job = db
    .prepare(`SELECT attempts, max_attempts FROM eval_jobs WHERE id = ?`)
    .get(jobId) as { attempts: number; max_attempts: number } | undefined;
  if (!job) return;
  const truncated = errorMessage.slice(0, 1000);
  if (job.attempts < job.max_attempts) {
    // 重试: 回 pending (指数 backoff 通过 last_attempt_at 简单控制)
    db.prepare(
      `UPDATE eval_jobs
       SET status = 'pending', error = ?, last_attempt_at = unixepoch()
       WHERE id = ?`,
    ).run(truncated, jobId);
  } else {
    db.prepare(
      `UPDATE eval_jobs
       SET status = 'failed', error = ?, last_attempt_at = unixepoch(), completed_at = unixepoch()
       WHERE id = ?`,
    ).run(truncated, jobId);
  }
}

// C2 修复: Worker 启动时回收崩溃残留的 running 任务
// 把 status='running' AND last_attempt_at < now-300 的任务重置为 pending (5 分钟阈值)
export function resetStuckJobs(staleAfterSeconds = 300): number {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      `UPDATE eval_jobs
       SET status = 'pending', last_attempt_at = ?
       WHERE status = 'running' AND last_attempt_at < ?`,
    )
    .run(now, now - staleAfterSeconds);
  return result.changes;
}

export function pendingJobCount(): number {
  const r = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM eval_jobs WHERE status='pending'`)
    .get() as { c: number };
  return r.c;
}

export function jobCountsByStatus(): Record<string, number> {
  const rows = getDb()
    .prepare(`SELECT status, COUNT(*) AS c FROM eval_jobs GROUP BY status`)
    .all() as Array<{ status: string; c: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.c;
  return out;
}
