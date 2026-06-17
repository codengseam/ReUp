// scripts/start-worker.ts
// 启动 eval worker (生产环境独立进程)
// 用法: npx tsx scripts/start-worker.ts

import 'dotenv/config';
import { startWorker, stopWorker, waitForWorkerStop, getWorkerStats } from '@/lib/eval/worker';

console.log('='.repeat(60));
console.log('Loop Engineering - Eval Worker');
console.log('='.repeat(60));

startWorker();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[Worker] SIGINT received, stopping...');
  stopWorker();
});

process.on('SIGTERM', () => {
  console.log('\n[Worker] SIGTERM received, stopping...');
  stopWorker();
});

// 每 30s 打一次 stats
setInterval(() => {
  const stats = getWorkerStats();
  const uptime = stats.startedAt > 0 ? Math.round((Date.now() - stats.startedAt) / 1000) : 0;
  console.log(
    `[Worker] uptime=${uptime}s processed=${stats.processed} succeeded=${stats.succeeded} failed=${stats.failed}`,
  );
}, 30_000);

waitForWorkerStop()
  .then(() => {
    const stats = getWorkerStats();
    console.log('[Worker] Final stats:', stats);
    process.exit(0);
  })
  .catch(err => {
    console.error('[Worker] Fatal:', err);
    process.exit(1);
  });
