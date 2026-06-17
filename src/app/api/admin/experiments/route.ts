// src/app/api/admin/experiments/route.ts
// M3: 实验管理 API - 列出 / 详情 / 决策 / 应用 (HITL)

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { isAuthConfigured, verifySessionCookie } from '@/lib/admin-auth';
import {
  collectExperimentStats,
  suggestOptimization,
  applySuggestion,
  type OptimizationSuggestion,
} from '@/lib/experiments/auto-optimizer';
import { checkShouldRollback, executeRollback } from '@/lib/experiments/rollback';

export const runtime = 'nodejs';

async function requireAdmin(request: NextRequest): Promise<boolean> {
  if (!isAuthConfigured()) return true;
  const cookie = request.cookies.get('boss_admin_session')?.value;
  if (!cookie) return false;
  return verifySessionCookie(cookie) !== null;
}

interface ListResponse {
  experiments: Array<{
    experiment_id: string;
    variant: string;
    started_at: number;
    is_active: number;
    is_experiment: number;
    traffic: number;
  }>;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const db = getDb();
    const url = new URL(request.url);
    const experimentId = url.searchParams.get('id');

    if (experimentId) {
      // 详情 + 建议
      const stats = collectExperimentStats(experimentId);
      if (!stats) {
        return NextResponse.json({ error: 'experiment not found' }, { status: 404 });
      }
      const suggestion = suggestOptimization(stats);
      const rollbackCheck = stats
        ? checkShouldRollback({
            experiment_id: stats.experiment_id,
            variant: stats.variant,
            control_scores: stats.control_scores,
            variant_scores: stats.variant_scores,
            experiment_started_at: stats.started_at,
          })
        : null;
      return NextResponse.json({ stats, suggestion, rollback_check: rollbackCheck });
    }

    // 列表: 所有实验版本 + 元数据
    const experiments = db.prepare(`
      SELECT id, version, experiment_id, experiment_traffic AS traffic,
             is_active, is_experiment, created_at
      FROM prompt_versions
      WHERE is_experiment = 1 OR experiment_id IS NOT NULL
      ORDER BY created_at DESC
    `).all() as Array<Record<string, unknown>>;

    return NextResponse.json({ experiments } satisfies ListResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取实验列表失败';
    console.error('[Admin Experiments API]', message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json() as {
      action: 'apply_suggestion' | 'force_rollback';
      suggestion?: OptimizationSuggestion;
      approved_by?: string;
      experiment_id?: string;
      reason?: string;
    };

    if (body.action === 'apply_suggestion') {
      if (!body.suggestion || !body.approved_by) {
        return NextResponse.json({ error: '缺少 suggestion 或 approved_by' }, { status: 400 });
      }
      const result = applySuggestion(body.suggestion, body.approved_by);
      return NextResponse.json(result);
    }

    if (body.action === 'force_rollback') {
      if (!body.experiment_id) {
        return NextResponse.json({ error: '缺少 experiment_id' }, { status: 400 });
      }
      const result = executeRollback(
        body.experiment_id,
        body.reason ?? `manual rollback by ${body.approved_by ?? 'unknown'}`,
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行操作失败';
    console.error('[Admin Experiments POST]', message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
