// src/lib/eval/worker.ts
// M2: 评估 Worker - 轮询 eval_jobs 队列表, 跑 RAGAS + 幻觉检测, 写 eval_results
// 关键修复:
// - 启动时 resetStuckJobs() 回收崩溃残留的 running 任务 (C2)
// - processJob 内 INSERT eval_results + completeEvalJob 包在事务中 (C4 修复)
// - evaluateFaithfulness 解析失败时 score=null 而非 1.0 (I1 silent corruption)
// - stopWorker 等待活跃任务完成 (C3 修复)

import { getDb } from '@/lib/db/connection';
import {
  dequeueEvalJob,
  completeEvalJob,
  failEvalJob,
  resetStuckJobs,
} from '@/lib/db/eval-jobs';
import {
  evaluateFaithfulness,
  evaluateAnswerRelevancy,
  evaluateContextRelevancy,
} from './ragas';
import { detectHallucination } from './hallucination-detector';

const POLL_INTERVAL_MS = 5000;
const MAX_CONCURRENT = 2;

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
  // C2 修复: 启动时回收崩溃残留的 running 任务 (5 分钟未更新的认为已死)
  const reaped = resetStuckJobs(300);
  if (reaped > 0) {
    console.log(`[EvalWorker] Recovered ${reaped} stuck 'running' jobs from previous crash`);
  }
  console.log(`[EvalWorker] Started, polling every ${POLL_INTERVAL_MS}ms, max_concurrent=${MAX_CONCURRENT}`);
  loopPromise = runLoop();
}

export function stopWorker(): void {
  running = false;
  console.log('[EvalWorker] Stop requested, will drain active jobs before exit');
}

// C3 修复: 等待 runLoop 真正退出 (activeJobs === 0)
export async function waitForWorkerStop(timeoutMs = 30_000): Promise<void> {
  if (loopPromise) {
    await loopPromise.catch(() => {});
  }
  // 额外等待活跃任务 drain (runLoop 退出后, activeJobs 可能还有未完成)
  const start = Date.now();
  while (activeJobs > 0 && Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (activeJobs > 0) {
    console.warn(`[EvalWorker] Force exit with ${activeJobs} jobs still running`);
  }
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
  overall_score: number | null;
  latency_ms: number;
}

/**
 * 单个 job 评估流程:
 * 1. 从 request_logs 取 context (I4: context_text 不是 doc_ids)
 * 2. 并行跑 3 个 RAGAS 指标 + 1 个幻觉检测
 * 3. 算 overall_score (4 项平均, 跳过失败项)
 * 4. 写 eval_results + completeEvalJob (包在事务中, C4 修复)
 * 5. 失败不阻塞, 立即 activeJobs-- (移除 FAILURE_BACKOFF_MS 30s 死等)
 */
async function processJob(job: { id: number; request_id: string }): Promise<ProcessJobResult | null> {
  const start = Date.now();
  stats.processed++;
  try {
    const db = getDb();
    const log = db
      .prepare('SELECT query, answer, context_text, error FROM request_logs WHERE request_id = ?')
      .get(job.request_id) as { query: string; answer: string; context_text: string | null; error: string | null } | undefined;

    if (!log) {
      failEvalJob(job.id, `request_log not found: ${job.request_id}`);
      stats.failed++;
      return null;
    }

    // I3 修复: 失败请求不入评估 (避免拉低分)
    if (log.error) {
      failEvalJob(job.id, `skipped: request_log has error: ${log.error}`);
      stats.failed++;
      return null;
    }

    const context = log.context_text ?? '';
    const userContext = ''; // 当前 schema 没有 user_facts 字段, 留空

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

    const resultError = hallu.error ?? null;

    // C4 修复: INSERT eval_results + completeEvalJob 包在事务中, 中途崩溃也一致
    db.transaction(() => {
      // C-1 修复: 用 ON CONFLICT(request_id) DO UPDATE 保证幂等 (re-run 时覆盖)
      db.prepare(`
        INSERT INTO eval_results (
          request_id, job_id,
          overall_score, faithfulness_score, answer_relevancy_score, context_relevancy_score,
          faithfulness_reason, answer_relevancy_reason, context_relevancy_reason,
          model_id, judge_model, latency_ms, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id) DO UPDATE SET
          job_id = excluded.job_id,
          overall_score = excluded.overall_score,
          faithfulness_score = excluded.faithfulness_score,
          answer_relevancy_score = excluded.answer_relevancy_score,
          context_relevancy_score = excluded.context_relevancy_score,
          faithfulness_reason = excluded.faithfulness_reason,
          answer_relevancy_reason = excluded.answer_relevancy_reason,
          context_relevancy_reason = excluded.context_relevancy_reason,
          model_id = excluded.model_id,
          judge_model = excluded.judge_model,
          latency_ms = excluded.latency_ms,
          error = excluded.error
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
        resultError,
      );
      completeEvalJob(job.id);
    })();

    stats.succeeded++;
    console.log(
      `[EvalWorker] Job ${job.id} done: overall=${overallScore?.toFixed(3) ?? 'N/A'} in ${latency}ms`,
    );
    return { request_id: job.request_id, overall_score: overallScore, latency_ms: latency };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[EvalWorker] Job ${job.id} failed:`, msg);
    failEvalJob(job.id, msg);
    stats.failed++;
    return null;
  }
}
