// src/server/rag/preheat.ts
// 冷启动预热: 在 server 开始监听后并行加载 BGE-M3 embedder + BGE-reranker,
// 把首次 RAG 查询的模型加载延迟从用户首条消息提前到容器启动期。
//
// 设计:
// - `preheatRAG()` 返回一个 Promise, 在两个模型都加载完 (或失败) 后 resolve;
//   调用方用 `void preheatRAG()` fire-and-forget, 不阻塞启动。
// - 任何加载错误都被捕获并记录, 永不 reject (避免 unhandled rejection)。
// - 模型模块通过 `await import(...)` 懒加载: 跳过路径不会触发 embedder/reranker
//   的 import, 保证 dev/test 环境零副作用。
// - 环境门控 (满足 "不改变本地 dev 行为"):
//     REUP_PREHEAT=0          → 跳过 (显式禁用)
//     NODE_ENV=production     → 运行 (ModelScope/Docker 冷启动目标场景)
//     REUP_PREHEAT=1          → 运行 (dev/test 显式 opt-in)
//     其它 (本地 dev/test)     → 跳过 (非生产)

import { logger } from '../utils/logger';

const PREHEAT = '[preheat]';

function shouldRun(): { run: boolean; reason: string } {
  if (process.env.REUP_PREHEAT === '0') {
    return { run: false, reason: 'disabled' };
  }
  if (process.env.NODE_ENV === 'production') {
    return { run: true, reason: 'production' };
  }
  if (process.env.REUP_PREHEAT === '1') {
    return { run: true, reason: 'forced' };
  }
  return { run: false, reason: 'non-production' };
}

/** 预热 BGE-M3 embedder: 触发 pipeline 加载 + 一次推理。失败仅记录。 */
async function preheatEmbedder(): Promise<void> {
  logger.info(`${PREHEAT} loading BGE-M3...`);
  try {
    const { createEmbedder } = await import('./embedder');
    const embedder = createEmbedder();
    await embedder.embed('preheat');
    logger.info(`${PREHEAT} BGE-M3 ready`);
  } catch (err) {
    logger.error(`${PREHEAT} BGE-M3 load failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 预热 BGE-reranker: 触发 pipeline 加载 + 一次推理。失败仅记录。 */
async function preheatReranker(): Promise<void> {
  logger.info(`${PREHEAT} loading reranker...`);
  try {
    const { rerank } = await import('./reranker');
    // 单条候选即可触发 getPipeline() 加载模型; 推理结果丢弃。
    await rerank('preheat', [{ id: 'preheat', text: 'preheat' }], 1);
    logger.info(`${PREHEAT} reranker ready`);
  } catch (err) {
    logger.error(`${PREHEAT} reranker load failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 并行预热 BGE-M3 + reranker。fire-and-forget: 调用方无需 await。
 * 永远 resolve (内部捕获所有错误), 不会产生 unhandled rejection。
 */
export async function preheatRAG(): Promise<void> {
  const { run, reason } = shouldRun();
  if (!run) {
    if (reason === 'disabled') {
      logger.info(`${PREHEAT} skipped (disabled)`);
    } else {
      logger.info(`${PREHEAT} skipped (non-production)`);
    }
    return;
  }

  logger.info(`${PREHEAT} starting`, { reason });
  // 并行触发; 两个分支各自捕获错误, allSettled 仅用于等待全部完成。
  await Promise.allSettled([preheatEmbedder(), preheatReranker()]);
  logger.info(`${PREHEAT} complete`);
}
