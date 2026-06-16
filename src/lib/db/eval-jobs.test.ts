// src/lib/db/eval-jobs.test.ts
// C8/I3 关键测试: 事务保护 + 保留 started_at
import { describe, it, expect, beforeEach } from 'vitest';
import { _resetDbForTest, getDb } from './connection';
import {
  enqueueEvalJob,
  dequeueEvalJob,
  completeEvalJob,
  failEvalJob,
  pendingJobCount,
} from './eval-jobs';

beforeEach(() => {
  _resetDbForTest();
  process.env.LOOP_ENGINEERING_DB = ':memory:';
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
});

describe('dequeueEvalJob (C8 + I10)', () => {
  it('marks job as running and sets started_at', () => {
    const id = enqueueEvalJob('req-1');
    const job = dequeueEvalJob();
    expect(job?.status).toBe('running');
    expect(job?.started_at).toBeGreaterThan(0);
    // DB 侧也要看到 status='running'
    const row = getDb().prepare('SELECT status, started_at FROM eval_jobs WHERE id=?').get(id) as any;
    expect(row.status).toBe('running');
    expect(row.started_at).toBeGreaterThan(0);
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

describe('failEvalJob (I3)', () => {
  it('preserves started_at (do not blank the original queue→start time)', () => {
    const id = enqueueEvalJob('req-1');
    const job = dequeueEvalJob()!;
    expect(job.started_at).toBeGreaterThan(0);
    failEvalJob(id, 'oops');
    const row = getDb().prepare('SELECT status, started_at, error FROM eval_jobs WHERE id=?').get(id) as any;
    expect(row.status).toBe('failed');
    expect(row.started_at).toBe(job.started_at); // 保留
    expect(row.error).toBe('oops');
  });

  it('truncates long error message to 1000 chars', () => {
    const id = enqueueEvalJob('req-1');
    failEvalJob(id, 'x'.repeat(2000));
    const row = getDb().prepare('SELECT error FROM eval_jobs WHERE id=?').get(id) as any;
    expect(row.error.length).toBe(1000);
  });
});

describe('completeEvalJob', () => {
  it('marks job as done with completed_at', () => {
    const id = enqueueEvalJob('req-1');
    dequeueEvalJob();
    completeEvalJob(id);
    const row = getDb().prepare('SELECT status, completed_at FROM eval_jobs WHERE id=?').get(id) as any;
    expect(row.status).toBe('done');
    expect(row.completed_at).toBeGreaterThan(0);
  });
});
