import { readFile, writeFile } from 'fs/promises';
import path from 'path';

export interface AdminStatsData {
  ragRetrieveCount: number;
  chatApiCallCount: number;
  totalResponseTimeMs: number;
  inputGuardBlockedCount: number;
  outputGuardBlockedCount: number;
  serviceStartTime: number;
}

export interface AdminStats extends AdminStatsData {
  avgResponseTimeMs: number;
}

const STATS_FILE = path.join(process.cwd(), 'admin-stats.json');

let statsBuffer: AdminStatsData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

/** Reset in-memory state for tests. Does not delete the persisted file. */
export function _resetForTest(): void {
  statsBuffer = null;
  writeQueue = Promise.resolve();
}

async function ensureStats(): Promise<AdminStatsData> {
  if (statsBuffer) return statsBuffer;

  try {
    const raw = await readFile(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AdminStatsData>;
    // serviceStartTime should reflect the current process start, not the first-ever start.
    statsBuffer = {
      ragRetrieveCount: parsed.ragRetrieveCount ?? 0,
      chatApiCallCount: parsed.chatApiCallCount ?? 0,
      totalResponseTimeMs: parsed.totalResponseTimeMs ?? 0,
      inputGuardBlockedCount: parsed.inputGuardBlockedCount ?? 0,
      outputGuardBlockedCount: parsed.outputGuardBlockedCount ?? 0,
      serviceStartTime: Date.now(),
    };
    await flushStats();
  } catch {
    statsBuffer = {
      ragRetrieveCount: 0,
      chatApiCallCount: 0,
      totalResponseTimeMs: 0,
      inputGuardBlockedCount: 0,
      outputGuardBlockedCount: 0,
      serviceStartTime: Date.now(),
    };
    await flushStats();
  }

  return statsBuffer;
}

function flushStats(): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      if (!statsBuffer) return;
      await writeFile(STATS_FILE, JSON.stringify(statsBuffer, null, 2), 'utf-8');
    })
    .catch((err) => {
      console.error('[AdminStats] 写入统计文件失败:', err);
    });

  return writeQueue;
}

export async function recordRAGRetrieve(): Promise<void> {
  const stats = await ensureStats();
  stats.ragRetrieveCount += 1;
  await flushStats();
}

export async function recordChatAPICall(durationMs: number): Promise<void> {
  const stats = await ensureStats();
  stats.chatApiCallCount += 1;
  stats.totalResponseTimeMs += durationMs;
  await flushStats();
}

export async function recordInputGuardBlocked(): Promise<void> {
  const stats = await ensureStats();
  stats.inputGuardBlockedCount += 1;
  await flushStats();
}

export async function recordOutputGuardBlocked(): Promise<void> {
  const stats = await ensureStats();
  stats.outputGuardBlockedCount += 1;
  await flushStats();
}

export async function getAdminStats(): Promise<AdminStats> {
  const stats = await ensureStats();
  return {
    ...stats,
    avgResponseTimeMs: stats.chatApiCallCount > 0 ? stats.totalResponseTimeMs / stats.chatApiCallCount : 0,
  };
}
