// src/server/analytics/store.ts
// Analytics event store backed by Prisma with in-memory fallback.
//
// Design goals (Phase 3 Task 3.4):
//   1. Persist events to SQLite via Prisma (survive process restart).
//   2. Keep existing API signatures (recordEvent, getEventCounts, getExportFormatCounts,
//      getErrorRate) so callers (queries.ts, admin route) continue to work.
//   3. Never throw to the caller: any persistence error is logged and the in-memory
//      cache is used as a degraded fallback (双写策略).
//   4. Support time-range filtering and add unique-user / top-event / last-N-day
//      helpers for the admin dashboard.

import type { Prisma, PrismaClient } from '../../../prisma/generated/client';
import { prisma } from '@/server/db/db';
import { createLogger } from '@/server/logger';

const analyticsLogger = createLogger('analytics:store');

export type AnalyticsEventType =
  | 'page_view'
  | 'resume_upload'
  | 'jd_parse'
  | 'match_analysis'
  | 'star_rewrite'
  | 'interview_coach_start'
  | 'interview_coach_end'
  | 'transcript_upload'
  | 'export'
  | 'error';

export interface RecordEventOptions {
  sessionId?: string;
  userId?: string;
  page?: string;
  traceId?: string;
}

export interface AnalyticsEventRecord {
  type: AnalyticsEventType;
  timestamp: number;
  data?: Record<string, unknown>;
}

const MAX_EVENTS = 10000;

// In-memory ring buffer used as degraded fallback / fast path.
const eventStore: AnalyticsEventRecord[] = [];

function pushToMemory(type: AnalyticsEventType, data?: Record<string, unknown>): void {
  eventStore.push({ type, timestamp: Date.now(), data });
  if (eventStore.length > MAX_EVENTS) {
    eventStore.splice(0, eventStore.length - MAX_EVENTS);
  }
}

/**
 * Persist a single analytics event. Fire-and-forget for Prisma; the in-memory
 * cache is updated synchronously so reads stay fast and resilient.
 *
 * Errors from the persistence layer are caught and logged — never thrown to caller.
 */
export function recordEvent(
  type: AnalyticsEventType,
  data?: Record<string, unknown>,
  options: RecordEventOptions = {},
): void {
  // 1. Always update in-memory cache first (sync, never fails).
  pushToMemory(type, data);

  // 2. Try to persist via Prisma in the background. Failure is non-fatal.
  void persistEvent(type, data, options).catch((err) => {
    analyticsLogger.warn('persist_event_failed', {
      eventType: type,
      err: err instanceof Error ? err.message : String(err),
    });
  });
}

async function persistEvent(
  type: AnalyticsEventType,
  data: Record<string, unknown> | undefined,
  options: RecordEventOptions,
): Promise<void> {
  const payload: Prisma.AnalyticsEventCreateInput = {
    type,
    page: options.page ?? null,
    sessionId: options.sessionId ?? null,
    userId: options.userId ?? null,
    traceId: options.traceId ?? null,
    ...(data !== undefined ? { data: data as Prisma.InputJsonValue } : {}),
  };

  await getPrisma().analyticsEvent.create({ data: payload });
}

interface PrismaHandle {
  analyticsEvent: PrismaClient['analyticsEvent'];
}

// Lazy lookup so tests can swap the prisma client via _setPrismaForTest.
let prismaHandle: PrismaHandle | null = null;

function getPrisma(): PrismaHandle {
  if (prismaHandle) return prismaHandle;
  return prisma;
}

export function _setPrismaForTest(client: PrismaHandle | null): void {
  prismaHandle = client;
}

export function _resetMemoryForTest(): void {
  eventStore.length = 0;
}

export interface AnalyticsEventQuery {
  startDate?: Date;
  endDate?: Date;
}

function toWhereClause(query: AnalyticsEventQuery): Prisma.AnalyticsEventWhereInput {
  const where: Prisma.AnalyticsEventWhereInput = {};
  if (query.startDate || query.endDate) {
    where.timestamp = {};
    if (query.startDate) {
      where.timestamp.gte = query.startDate;
    }
    if (query.endDate) {
      where.timestamp.lte = query.endDate;
    }
  }
  return where;
}

