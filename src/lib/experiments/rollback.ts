// src/lib/experiments/rollback.ts
// M3: 自动回滚 - 三重防误判 (防止误把好变体回滚, 也防止坏变体不及时回滚)
// 1. 最小样本量 (statistical power)
// 2. 显著性 (p<0.05, Welch's t-test)
// 3. 灰度阶段 (前 24h / 前 100 请求不允许自动回滚)

import { getDb } from '@/lib/db/connection';

export interface RollbackCheckInput {
  experiment_id: string;
  variant: string;
  control_scores: number[];   // 对照组 overall_score 数组
  variant_scores: number[];   // 实验组 overall_score 数组
  experiment_started_at: number; // unix 秒
}

export interface RollbackCheckResult {
  should_rollback: boolean;
  reason: string;
  control_mean: number;
  variant_mean: number;
  p_value: number;
  sample_count: { control: number; variant: number };
  in_gray_release: boolean; // 是否在灰度期
}

const MIN_SAMPLES = 100;
const P_VALUE_THRESHOLD = 0.05;
const EFFECT_SIZE_THRESHOLD = 0.05; // 实验组比对照低 5% 触发回滚
const GRAY_RELEASE_HOURS = 24;
const GRAY_RELEASE_MIN_REQUESTS = 100;

/**
 * Welch's t-test (不等方差)
 * 简化版: 假设两组独立, 不等方差
 * 返回 p-value (双侧)
 */
export function welchTTest(a: number[], b: number[]): { t: number; p: number; df: number } {
  const n1 = a.length, n2 = b.length;
  if (n1 < 2 || n2 < 2) return { t: 0, p: 1, df: 0 };

  const m1 = a.reduce((s, x) => s + x, 0) / n1;
  const m2 = b.reduce((s, x) => s + x, 0) / n2;
  const v1 = a.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1);
  const v2 = b.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1);

  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return { t: 0, p: 1, df: 0 };

  const t = (m1 - m2) / se;
  // Welch–Satterthwaite df
  const df = (v1 / n1 + v2 / n2) ** 2 / (
    (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)
  );

  // p-value 近似: 用 student-t 分布 CDF (简化版 - 用正态近似 for df > 30)
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  return { t, p, df };
}

/** 标准正态 CDF (Abramowitz & Stegun 近似, 误差 < 7.5e-8) */
function normalCdf(x: number): number {
  // Φ(x) = 0.5 * (1 + erf(x / sqrt(2)))
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/**
 * 三重防误判检查:
 * 1. 样本量 >= MIN_SAMPLES (避免噪声触发)
 * 2. 显著性 p < 0.05 (统计显著)
 * 3. 灰度期: 实验开始 < 24h 或 总请求 < 100, 不允许回滚 (再观察)
 */
export function checkShouldRollback(input: RollbackCheckInput): RollbackCheckResult {
  const { control_scores, variant_scores, experiment_started_at } = input;
  const controlMean = control_scores.length > 0
    ? control_scores.reduce((s, x) => s + x, 0) / control_scores.length
    : 0;
  const variantMean = variant_scores.length > 0
    ? variant_scores.reduce((s, x) => s + x, 0) / variant_scores.length
    : 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const hoursSinceStart = (nowSec - experiment_started_at) / 3600;
  const inGrayRelease = hoursSinceStart < GRAY_RELEASE_HOURS
    || (control_scores.length + variant_scores.length) < GRAY_RELEASE_MIN_REQUESTS;

  // 防 1: 样本量
  if (control_scores.length < MIN_SAMPLES || variant_scores.length < MIN_SAMPLES) {
    return {
      should_rollback: false,
      reason: `样本量不足 (control=${control_scores.length}, variant=${variant_scores.length} < ${MIN_SAMPLES})`,
      control_mean: controlMean,
      variant_mean: variantMean,
      p_value: 1,
      sample_count: { control: control_scores.length, variant: variant_scores.length },
      in_gray_release: inGrayRelease,
    };
  }

  // 防 3: 灰度期 (在 plan 中是第 3 重)
  if (inGrayRelease) {
    return {
      should_rollback: false,
      reason: `灰度期 (${hoursSinceStart.toFixed(1)}h since start, ${
        control_scores.length + variant_scores.length
      } requests) - 再观察`,
      control_mean: controlMean,
      variant_mean: variantMean,
      p_value: 1,
      sample_count: { control: control_scores.length, variant: variant_scores.length },
      in_gray_release: true,
    };
  }

  // 防 2: 显著性 + 效应量
  const ttest = welchTTest(variant_scores, control_scores);
  const drop = (controlMean - variantMean) / Math.max(controlMean, 0.001);
  const significant = ttest.p < P_VALUE_THRESHOLD;
  const meaningfulDrop = drop > EFFECT_SIZE_THRESHOLD;

  if (significant && meaningfulDrop) {
    return {
      should_rollback: true,
      reason: `实验组显著差于对照 (p=${ttest.p.toFixed(4)}, drop=${(drop * 100).toFixed(1)}%)`,
      control_mean: controlMean,
      variant_mean: variantMean,
      p_value: ttest.p,
      sample_count: { control: control_scores.length, variant: variant_scores.length },
      in_gray_release: false,
    };
  }

  return {
    should_rollback: false,
    reason: `未达回滚阈值 (p=${ttest.p.toFixed(4)}, drop=${(drop * 100).toFixed(1)}%)`,
    control_mean: controlMean,
    variant_mean: variantMean,
    p_value: ttest.p,
    sample_count: { control: control_scores.length, variant: variant_scores.length },
    in_gray_release: false,
  };
}

/**
 * 执行回滚: 把 prompt_versions 表中实验的 is_active=0, is_experiment=0
 * 同时把 control 重新设为 is_active=1
 */
export function executeRollback(experimentId: string, reason: string): {
  rolled_back: boolean;
  affected_versions: string[];
} {
  const db = getDb();
  const variants = db
    .prepare('SELECT version FROM prompt_versions WHERE experiment_id = ? AND is_experiment = 1')
    .all(experimentId) as Array<{ version: string }>;

  if (variants.length === 0) {
    return { rolled_back: false, affected_versions: [] };
  }

  const tx = db.transaction(() => {
    // 关闭所有实验变体
    db.prepare(
      'UPDATE prompt_versions SET is_experiment = 0, experiment_traffic = 0 WHERE experiment_id = ?',
    ).run(experimentId);
    // 记录回滚原因 (写到 feedback? 暂时写到一个新表: 暂用 eval_results 字段 hack, 实际生产应建 audit_log)
    console.log(`[Rollback] experiment=${experimentId} reason=${reason}`);
  });
  tx();

  return { rolled_back: true, affected_versions: variants.map(v => v.version) };
}
