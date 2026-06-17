// src/lib/experiments/auto-optimizer.ts
// M3: 半自动优化 Loop - HITL (Human-in-the-Loop)
// - auto_apply 永远 false, 强制人工确认
// - 流程: collect metrics → suggest change → wait human approval → apply

import { getDb } from '@/lib/db/connection';
import { checkShouldRollback, executeRollback } from './rollback';
import { pearsonCorrelation } from '@/lib/eval/judge-calibrator';

export interface OptimizationSuggestion {
  type: 'rollback' | 'promote' | 'tune_prompt' | 'expand_cohort' | 'pause';
  experiment_id: string;
  variant: string;
  confidence: number; // 0-1
  rationale: string;
  metrics: {
    control_mean: number;
    variant_mean: number;
    p_value: number;
    sample_count: number;
  };
  auto_apply: false; // 永远 false, HITL 强制
}

export interface ExperimentStats {
  experiment_id: string;
  variant: string;
  started_at: number;
  control_scores: number[];
  variant_scores: number[];
}

/**
 * 收集一个 experiment 的最近分数
 * JOIN request_logs (取 experiment_id, variant) + eval_results (取 overall_score)
 */
export function collectExperimentStats(experimentId: string): ExperimentStats | null {
  const db = getDb();
  const expRow = db
    .prepare(`SELECT id, version, created_at FROM prompt_versions WHERE experiment_id = ? LIMIT 1`)
    .get(experimentId) as { id: number; version: string; created_at: number } | undefined;
  if (!expRow) return null;

  const rows = db.prepare(`
    SELECT rl.variant, er.overall_score
    FROM request_logs rl
    INNER JOIN eval_results er ON rl.request_id = er.request_id
    WHERE rl.experiment_id = ? AND er.overall_score IS NOT NULL
  `).all(experimentId) as Array<{ variant: string; overall_score: number }>;

  const control: number[] = [];
  const variant: number[] = [];
  for (const r of rows) {
    if (r.variant === 'control') control.push(r.overall_score);
    else if (r.variant === expRow.version) variant.push(r.overall_score);
  }

  return {
    experiment_id: experimentId,
    variant: expRow.version,
    started_at: expRow.created_at,
    control_scores: control,
    variant_scores: variant,
  };
}

/**
 * 决策: 基于统计检验, 给出建议 (不自动执行)
 * - rollback: 实验组显著差
 * - promote: 实验组显著好 (人工确认后切流量)
 * - expand_cohort: 实验组略好但不显著 (再观察)
 * - pause: 样本量太少
 */
export function suggestOptimization(stats: ExperimentStats): OptimizationSuggestion | null {
  const total = stats.control_scores.length + stats.variant_scores.length;
  if (total < 20) {
    return {
      type: 'pause',
      experiment_id: stats.experiment_id,
      variant: stats.variant,
      confidence: 0,
      rationale: `样本量过少 (${total}), 暂停实验收集更多数据`,
      metrics: { control_mean: 0, variant_mean: 0, p_value: 1, sample_count: total },
      auto_apply: false,
    };
  }

  const check = checkShouldRollback({
    experiment_id: stats.experiment_id,
    variant: stats.variant,
    control_scores: stats.control_scores,
    variant_scores: stats.variant_scores,
    experiment_started_at: stats.started_at,
  });

  if (check.should_rollback) {
    return {
      type: 'rollback',
      experiment_id: stats.experiment_id,
      variant: stats.variant,
      confidence: 1 - check.p_value,
      rationale: check.reason,
      metrics: {
        control_mean: check.control_mean,
        variant_mean: check.variant_mean,
        p_value: check.p_value,
        sample_count: check.sample_count.control + check.sample_count.variant,
      },
      auto_apply: false,
    };
  }

  // 检测是否有显著提升
  if (
    stats.control_scores.length >= 50
    && stats.variant_scores.length >= 50
    && !check.in_gray_release
    && check.p_value < 0.05
    && check.variant_mean > check.control_mean + 0.05
  ) {
    return {
      type: 'promote',
      experiment_id: stats.experiment_id,
      variant: stats.variant,
      confidence: 1 - check.p_value,
      rationale: `实验组显著好于对照 (${(check.variant_mean - check.control_mean).toFixed(3)} 提升, p=${check.p_value.toFixed(4)})`,
      metrics: {
        control_mean: check.control_mean,
        variant_mean: check.variant_mean,
        p_value: check.p_value,
        sample_count: check.sample_count.control + check.sample_count.variant,
      },
      auto_apply: false,
    };
  }

  // 略有提升但不显著 → 建议扩大样本
  if (check.variant_mean > check.control_mean + 0.02) {
    return {
      type: 'expand_cohort',
      experiment_id: stats.experiment_id,
      variant: stats.variant,
      confidence: 0.5,
      rationale: `实验组略好 (差异 ${((check.variant_mean - check.control_mean) * 100).toFixed(1)}%) 但不显著, 建议扩大样本`,
      metrics: {
        control_mean: check.control_mean,
        variant_mean: check.variant_mean,
        p_value: check.p_value,
        sample_count: check.sample_count.control + check.sample_count.variant,
      },
      auto_apply: false,
    };
  }

  return null;
}

