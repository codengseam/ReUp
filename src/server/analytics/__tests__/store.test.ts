// src/server/analytics/__tests__/store.test.ts
// Unit tests for the Prisma-backed analytics store (Phase 3 Task 3.4).
//
// We mock the Prisma client via `_setPrismaForTest` so the tests run without
// touching the real SQLite database, mirroring the approach used by
// feedback-store.test.ts / conversation-store.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _setPrismaForTest,
  _resetMemoryForTest,
  getEventCounts,
  getExportFormatCounts,
  getErrorRate,
  getUniqueUserCount,
  getTopEvents,
  getRecentDaysStats,
  recordEvent,
  type AnalyticsEventType,
} from '../store';

interface AnalyticsEventRecord {
  id: string;
  sessionId: string | null;
  userId: string | null;
  type: string;
  page: string | null;
  data: unknown;
  timestamp: Date;
  traceId: string | null;
}

function createMockAnalyticsEventModel() {
  const records: AnalyticsEventRecord[] = [];
  let nextId = 0;
  const make = (
    partial: Partial<AnalyticsEventRecord> & { type: string; timestamp: Date },
  ): AnalyticsEventRecord => ({
    id: `mock-${++nextId}`,
    sessionId: null,
    userId: null,
    page: null,
    data: null,
    traceId: null,
    ...partial,
  });

  return {
    records,
    create: vi.fn(async (args: { data: Partial<AnalyticsEventRecord> }) => {
      const row = make({
        type: args.data.type ?? 'page_view',
        timestamp: (args.data.timestamp as Date | undefined) ?? new Date(),
        sessionId: args.data.sessionId ?? null,
        userId: args.data.userId ?? null,
        page: args.data.page ?? null,
        data: args.data.data ?? null,
        traceId: args.data.traceId ?? null,
      });
      records.push(row);
      return row;
    }),
    groupBy: vi.fn(
      async (args: {
        by: string[];
        where?: {
          timestamp?: { gte?: Date; lte?: Date };
          type?: string;
          userId?: { not?: null };
        };
        _count?: { _all?: boolean };
        orderBy?: Record<string, unknown>;
        take?: number;
      }) => {
        let rows = records;
        if (args.where?.timestamp) {
          const { gte, lte } = args.where.timestamp;
          rows = rows.filter((r) => {
            if (gte && r.timestamp < gte) return false;
            if (lte && r.timestamp > lte) return false;
            return true;
          });
        }
        if (args.where?.type) {
          rows = rows.filter((r) => r.type === args.where!.type);
        }
        if (args.where?.userId?.not === null) {
          rows = rows.filter((r) => r.userId !== null);
        }
        const grouped = new Map<string, number>();
        for (const r of rows) {
          for (const key of args.by) {
            const value = String((r as unknown as Record<string, unknown>)[key] ?? '');
            grouped.set(value, (grouped.get(value) ?? 0) + 1);
          }
        }
        const out = Array.from(grouped.entries()).map(([value, count]) => ({
          [args.by[0]!]: value,
          _count: { _all: count },
        }));
        // Sort desc by _count
        out.sort(
          (a, b) =>
            ((b as { _count: { _all: number } })._count._all) -
            ((a as { _count: { _all: number } })._count._all),
        );
        return args.take ? out.slice(0, args.take) : out;
      },
    ),
    findMany: vi.fn(
      async (args: {
        where?: {
          timestamp?: { gte?: Date; lte?: Date };
          type?: string;
          userId?: { not?: null };
        };
        select?: { data?: boolean; timestamp?: boolean; userId?: boolean };
        distinct?: string[];
      }) => {
        let rows = records;
        if (args.where?.timestamp) {
          const { gte, lte } = args.where.timestamp;
          rows = rows.filter((r) => {
            if (gte && r.timestamp < gte) return false;
            if (lte && r.timestamp > lte) return false;
            return true;
          });
        }
        if (args.where?.type) {
          rows = rows.filter((r) => r.type === args.where!.type);
        }
        if (args.where?.userId?.not === null) {
          rows = rows.filter((r) => r.userId !== null);
        }
        if (args.distinct && args.distinct.length > 0) {
          const seen = new Set<string>();
          const filtered: AnalyticsEventRecord[] = [];
          for (const r of rows) {
            const key = String(
              (r as unknown as Record<string, unknown>)[args.distinct![0]!],
            );
            if (!seen.has(key)) {
              seen.add(key);
              filtered.push(r);
            }
          }
          rows = filtered;
        }
        if (!args.select) return rows;
        return rows.map((r) => {
          const out: Record<string, unknown> = {};
          if (args.select?.data) out.data = r.data;
          if (args.select?.timestamp) out.timestamp = r.timestamp;
          if (args.select?.userId) out.userId = r.userId;
          return out;
        });
      },
    ),
    count: vi.fn(
      async (args: {
        where?: {
          timestamp?: { gte?: Date; lte?: Date };
          type?: string;
        };
      }) => {
        let rows = records;
        if (args.where?.timestamp) {
          const { gte, lte } = args.where.timestamp;
          rows = rows.filter((r) => {
            if (gte && r.timestamp < gte) return false;
            if (lte && r.timestamp > lte) return false;
            return true;
          });
        }
        if (args.where?.type) {
          rows = rows.filter((r) => r.type === args.where!.type);
        }
        return rows.length;
      },
    ),
  };
}

