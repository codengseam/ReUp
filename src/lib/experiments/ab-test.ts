// src/lib/experiments/ab-test.ts
// M3: A/B 测试 - 稳定哈希分桶 (SHA256(user_id) % 100 ∈ [0, traffic*100))
// 参考: https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models
//       稳定哈希优于随机数 (用户每次都进同一桶, 实验可复现)

import { createHash } from 'node:crypto';

export interface ABAssignment {
  /** 选中的变体 ('control' | experiment version, e.g. 'v1.0.0') */
  variant: string;
  /** 桶号 0-99 */
  bucket: number;
  /** 是否在实验流量内 */
  in_experiment: boolean;
}

interface Experiment {
  experiment_id: string;
  variants: Array<{ name: string; traffic: number }>; // traffic ∈ [0,1], 之和 = 1
}

/**
 * 计算 user_id 的稳定桶号 [0, 99]
 * - SHA256(user_id + experiment_id) % 100
 * - 加 experiment_id 是为了不同实验独立分桶 (避免一个用户永远进 control)
 */
export function hashBucket(userId: string, experimentId: string): number {
  const hash = createHash('sha256')
    .update(`${userId}:${experimentId}`)
    .digest();
  // 取前 4 字节转 uint32, mod 100
  const u32 = hash.readUInt32BE(0);
  return u32 % 100;
}

/**
 * 给定 user_id + 实验定义, 决定分配到哪个变体
 *
 * 流量分配逻辑:
 * 1. 先算 bucket = hash(user_id, experiment_id) % 100
 * 2. 若 bucket < total_traffic*100: 落入实验, 按 variants.traffic 比例分配
 * 3. 否则: 分配 'control' (默认线上版本)
 */
export function assignVariant(userId: string, experiment: Experiment): ABAssignment {
  const bucket = hashBucket(userId, experiment.experiment_id);
  const totalExperimentTraffic = experiment.variants.reduce((s, v) => s + v.traffic, 0);
  const experimentThreshold = Math.round(totalExperimentTraffic * 100);

  if (bucket >= experimentThreshold) {
    return { variant: 'control', bucket, in_experiment: false };
  }

  // 在实验流量内, 按比例分配
  const experimentBucket = bucket;
  let cumulative = 0;
  for (const variant of experiment.variants) {
    cumulative += Math.round(variant.traffic * 100);
    if (experimentBucket < cumulative) {
      return { variant: variant.name, bucket, in_experiment: true };
    }
  }
  // 兜底 (浮点累积误差)
  const last = experiment.variants[experiment.variants.length - 1];
  return { variant: last.name, bucket, in_experiment: true };
}

/**
 * 同一 user 在同一 experiment 下必须永远进同一桶
 * 这是 A/B 可复现性的核心保证
 */
export function isAssignmentStable(
  userId: string,
  experimentId: string,
  runs: number = 10,
): boolean {
  const first = hashBucket(userId, experimentId);
  for (let i = 0; i < runs; i++) {
    if (hashBucket(userId, experimentId) !== first) return false;
  }
  return true;
}

import { getActivePrompt, getExperimentPrompts, type PromptVersion } from '@/lib/db/prompt-versions';

export interface PromptPick {
  prompt_version: string | null;
  experiment_id: string | null;
  variant: 'control' | string;
  in_experiment: boolean;
  prompt_content: string | null;
}

/**
 * chat 调用: 根据 user_id 决定使用哪个 prompt 版本
 * - 若无 active prompt → 返回 null
 * - 若无实验 prompt → 全 control
 * - 若有实验 prompt → 用稳定哈希分桶
 *
 * 这是 C-5 修复: 之前 chat 写死 variant='control', A/B 数据流断裂
 */
export function pickPromptForUser(userId: string): PromptPick {
  const active = getActivePrompt();
  const experiments = getExperimentPrompts();
  const controlVersion = active?.version ?? null;

  if (experiments.length === 0) {
    return {
      prompt_version: controlVersion,
      experiment_id: null,
      variant: 'control',
      in_experiment: false,
      prompt_content: active?.prompt_content ?? null,
    };
  }

  // 取第一个 active experiment (实际应用可支持多实验轮转, 当前单实验)
  const exp = experiments[0];
  const assignment = assignVariant(userId, {
    experiment_id: exp.experiment_id ?? exp.version,
    variants: [{ name: exp.version, traffic: exp.experiment_traffic }],
  });

  if (assignment.variant === 'control') {
    return {
      prompt_version: controlVersion,
      experiment_id: exp.experiment_id,
      variant: 'control',
      in_experiment: false,
      prompt_content: active?.prompt_content ?? null,
    };
  }

  // 实验流量: 用 experiment 版本的 prompt
  return {
    prompt_version: exp.version,
    experiment_id: exp.experiment_id,
    variant: assignment.variant,
    in_experiment: true,
    prompt_content: exp.prompt_content,
  };
}
