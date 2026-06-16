// src/lib/db/eval-jobs.ts
// M2: 异步评估任务队列 (SQLite 表替代 Redis/BullMQ)
// - enqueueEvalJob: 入队 (I8 抽样后调用)
// - dequeueEvalJob: 取出最早一个 pending (I10 走复合索引)
// - completeEvalJob / failEvalJob: 状态转移 (C8 事务保护, I3 保留 started_at)

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

export function enqueueEvalJob(requestId: string, priority = 0): number {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO eval_jobs (request_id, priority) VALUES (?, ?)`,
  );
  const result = stmt.run(requestId, priority);
  return Number(result.lastInsertRowid);
}

export function dequeueEvalJob(): EvalJob | null {
  // C8: 用事务包住 (SELECT 锁 + UPDATE 状态), 防止 worker 并发重复消费
  const db = getDb();
  return db.transaction(() => {
    const job = db
      .prepare(
        `SELECT * FROM eval_jobs
         WHERE status = 'pending'
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`,
      )
      .get() as EvalJob | undefined;
    if (!job) return null;
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `UPDATE eval_jobs
       SET status = 'running', started_at = COALESCE(started_at, ?), last_attempt_at = ?
       WHERE id = ?`,
    ).run(now, now, job.id);
    return { ...job, status: 'running' as const, started_at: job.started_at ?? now, last_attempt_at: now };
  })();
}

export function completeEvalJob(jobId: number): void {
  getDb()
    .prepare(`UPDATE eval_jobs SET status='done', completed_at=unixepoch() WHERE id = ?`)
    .run(jobId);
}

export function failEvalJob(jobId: number, errorMessage: string): void {
  // I3: 保留 started_at (不要清空, 用于排查排队耗时)
  getDb()
    .prepare(
      `UPDATE eval_jobs SET status='failed', error=?, last_attempt_at=unixepoch() WHERE id=?`,
    )
    .run(errorMessage.slice(0, 1000), jobId);
}

export function pendingJobCount(): number {
  const r = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM eval_jobs WHERE status='pending'`)
    .get() as { c: number };
  return r.c;
}