function waitForPersistence(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('analytics store (Prisma-backed)', () => {
  let model: ReturnType<typeof createMockAnalyticsEventModel>;

  beforeEach(() => {
    _resetMemoryForTest();
    model = createMockAnalyticsEventModel();
    _setPrismaForTest({ analyticsEvent: model as never });
  });

  afterEach(() => {
    _setPrismaForTest(null);
    _resetMemoryForTest();
  });

  it('recordEvent writes to Prisma and updates the in-memory cache', async () => {
    recordEvent('page_view', { page: '/home' });
    await waitForPersistence();

    expect(model.records).toHaveLength(1);
    expect(model.records[0]?.type).toBe('page_view');
    expect(model.records[0]?.data).toEqual({ page: '/home' });
  });

  it('recordEvent includes sessionId, userId, page, traceId from options', async () => {
    recordEvent(
      'resume_upload',
      { format: 'pdf' },
      { sessionId: 's1', userId: 'u1', page: '/resume', traceId: 't1' },
    );
    await waitForPersistence();

    const row = model.records[0];
    expect(row?.sessionId).toBe('s1');
    expect(row?.userId).toBe('u1');
    expect(row?.page).toBe('/resume');
    expect(row?.traceId).toBe('t1');
  });

  it('recordEvent never throws even if Prisma write fails', async () => {
    model.create.mockRejectedValueOnce(new Error('DB down'));
    expect(() => recordEvent('error', { msg: 'x' })).not.toThrow();
    await waitForPersistence();
  });

  it('getEventCounts returns grouped counts by type', async () => {
    recordEvent('page_view');
    recordEvent('page_view');
    recordEvent('resume_upload');
    await waitForPersistence();

    const counts = await getEventCounts();
    expect(counts.page_view).toBe(2);
    expect(counts.resume_upload).toBe(1);
  });

  it('getEventCounts respects startDate/endDate range', async () => {
    const old = new Date('2024-01-01T00:00:00Z');
    const recent = new Date('2026-06-17T00:00:00Z');
    // Insert one event in the past via Prisma directly
    await model.create({
      data: { type: 'page_view', timestamp: old } as never,
    });
    recordEvent('page_view');
    await waitForPersistence();

    const counts = await getEventCounts(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-12-31T00:00:00Z'),
    );
    expect(counts.page_view).toBe(1);
  });

  it('getExportFormatCounts tallies pdf/docx/md by data.format', async () => {
    recordEvent('export', { format: 'pdf' });
    recordEvent('export', { format: 'pdf' });
    recordEvent('export', { format: 'docx' });
    recordEvent('export', { format: 'md' });
    recordEvent('export', { format: 'txt' }); // unsupported, ignored
    await waitForPersistence();

    const counts = await getExportFormatCounts();
    expect(counts.pdf).toBe(2);
    expect(counts.docx).toBe(1);
    expect(counts.md).toBe(1);
  });

  it('getErrorRate returns errors / total', async () => {
    recordEvent('page_view');
    recordEvent('error');
    recordEvent('error');
    await waitForPersistence();

    const rate = await getErrorRate();
    // 2 errors out of 3 events
    expect(rate).toBeCloseTo(2 / 3, 5);
  });

  it('getErrorRate returns 0 when there are no events', async () => {
    const rate = await getErrorRate();
    expect(rate).toBe(0);
  });

  it('getUniqueUserCount counts distinct userIds', async () => {
    recordEvent('page_view', undefined, { userId: 'u1' });
    recordEvent('page_view', undefined, { userId: 'u2' });
    recordEvent('page_view', undefined, { userId: 'u1' }); // dup
    recordEvent('page_view'); // no userId
    await waitForPersistence();

    const unique = await getUniqueUserCount();
    expect(unique).toBe(2);
  });

  it('getTopEvents returns the top N event types by count', async () => {
    for (let i = 0; i < 3; i++) recordEvent('page_view');
    for (let i = 0; i < 2; i++) recordEvent('resume_upload');
    recordEvent('export');
    await waitForPersistence();

    const top = await getTopEvents(undefined, undefined, 2);
    expect(top).toEqual([
      { type: 'page_view', count: 3 },
      { type: 'resume_upload', count: 2 },
    ]);
  });

  it('getRecentDaysStats returns 7 daily buckets for today', async () => {
    recordEvent('page_view');
    await waitForPersistence();

    const stats = await getRecentDaysStats(7);
    expect(stats).toHaveLength(7);
    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = stats.find((s) => s.date === today);
    expect(todayBucket?.count).toBe(1);
  });

  it('falls back to in-memory cache when Prisma throws', async () => {
    model.groupBy.mockRejectedValueOnce(new Error('DB down'));
    model.findMany.mockRejectedValueOnce(new Error('DB down'));
    model.count.mockRejectedValueOnce(new Error('DB down'));

    recordEvent('page_view');
    recordEvent('page_view');
    recordEvent('resume_upload');
    recordEvent('export', { format: 'pdf' });
    recordEvent('error');
    recordEvent('error', undefined, { userId: 'u1' });
    recordEvent('page_view', undefined, { userId: 'u2' });
    recordEvent('page_view', undefined, { userId: 'u1' });

    // getEventCounts falls back
    const counts = await getEventCounts();
    expect(counts.page_view).toBe(4);
    expect(counts.resume_upload).toBe(1);

    // getExportFormatCounts falls back
    const exports = await getExportFormatCounts();
    expect(exports.pdf).toBe(1);

    // getErrorRate falls back
    const rate = await getErrorRate();
    expect(rate).toBeGreaterThan(0);

    // getUniqueUserCount falls back (uses in-memory data.userId)
    const unique = await getUniqueUserCount();
    expect(unique).toBe(2);
  });

  it('exposes the AnalyticsEventType union for type-safe callers', () => {
    // Compile-time check: should accept all known event types.
    const events: AnalyticsEventType[] = [
      'page_view',
      'resume_upload',
      'jd_parse',
      'match_analysis',
      'star_rewrite',
      'interview_coach_start',
      'interview_coach_end',
      'transcript_upload',
      'export',
      'error',
    ];
    expect(events).toHaveLength(10);
  });
});
