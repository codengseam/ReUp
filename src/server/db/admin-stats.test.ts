import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { readFile, writeFile, unlink } from 'fs/promises';
import {
  recordRAGRetrieve,
  recordChatAPICall,
  recordInputGuardBlocked,
  getAdminStats,
  _resetForTest,
} from './admin-stats';

const STATS_FILE = path.join(process.cwd(), 'admin-stats.json');

describe('admin-stats persistence', () => {
  beforeEach(async () => {
    _resetForTest();
    try {
      await unlink(STATS_FILE);
    } catch {
      // ignore ENOENT
    }
  });

  afterEach(async () => {
    _resetForTest();
    try {
      await unlink(STATS_FILE);
    } catch {
      // ignore ENOENT
    }
  });

  it('returns default stats and writes a new file when none exists', async () => {
    const stats = await getAdminStats();
    expect(stats.ragRetrieveCount).toBe(0);
    expect(stats.chatApiCallCount).toBe(0);
    expect(stats.serviceStartTime).toBeGreaterThan(0);
    const raw = await readFile(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.ragRetrieveCount).toBe(0);
    expect(parsed.chatApiCallCount).toBe(0);
  });

  it('increments counters and persists across loads', async () => {
    await recordRAGRetrieve();
    await recordChatAPICall(1200);
    await recordInputGuardBlocked();

    const stats1 = await getAdminStats();
    expect(stats1.ragRetrieveCount).toBe(1);
    expect(stats1.chatApiCallCount).toBe(1);
    expect(stats1.inputGuardBlockedCount).toBe(1);
    expect(stats1.avgResponseTimeMs).toBe(1200);

    // Simulate a fresh process start: reset in-memory state and read the persisted file.
    _resetForTest();
    const stats2 = await getAdminStats();
    expect(stats2.ragRetrieveCount).toBe(1);
    expect(stats2.chatApiCallCount).toBe(1);
    expect(stats2.inputGuardBlockedCount).toBe(1);
  });

  it('updates serviceStartTime on every startup instead of using the persisted value', async () => {
    const persistedStartTime = Date.now() - 86_400_000; // 1 day ago
    await writeFile(
      STATS_FILE,
      JSON.stringify({
        ragRetrieveCount: 5,
        chatApiCallCount: 3,
        totalResponseTimeMs: 6000,
        inputGuardBlockedCount: 0,
        outputGuardBlockedCount: 0,
        serviceStartTime: persistedStartTime,
      }),
      'utf-8',
    );

    const stats = await getAdminStats();
    expect(stats.ragRetrieveCount).toBe(5);
    expect(stats.serviceStartTime).toBeGreaterThan(persistedStartTime + 86_390_000);
  });

  it('computes average response time correctly', async () => {
    await recordChatAPICall(1000);
    await recordChatAPICall(2000);
    await recordChatAPICall(3000);
    const stats = await getAdminStats();
    expect(stats.chatApiCallCount).toBe(3);
    expect(stats.avgResponseTimeMs).toBe(2000);
  });
});
