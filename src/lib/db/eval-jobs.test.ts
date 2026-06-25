// src/lib/db/eval-jobs.test.ts
// 关键测试: 事务保护 + 重试 + 启动恢复 + 防重复入队
import { describe, it, expect, beforeEach } from 'vitest';
import { _resetDbForTest, getDb } from './connection';
import {
  enqueueEvalJob,
  dequeueEvalJob,
  completeEvalJob,
  failEvalJob,
  pendingJobCount,
  resetStuckJobs,
  jobCountsByStatus,
} from './eval-jobs';

beforeEach(() => {
  // 顺序: 先设 env, 再 reset, 让 reset 时 getDb 拿到 :memory:
  process.env.LOOP_ENGINEERING_DB = ':memory:';
  _resetDbForTest();
});

describe('enqueueEvalJob', () => {
  it('returns a new job id', () => {
    const id = enqueueEvalJob('req-1');
    expect(id).toBeGreaterThan(0);
    expect(pendingJobCount()).toBe(1);
  });

  it('respects priority (higher = dequeued first)', () => {
    enqueueEvalJob('low', 0);
    enqueueEvalJob('high', 10);
    const job = dequeueEvalJob();
    expect(job?.request_id).toBe('high');
  });

  it('returns 1 for a new job, 0 if idempotent (C-2 修复)', () => {
    const a = enqueueEvalJob('req-1');
    const b = enqueueEvalJob('req-1');
    expect(a).toBe(1);
    expect(b).toBe(0); // ON CONFLICT DO NOTHING
    expect(pendingJobCount()).toBe(1);
  });

  it('returns -1 when queue is full (backpressure C-7)', () => {
    for (let i = 0; i < 2000; i++) {
      getDb().prepare('INSERT INTO eval_jobs (request_id) VALUES (?)').run(`bulk-${i}`);
    }
    const id = enqueueEvalJob('overflow');
    expect(id).toBe(-1);
  });
});

describe('dequeueEvalJob (C8 + I10)', () => {
  it('marks job as running and sets started_at + attempts=1', () => {
    const id = enqueueEvalJob('req-1');
    const job = dequeueEvalJob();
    expect(job?.status).toBe('running');
    expect(job?.started_at).toBeGreaterThan(0);
    expect(job?.attempts).toBe(1);
    const row = getDb().prepare('SELECT status, started_at, attempts FROM eval_jobs WHERE id=?').get(id) as { status: string; started_at: number; attempts: number };
    expect(row.status).toBe('running');
    expect(row.started_at).toBeGreaterThan(0);
    expect(row.attempts).toBe(1);
  });

  it('returns null when no pending jobs', () => {
    expect(dequeueEvalJob()).toBeNull();
  });

  it('does not return same job twice', () => {
    enqueueEvalJob('req-1');
    enqueueEvalJob('req-2');
    const a = dequeueEvalJob();
    const b = dequeueEvalJob();
    expect(a?.request_id).not.toBe(b?.request_id);
    expect(dequeueEvalJob()).toBeNull();
  });
});

describe('failEvalJob (C1 重试逻辑)', () => {
  it('attempts < max_attempts → 重置为 pending (C-1 修复)', () => {
    const id = enqueueEvalJob('req-1');
    dequeueEvalJob(); // attempts=1
    failEvalJob(id, 'oops');
    const row = getDb().prepare('SELECT status, attempts, error FROM eval_jobs WHERE id=?').get(id) as { status: string; attempts: number; error: string };
    expect(row.status).toBe('pending');
    expect(row.error).toBe('oops');
  });

  it('attempts >= max_attempts → failed (终态)', () => {
    const id = enqueueEvalJob('req-1');
    // 模拟 3 次失败 (default max_attempts=3)
    dequeueEvalJob(); // attempts=1
    failEvalJob(id, 'first');
    dequeueEvalJob(); // attempts=2
    failEvalJob(id, 'second');
    dequeueEvalJob(); // attempts=3
    failEvalJob(id, 'third');
    const row = getDb().prepare('SELECT status, attempts FROM eval_jobs WHERE id=?').get(id) as { status: string; attempts: number };
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(3);
  });

  it('truncates long error message to 1000 chars', () => {
    const id = enqueueEvalJob('req-1');
    failEvalJob(id, 'x'.repeat(2000));
    const row = getDb().prepare('SELECT error FROM eval_jobs WHERE id=?').get(id) as { error: string };
    expect(row.error.length).toBe(1000);
  });
});

describe('completeEvalJob', () => {
  it('marks job as done with completed_at', () => {
    const id = enqueueEvalJob('req-1');
    dequeueEvalJob();
    completeEvalJob(id);
    const row = getDb().prepare('SELECT status, completed_at FROM eval_jobs WHERE id=?').get(id) as { status: string; completed_at: number };
    expect(row.status).toBe('done');
    expect(row.completed_at).toBeGreaterThan(0);
  });
});

describe('resetStuckJobs (C-2 崩溃恢复)', () => {
  it('回收 stale running 任务', () => {
    const id = enqueueEvalJob('req-stuck');
    dequeueEvalJob(); // status='running', started_at=now
    // 把 last_attempt_at 改到 1 小时前
    const longAgo = Math.floor(Date.now() / 1000) - 3600;
    getDb().prepare('UPDATE eval_jobs SET last_attempt_at = ? WHERE id = ?').run(longAgo, id);
    const reaped = resetStuckJobs(300);
    expect(reaped).toBe(1);
    const row = getDb().prepare('SELECT status FROM eval_jobs WHERE id=?').get(id) as { status: string };
    expect(row.status).toBe('pending');
  });

  it('不动 recent running 任务', () => {
    const id = enqueueEvalJob('req-fresh');
    dequeueEvalJob(); // last_attempt_at=now
    const reaped = resetStuckJobs(300);
    expect(reaped).toBe(0);
    const row = getDb().prepare('SELECT status FROM eval_jobs WHERE id=?').get(id) as { status: string };
    expect(row.status).toBe('running');
  });
});

describe('jobCountsByStatus', () => {
  it('按 status 计数', () => {
    enqueueEvalJob('a');
    enqueueEvalJob('b');
    dequeueEvalJob(); // a
    completeEvalJob(1);
    const counts = jobCountsByStatus();
    expect(counts.done).toBe(1);
    expect(counts.pending).toBe(1);
  });
});
