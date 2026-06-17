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