/**
 * Aggregate event counts by type within a time range.
 *
 * Tries Prisma first; on any persistence error, falls back to the in-memory
 * ring buffer. This preserves the original sync-or-fallback semantics: the
 * caller always gets a populated record (possibly empty).
 */
export async function getEventCounts(
  startDate?: Date,
  endDate?: Date,
): Promise<Record<AnalyticsEventType, number>> {
  try {
    const rows = await getPrisma().analyticsEvent.groupBy({
      by: ['type'],
      where: toWhereClause({ startDate, endDate }),
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.type] = row._count._all;
    }
    return counts as Record<AnalyticsEventType, number>;
  } catch (err) {
    analyticsLogger.warn('get_event_counts_fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    return readCountsFromMemory(startDate, endDate);
  }
}

function readCountsFromMemory(
  startDate?: Date,
  endDate?: Date,
): Record<AnalyticsEventType, number> {
  const startMs = startDate?.getTime() ?? 0;
  const endMs = endDate?.getTime() ?? Infinity;
  const counts: Record<string, number> = {};
  for (const event of eventStore) {
    if (event.timestamp >= startMs && event.timestamp <= endMs) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
  }
  return counts as Record<AnalyticsEventType, number>;
}

export async function getExportFormatCounts(
  startDate?: Date,
  endDate?: Date,
): Promise<{ pdf: number; docx: number; md: number }> {
  try {
    const events = await getPrisma().analyticsEvent.findMany({
      where: { ...toWhereClause({ startDate, endDate }), type: 'export' },
      select: { data: true },
    });
    return tallyExportFormats(events);
  } catch (err) {
    analyticsLogger.warn('get_export_format_counts_fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    return readExportFormatsFromMemory(startDate, endDate);
  }
}

function tallyExportFormats(
  events: ReadonlyArray<{ data: Prisma.JsonValue | null }>,
): { pdf: number; docx: number; md: number } {
  const counts = { pdf: 0, docx: 0, md: 0 };
  for (const ev of events) {
    if (ev.data && typeof ev.data === 'object' && !Array.isArray(ev.data)) {
      const format = (ev.data as Record<string, unknown>).format;
      if (format === 'pdf' || format === 'docx' || format === 'md') {
        counts[format]++;
      }
    }
  }
  return counts;
}

function readExportFormatsFromMemory(
  startDate?: Date,
  endDate?: Date,
): { pdf: number; docx: number; md: number } {
  const startMs = startDate?.getTime() ?? 0;
  const endMs = endDate?.getTime() ?? Infinity;
  const counts = { pdf: 0, docx: 0, md: 0 };
  for (const event of eventStore) {
    if (event.type === 'export' && event.timestamp >= startMs && event.timestamp <= endMs) {
      const format = event.data?.format as string | undefined;
      if (format === 'pdf' || format === 'docx' || format === 'md') {
        counts[format]++;
      }
    }
  }
  return counts;
}

export async function getErrorRate(startDate?: Date, endDate?: Date): Promise<number> {
  try {
    const [total, errors] = await Promise.all([
      getPrisma().analyticsEvent.count({ where: toWhereClause({ startDate, endDate }) }),
      getPrisma().analyticsEvent.count({
        where: { ...toWhereClause({ startDate, endDate }), type: 'error' },
      }),
    ]);
    return total > 0 ? errors / total : 0;
  } catch (err) {
    analyticsLogger.warn('get_error_rate_fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    return readErrorRateFromMemory(startDate, endDate);
  }
}

function readErrorRateFromMemory(startDate?: Date, endDate?: Date): number {
  const startMs = startDate?.getTime() ?? 0;
  const endMs = endDate?.getTime() ?? Infinity;
  let total = 0;
  let errors = 0;
  for (const event of eventStore) {
    if (event.timestamp >= startMs && event.timestamp <= endMs) {
      total++;
      if (event.type === 'error') errors++;
    }
  }
  return total > 0 ? errors / total : 0;
}

/** Count distinct users who emitted at least one event in the window. */
export async function getUniqueUserCount(
  startDate?: Date,
  endDate?: Date,
): Promise<number> {
  try {
    const grouped = await getPrisma().analyticsEvent.findMany({
      where: { ...toWhereClause({ startDate, endDate }), userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true },
    });
    return grouped.length;
  } catch (err) {
    analyticsLogger.warn('get_unique_user_count_fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    return readUniqueUsersFromMemory(startDate, endDate);
  }
}

function readUniqueUsersFromMemory(startDate?: Date, endDate?: Date): number {
  const startMs = startDate?.getTime() ?? 0;
  const endMs = endDate?.getTime() ?? Infinity;
  const seen = new Set<string>();
  for (const event of eventStore) {
    if (event.timestamp >= startMs && event.timestamp <= endMs) {
      const userId = event.data?.userId as string | undefined;
      if (userId) seen.add(userId);
    }
  }
  return seen.size;
}

export interface TopEventEntry {
  type: string;
  count: number;
}

/** Top N event types by count in the given window. */
export async function getTopEvents(
  startDate?: Date,
  endDate?: Date,
  limit = 5,
): Promise<TopEventEntry[]> {
  try {
    const rows = await getPrisma().analyticsEvent.groupBy({
      by: ['type'],
      where: toWhereClause({ startDate, endDate }),
      _count: { _all: true },
      orderBy: { _count: { type: 'desc' } },
      take: limit,
    });
    return rows.map((row) => ({ type: row.type, count: row._count._all }));
  } catch (err) {
    analyticsLogger.warn('get_top_events_fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    return readTopEventsFromMemory(limit, startDate, endDate);
  }
}

function readTopEventsFromMemory(
  limit: number,
  startDate?: Date,
  endDate?: Date,
): TopEventEntry[] {
  const counts = readCountsFromMemory(startDate, endDate);
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Most recent events (in-memory or from Prisma). Returns at most `limit` rows,
 * newest first. Used by the admin dashboard's "最近事件" list.
 */
export async function getRecentEvents(
  limit = 100,
  startDate?: Date,
  endDate?: Date,
): Promise<AnalyticsEventRecord[]> {
  try {
    const rows = await getPrisma().analyticsEvent.findMany({
      where: toWhereClause({ startDate, endDate }),
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { type: true, timestamp: true, data: true },
    });
    return rows.map((row) => ({
      type: row.type as AnalyticsEventType,
      timestamp: row.timestamp.getTime(),
      ...(row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? { data: row.data as Record<string, unknown> }
        : {}),
    }));
  } catch (err) {
    analyticsLogger.warn('get_recent_events_fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    return readRecentEventsFromMemory(limit, startDate, endDate);
  }
}

function readRecentEventsFromMemory(
  limit: number,
  startDate?: Date,
  endDate?: Date,
): AnalyticsEventRecord[] {
  const startMs = startDate?.getTime() ?? 0;
  const endMs = endDate?.getTime() ?? Infinity;
  return eventStore
    .filter((e) => e.timestamp >= startMs && e.timestamp <= endMs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export interface DailyEventCount {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

/**
 * Daily event counts for the last `days` days (UTC date strings). Useful for
 * the admin dashboard's "最近 7 日统计" chart.
 */
export async function getRecentDaysStats(days = 7): Promise<DailyEventCount[]> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const emptyBuckets: DailyEventCount[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    emptyBuckets.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const indexByDate = new Map(emptyBuckets.map((b, i) => [b.date, i]));

  try {
    const rows = await getPrisma().analyticsEvent.findMany({
      where: { timestamp: { gte: start } },
      select: { timestamp: true },
    });

    for (const row of rows) {
      const key = row.timestamp.toISOString().slice(0, 10);
      const idx = indexByDate.get(key);
      if (idx !== undefined) {
        emptyBuckets[idx].count++;
      }
    }
    return emptyBuckets;
  } catch (err) {
    analyticsLogger.warn('get_recent_days_stats_fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    return readRecentDaysFromMemory(days, start, indexByDate, emptyBuckets);
  }
}

function readRecentDaysFromMemory(
  days: number,
  start: Date,
  indexByDate: Map<string, number>,
  buckets: DailyEventCount[],
): DailyEventCount[] {
  const startMs = start.getTime();
  for (const event of eventStore) {
    if (event.timestamp < startMs) continue;
    const key = new Date(event.timestamp).toISOString().slice(0, 10);
    const idx = indexByDate.get(key);
    if (idx !== undefined) {
      buckets[idx].count++;
    }
  }
  return buckets.slice(-days);
}
