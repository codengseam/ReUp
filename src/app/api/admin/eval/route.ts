// src/app/api/admin/eval/route.ts
// M2: 评估看板 API - 3 个核心视图
// 修复: requireAdmin 收紧, top_failed 字段截断, 30 天时间窗, 500 错误统一

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { requireAdmin, unauthorizedResponse, internalErrorResponse } from '@/lib/admin-auth-helper';

export const runtime = 'nodejs';

const MAX_TEXT_PREVIEW = 500; // 截断 query/answer 字段, 控制单响应大小

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return unauthorizedResponse();
  try {
    const db = getDb();

    // 视图 1: 模型对比 + 30 天时间窗
    const modelComparison = db.prepare(`
      SELECT
        rl.model_id,
        rl.prompt_version,
        COUNT(DISTINCT rl.request_id) AS request_count,
        AVG(er.overall_score) AS avg_score,
        AVG(er.faithfulness_score) AS avg_faithfulness,
        AVG(er.answer_relevancy_score) AS avg_answer_relevancy,
        AVG(er.context_relevancy_score) AS avg_context_relevancy,
        SUM(rl.total_tokens) AS total_tokens,
        SUM(rl.cost) AS total_cost,
        SUM(CASE WHEN rl.has_recall = 0 THEN 1 ELSE 0 END) AS empty_recall_count
      FROM request_logs rl
      INNER JOIN eval_results er ON rl.request_id = er.request_id
      WHERE er.overall_score IS NOT NULL
        AND rl.created_at >= unixepoch() - 86400 * 30
      GROUP BY rl.model_id, rl.prompt_version
      ORDER BY avg_score DESC
    `).all() as Array<Record<string, unknown>>;

    // 视图 2: Top Failed (字段截断, 30 天窗口, <0.7)
    const topFailed = db.prepare(`
      SELECT
        substr(rl.query, 1, ?) AS query,
        substr(rl.answer, 1, ?) AS answer,
        rl.session_id,
        rl.model_id,
        rl.prompt_version,
        rl.has_recall,
        er.overall_score,
        er.faithfulness_score,
        er.answer_relevancy_score,
        er.context_relevancy_score,
        substr(er.faithfulness_reason, 1, ?) AS faithfulness_reason,
        rl.created_at
      FROM eval_results er
      INNER JOIN request_logs rl ON er.request_id = rl.request_id
      WHERE er.overall_score IS NOT NULL
        AND er.overall_score < 0.7
        AND rl.created_at >= unixepoch() - 86400 * 30
      ORDER BY er.overall_score ASC
      LIMIT 20
    `).all(MAX_TEXT_PREVIEW, MAX_TEXT_PREVIEW, MAX_TEXT_PREVIEW) as Array<Record<string, unknown>>;

    // 视图 3: 30 天每日趋势
    const dailyTrend = db.prepare(`
      SELECT
        date(rl.created_at, 'unixepoch') AS date,
        COUNT(*) AS requests,
        AVG(er.overall_score) AS avg_score,
        AVG(rl.latency_ms) AS avg_latency_ms,
        SUM(CASE WHEN rl.has_recall = 0 THEN 1 ELSE 0 END) AS empty_recall_count,
        SUM(CASE WHEN rl.error IS NOT NULL THEN 1 ELSE 0 END) AS error_count
      FROM request_logs rl
      LEFT JOIN eval_results er ON rl.request_id = rl.request_id
      WHERE rl.created_at >= unixepoch() - 86400 * 30
      GROUP BY date(rl.created_at, 'unixepoch')
      ORDER BY date DESC
    `).all() as Array<Record<string, unknown>>;

    const queueStats = db.prepare(`
      SELECT status, COUNT(*) AS c FROM eval_jobs GROUP BY status
    `).all() as Array<{ status: string; c: number }>;

    // 汇总卡片 (30 天): 总请求 / 空召回率 / 总成本 / 总 token
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total_requests,
        AVG(CASE WHEN has_recall = 0 THEN 1.0 ELSE 0.0 END) AS empty_recall_rate,
        SUM(cost) AS total_cost,
        SUM(total_tokens) AS total_tokens,
        AVG(latency_ms) AS avg_latency_ms,
        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS error_count
      FROM request_logs
      WHERE created_at >= unixepoch() - 86400 * 30
    `).get() as Record<string, number | null>;

    // 点踩率 (thumbs_down / total feedback) - 30 天
    const fbStats = db.prepare(`
      SELECT
        SUM(CASE WHEN reason = 'thumbs_down' THEN 1 ELSE 0 END) AS thumbs_down,
        COUNT(*) AS total_feedback
      FROM feedback
      WHERE created_at >= unixepoch() - 86400 * 30
    `).get() as { thumbs_down: number | null; total_feedback: number | null };
    const thumbsDownRate = fbStats.total_feedback
      ? (fbStats.thumbs_down ?? 0) / fbStats.total_feedback
      : 0;

    return NextResponse.json({
      model_comparison: modelComparison,
      top_failed: topFailed,
      daily_trend: dailyTrend,
      queue_stats: queueStats,
      summary: {
        total_requests: summary.total_requests ?? 0,
        empty_recall_rate: summary.empty_recall_rate ?? 0,
        total_cost: summary.total_cost ?? 0,
        total_tokens: summary.total_tokens ?? 0,
        avg_latency_ms: summary.avg_latency_ms ?? 0,
        error_count: summary.error_count ?? 0,
        error_rate: summary.total_requests
          ? (summary.error_count ?? 0) / summary.total_requests
          : 0,
        thumbs_down_rate: thumbsDownRate,
      },
      generated_at: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    return internalErrorResponse('[Admin Eval API]', error);
  }
}
