// src/app/api/admin/eval/route.ts
// M2: 评估看板 API - 3 个核心视图
// - 模型对比: 不同 model_id 的分数 + 成本
// - Top Failed: 分数最低的 20 个查询 (用于定位 bad case)
// - Daily Trend: 30 天趋势 + 点踩率

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { isAuthConfigured, verifySessionCookie } from '@/lib/admin-auth';

export const runtime = 'nodejs';

async function requireAdmin(request: NextRequest): Promise<boolean> {
  if (!isAuthConfigured()) return true; // 后端未配置时开放 (dev only)
  const cookie = request.cookies.get('boss_admin_session')?.value;
  if (!cookie) return false;
  return verifySessionCookie(cookie) !== null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const db = getDb();

    // 视图 1: 模型对比 (RAGAS 平均分 + token + 成本)
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
      GROUP BY rl.model_id, rl.prompt_version
      ORDER BY avg_score DESC
    `).all() as Array<Record<string, unknown>>;

    // 视图 2: Top Failed Queries (分数最低 20)
    const topFailed = db.prepare(`
      SELECT
        rl.query,
        rl.answer,
        rl.session_id,
        rl.model_id,
        rl.prompt_version,
        rl.has_recall,
        er.overall_score,
        er.faithfulness_score,
        er.answer_relevancy_score,
        er.context_relevancy_score,
        er.faithfulness_reason,
        rl.created_at
      FROM eval_results er
      INNER JOIN request_logs rl ON er.request_id = rl.request_id
      WHERE er.overall_score IS NOT NULL
      ORDER BY er.overall_score ASC
      LIMIT 20
    `).all() as Array<Record<string, unknown>>;

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
      LEFT JOIN eval_results er ON rl.request_id = er.request_id
      WHERE rl.created_at >= unixepoch() - 86400 * 30
      GROUP BY date(rl.created_at, 'unixepoch')
      ORDER BY date DESC
    `).all() as Array<Record<string, unknown>>;

    // 队列状态
    const queueStats = db.prepare(`
      SELECT status, COUNT(*) AS c
      FROM eval_jobs
      GROUP BY status
    `).all() as Array<{ status: string; c: number }>;

    return NextResponse.json({
      model_comparison: modelComparison,
      top_failed: topFailed,
      daily_trend: dailyTrend,
      queue_stats: queueStats,
      generated_at: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取评估数据失败';
    console.error('[Admin Eval API]', message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
