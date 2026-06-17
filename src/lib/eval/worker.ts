// src/lib/eval/worker.ts
// M2: 评估 Worker - 轮询 eval_jobs 队列表, 跑 RAGAS + 幻觉检测, 写 eval_results

import { getDb } from '@/lib/db/connection';
import {
  dequeueEvalJob,
  completeEvalJob,
  failEvalJob,
} from '@/lib/db/eval-jobs';
import {
  evaluateFaithfulness,
  evaluateAnswerRelevancy,
  evaluateContextRelevancy,
} from './ragas';
import { detectHallucination } from './hallucination-detector';

const POLL_INTERVAL_MS = 5000;
const MAX_CONCURRENT = 2;
const FAILURE_BACKOFF_MS = 30_000;

interface WorkerStats {
  processed: number;
  succeeded: number;
  failed: number;
  startedAt: number;
}

const stats: WorkerStats = {
  processed: 0,
  succeeded: 0,
  failed: 0,
  startedAt: 0,
};

let running = false;
let activeJobs = 0;
let loopPromise: Promise<void> | null = null;

export function getWorkerStats(): Readonly<WorkerStats> {
  return { ...stats };
}

export async function startWorker(): Promise<void> {
  if (running) return;
  running = true;
  stats.startedAt = Date.now();
  console.log(`[EvalWorker] Started, polling every ${POLL_INTERVAL_MS}ms, max_concurrent=${MAX_CONCURRENT}`);
  loopPromise = runLoop();
}

export function stopWorker(): void {
  running = false;
  console.log('[EvalWorker] Stop requested, waiting for active jobs to drain...');
}

export async function waitForWorkerStop(): Promise<void> {
  if (loopPromise) await loopPromise.catch(() => {});
}

async function runLoop(): Promise<void> {
  while (running) {
    try {
      while (activeJobs < MAX_CONCURRENT && running) {
        const job = dequeueEvalJob();
        if (!job) break;
        activeJobs++;
        processJob(job)
          .catch(err => {
            console.error(`[EvalWorker] Unhandled error in processJob:`, err);
          })
          .finally(() => {
            activeJobs--;
          });
      }
    } catch (err) {
      console.error('[EvalWorker] Dequeue error:', err);
    }
    if (running) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

interface ProcessJobResult {
  request_id: string;
  overall_score: number;
  latency_ms: number;
}

/**
 * 单个 job 评估流程:
 * 1. 从 request_logs 取 context (I4 修复: context_text 不是 doc_ids)
 * 2. 并行跑 3 个 RAGAS 指标 + 1 个幻觉检测
 * 3. 算 overall_score (4 项平均, 跳过失败项)
 * 4. 写 eval_results (C2 修复: overall_score 允许 null)
 * 5. completeEvalJob (I3 保留 started_at)
 */
async function processJob(job: { id: number; request_id: string }): Promise<ProcessJobResult | null> {
  const start = Date.now();
  stats.processed++;
  try {
    const db = getDb();
    const log = db
      .prepare('SELECT query, answer, context_text FROM request_logs WHERE request_id = ?')
      .get(job.request_id) as { query: string; answer: string; context_text: string | null } | undefined;

    if (!log) {
      failEvalJob(job.id, `request_log not found: ${job.request_id}`);
      stats.failed++;
      return null;
    }

    const context = log.context_text ?? '';
    const userContext = ''; // 当前 schema 没有 user_facts 字段, 留空 (TODO: M4 增强)

    const [faith, relev, ctxRel, hallu] = await Promise.all([
      evaluateFaithfulness(log.answer, context).catch(e => ({ score: -1, claims: [], error: String(e) })),
      evaluateAnswerRelevancy(log.answer, log.query).catch(e => ({ score: -1, reason: '', error: String(e) })),
      evaluateContextRelevancy(context, log.query).catch(e => ({ score: -1, reason: '', error: String(e) })),
      detectHallucination(log.answer, userContext, context).catch(e => ({
        user_fact_hallucination: false,
        user_fact_details: '',
        methodology_hallucination: false,
        methodology_details: '',
        hallucination_score: 0,
        raw_response: '',
        error: String(e),
      })),
    ]);

    // 算 overall (跳过 -1 失败项)
    const scores: number[] = [faith.score, relev.score, ctxRel.score].filter(s => s >= 0);
    const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const latency = Date.now() - start;
    const judgeModel = 'qwen3.6-plus-2026-04-02';

    db.prepare(`
      INSERT OR REPLACE INTO eval_results (
        request_id, job_id,
        overall_score, faithfulness_score, answer_relevancy_score, context_relevancy_score,
        faithfulness_reason, answer_relevancy_reason, context_relevancy_reason,
        model_id, judge_model, latency_ms, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.request_id,
      job.id,
      overallScore,
      faith.score >= 0 ? faith.score : null,
      relev.score >= 0 ? relev.score : null,
      ctxRel.score >= 0 ? ctxRel.score : null,
      JSON.stringify(faith.claims ?? []),
      relev.reason ?? '',
      ctxRel.reason ?? '',
      judgeModel,
      judgeModel,
      latency,
      hallu.error ?? null,
    );

    completeEvalJob(job.id);

    stats.succeeded++;
    console.log(
      `[EvalWorker] Job ${job.id} done: overall=${overallScore?.toFixed(3) ?? 'N/A'} in ${latency}ms`,
    );
    return { request_id: job.request_id, overall_score: overallScore ?? 0, latency_ms: latency };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[EvalWorker] Job ${job.id} failed:`, msg);
    failEvalJob(job.id, msg);
    stats.failed++;
    await new Promise(resolve => setTimeout(resolve, FAILURE_BACKOFF_MS));
    return null;
  }
}
