// src/lib/eval/judge-calibrator.ts
// M2: 校准 LLM-as-Judge 与人工标注的一致性 (Pearson 相关系数)
// 参考: RAGAS paper §4.2

import { evaluateFaithfulness, evaluateAnswerRelevancy } from './ragas';
import { getAllGoldenTests } from './golden-dataset';

export interface CalibrationDetail {
  query: string;
  human_faithfulness: number;
  judge_faithfulness: number;
  human_relevancy: number;
  judge_relevancy: number;
}

export interface CalibrationResult {
  sample_count: number;
  faithfulness_correlation: number; // -1 ~ 1
  answer_relevancy_correlation: number;
  is_calibrated: boolean; // 两者都 > 0.7
  details: CalibrationDetail[];
  skipped_reason?: string;
}

const CALIBRATION_THRESHOLD = 0.7;
const MIN_SAMPLES = 10;

/** Pearson 相关系数 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);
  const numerator = n * sumXY - sumX * sumY;
  const denomA = n * sumX2 - sumX * sumX;
  const denomB = n * sumY2 - sumY * sumY;
  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * 校准流程: 取所有 Golden 测试, 让 LLM 跑一遍, 计算与人工标注的 Pearson 系数
 * 返回详细结果 + 是否达到可用阈值
 */
export async function calibrateJudge(): Promise<CalibrationResult> {
  const tests = getAllGoldenTests();
  if (tests.length < MIN_SAMPLES) {
    return {
      sample_count: tests.length,
      faithfulness_correlation: 0,
      answer_relevancy_correlation: 0,
      is_calibrated: false,
      details: [],
      skipped_reason: `样本不足 (${tests.length} < ${MIN_SAMPLES})`,
    };
  }

  const details: CalibrationDetail[] = [];
  for (const test of tests) {
    const context = test.context_docs ?? '';
    const [faith, relev] = await Promise.all([
      evaluateFaithfulness(test.expected_answer, context),
      evaluateAnswerRelevancy(test.expected_answer, test.query),
    ]);
    details.push({
      query: test.query,
      human_faithfulness: test.expected_faithfulness ?? 0,
      judge_faithfulness: faith.score,
      human_relevancy: test.expected_relevancy ?? 0,
      judge_relevancy: relev.score,
    });
  }

  const faithCorr = pearsonCorrelation(
    details.map(d => d.human_faithfulness),
    details.map(d => d.judge_faithfulness),
  );
  const relevCorr = pearsonCorrelation(
    details.map(d => d.human_relevancy),
    details.map(d => d.judge_relevancy),
  );

  return {
    sample_count: tests.length,
    faithfulness_correlation: faithCorr,
    answer_relevancy_correlation: relevCorr,
    is_calibrated: faithCorr > CALIBRATION_THRESHOLD && relevCorr > CALIBRATION_THRESHOLD,
    details,
  };
}
