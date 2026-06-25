// src/server/analytics/queries.ts
// Analytics queries for the admin dashboard (Phase 3 Task 3.4: Prisma-backed)

import {
  getEventCounts,
  getErrorRate,
  getExportFormatCounts,
  getRecentDaysStats,
  getRecentEvents,
  getTopEvents,
  getUniqueUserCount,
  type AnalyticsEventRecord,
  type DailyEventCount,
  type TopEventEntry,
} from './store';

export interface AnalyticsOverview {
  totalUsers: number;
  resumeUploads: number;
  jdParses: number;
  matchAnalyses: number;
  starRewrites: number;
  interviewSessions: number;
  transcriptUploads: number;
  exports: { pdf: number; docx: number; md: number };
  errorRate: number;
  topEvents: TopEventEntry[];
  /** 最近 30 天每天事件数（按时间正序：第 0 项 = 最早一天）。 */
  dailyTrend: DailyEventCount[];
  /** 最近 100 条事件（按时间倒序）。 */
  recentEvents: AnalyticsEventRecord[];
  period: { start: string; end: string };
}

export async function getAnalyticsOverview(
  startDate?: Date,
  endDate?: Date,
): Promise<AnalyticsOverview> {
  const [counts, exportCounts, errorRate, totalUsers, topEvents, dailyTrend, recentEvents] =
    await Promise.all([
      getEventCounts(startDate, endDate),
      getExportFormatCounts(startDate, endDate),
      getErrorRate(startDate, endDate),
      getUniqueUserCount(startDate, endDate),
      getTopEvents(startDate, endDate, 5),
      getRecentDaysStats(30),
      getRecentEvents(100, startDate, endDate),
    ]);

  const interviewSessions =
    (counts.interview_coach_start || 0) + (counts.interview_coach_end || 0);

  return {
    totalUsers,
    resumeUploads: counts.resume_upload || 0,
    jdParses: counts.jd_parse || 0,
    matchAnalyses: counts.match_analysis || 0,
    starRewrites: counts.star_rewrite || 0,
    interviewSessions,
    transcriptUploads: counts.transcript_upload || 0,
    exports: exportCounts,
    errorRate: Math.round(errorRate * 10000) / 100,
    topEvents,
    dailyTrend,
    recentEvents,
    period: {
      start: startDate?.toISOString() ?? 'all',
      end: endDate?.toISOString() ?? 'now',
    },
  };
}
