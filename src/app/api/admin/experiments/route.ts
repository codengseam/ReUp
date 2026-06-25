// src/app/api/admin/experiments/route.ts
// M3: 实验管理 API - 列出 / 详情 / 决策 / 应用 (HITL)
// 修复:
// - requireAdmin 收紧 (env 缺失不开放)
// - force_rollback 必须带 approved_by + reason
// - 500 错误统一 generic

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { requireAdmin, unauthorizedResponse, internalErrorResponse } from '@/lib/admin-auth-helper';
import {
  collectExperimentStats,
  suggestOptimization,
  applySuggestion,
  type OptimizationSuggestion,
} from '@/lib/experiments/auto-optimizer';
import { checkShouldRollback, executeRollback } from '@/lib/experiments/rollback';

export const runtime = 'nodejs';

interface ListResponse {
  experiments: Array<{
    id: number;
    version: string;
    experiment_id: string | null;
    traffic: number | null;
    is_active: number;
    is_experiment: number;
    created_at: number;
  }>;
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return unauthorizedResponse();
  try {
    const db = getDb();
    const url = new URL(request.url);
    const experimentId = url.searchParams.get('id');

    if (experimentId) {
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

    const experiments = db.prepare(`
      SELECT id, version, experiment_id, experiment_traffic AS traffic,
             is_active, is_experiment, created_at
      FROM prompt_versions
      WHERE is_experiment = 1 OR experiment_id IS NOT NULL
      ORDER BY created_at DESC
    `).all() as ListResponse['experiments'];

    return NextResponse.json({ experiments });
  } catch (error) {
    return internalErrorResponse('[Admin Experiments API]', error);
  }
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) return unauthorizedResponse();
  try {
    const body = await request.json() as {
      action: 'apply_suggestion' | 'force_rollback';
      suggestion?: OptimizationSuggestion;
      approved_by?: string;
      experiment_id?: string;
      reason?: string;
    };

    if (body.action === 'apply_suggestion') {
      // I-1 修复: approved_by 必填, 不接受空字符串
      if (!body.suggestion || !body.approved_by?.trim()) {
        return NextResponse.json({ error: '缺少 suggestion 或 approved_by' }, { status: 400 });
      }
      const result = applySuggestion(body.suggestion, body.approved_by);
      return NextResponse.json(result);
    }

    if (body.action === 'force_rollback') {
      // I-1 修复: force_rollback 必须带 approved_by + reason
      if (!body.experiment_id) {
        return NextResponse.json({ error: '缺少 experiment_id' }, { status: 400 });
      }
      if (!body.approved_by?.trim()) {
        return NextResponse.json({ error: 'force_rollback 必须带 approved_by (审计必填)' }, { status: 400 });
      }
      if (!body.reason?.trim()) {
        return NextResponse.json({ error: 'force_rollback 必须带 reason' }, { status: 400 });
      }
      const result = executeRollback(body.experiment_id, `manual rollback by ${body.approved_by}: ${body.reason}`);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 });
  } catch (error) {
    return internalErrorResponse('[Admin Experiments POST]', error);
  }
}