/**
 * 应用建议 (需要人工调用, auto_apply 永远 false)
 * 支持的操作:
 * - rollback: 关闭实验变体
 * - promote: 设为正式版本 (复制 prompt_content 到新 is_active=1 行)
 */
export function applySuggestion(suggestion: OptimizationSuggestion, approvedBy: string): {
  applied: boolean;
  details: Record<string, unknown>;
} {
  if (suggestion.auto_apply) {
    return { applied: false, details: { error: 'auto_apply=true rejected, HITL required' } };
  }
  if (!approvedBy) {
    return { applied: false, details: { error: 'approvedBy required' } };
  }

  if (suggestion.type === 'rollback') {
    const result = executeRollback(suggestion.experiment_id, `${approvedBy} approved: ${suggestion.rationale}`);
    return { applied: result.rolled_back, details: { ...result, approvedBy } };
  }

  if (suggestion.type === 'promote') {
    const db = getDb();
    // 找原实验变体
    const variant = db
      .prepare('SELECT * FROM prompt_versions WHERE experiment_id = ? AND version = ?')
      .get(suggestion.experiment_id, suggestion.variant) as any;
    if (!variant) {
      return { applied: false, details: { error: 'variant not found' } };
    }
    // 关掉所有 active
    const tx = db.transaction(() => {
      db.prepare('UPDATE prompt_versions SET is_active = 0').run();
      // 标记新版本 active
      db.prepare('UPDATE prompt_versions SET is_active = 1, is_experiment = 0 WHERE id = ?').run(variant.id);
      console.log(`[Optimizer] Promoted ${variant.version} by ${approvedBy}, rationale: ${suggestion.rationale}`);
    });
    tx();
    return { applied: true, details: { promoted_version: variant.version, approvedBy } };
  }

  return { applied: false, details: { error: `unsupported action: ${suggestion.type}` } };
}

/**
 * 计算 judge 一致性 (用于评估 LLM-as-Judge 本身的可信度)
 * 这是一个 meta-metric, 用 Pearson correlation between judge and human (golden set)
 */
export function judgeConsistencyScore(): { correlation: number; sample: number } {
  // 修复 N+1 + 缺 idx_request_logs_query 索引: 用单次 join + GROUP BY
  const db = getDb();
  const rows = db.prepare(`
    SELECT g.expected_faithfulness AS h, AVG(er.faithfulness_score) AS j
    FROM golden_tests g
    LEFT JOIN request_logs rl ON rl.query = g.query
    LEFT JOIN eval_results er ON er.request_id = rl.request_id
    GROUP BY g.id, g.expected_faithfulness
    LIMIT 50
  `).all() as Array<{ h: number; j: number | null }>;

  const valid = rows.filter(r => r.j != null) as Array<{ h: number; j: number }>;
  if (valid.length < 5) return { correlation: 0, sample: 0 };
  const corr = pearsonCorrelation(valid.map(v => v.h), valid.map(v => v.j));
  return { correlation: corr, sample: valid.length };
}
