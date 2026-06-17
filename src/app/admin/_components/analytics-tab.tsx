'use client';
// src/app/admin/_components/analytics-tab.tsx
// ReUp Phase 3 Task 3.4: 后台统计 Tab。
//
// 数据来源：GET /api/admin/analytics?start=ISO&end=ISO
// 展示项（参考 docs/superpowers/specs/2026-06-17-spec-infra-logging-analytics.md）：
//   - 4 张 KPI 卡：总事件数 / 独立用户数 / Top 事件 / 最近 7 日事件数
//   - 折线图：最近 30 日事件趋势
//   - 柱状图：按事件类型分布
//   - 列表：最近 100 条事件
//   - 时间范围选择器：24h / 7d / 30d / all
//
// 风格沿用 dashboard-tab / metadata-tab：Card + Tailwind，避免引入 recharts。

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, Loader2, RefreshCw, BarChart3, Users, TrendingUp, Layers,
  AlertCircle, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatRelativeTime } from '../_lib/utils';

const ANALYTICS_API = '/api/admin/analytics';

type RangeKey = '24h' | '7d' | '30d' | 'all';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; hours: number | null }> = [
  { key: '24h', label: '最近 24 小时', hours: 24 },
  { key: '7d', label: '最近 7 天', hours: 24 * 7 },
  { key: '30d', label: '最近 30 天', hours: 24 * 30 },
  { key: 'all', label: '全部时间', hours: null },
];

/** 与 server/analytics/queries.ts 的 AnalyticsOverview 对齐。 */
interface AnalyticsOverview {
  totalUsers: number;
  resumeUploads: number;
  jdParses: number;
  matchAnalyses: number;
  starRewrites: number;
  interviewSessions: number;
  transcriptUploads: number;
  exports: { pdf: number; docx: number; md: number };
  errorRate: number;
  topEvents: Array<{ type: string; count: number }>;
  dailyTrend: Array<{ date: string; count: number }>;
  recentEvents: Array<{ type: string; timestamp: number; data?: Record<string, unknown> }>;
  period: { start: string; end: string };
  traceId?: string;
}

/** 把 "24h"/"7d"/"30d"/"all" 翻译成 URL search params。 */
function buildQuery(range: RangeKey, now: Date): string {
  const opt = RANGE_OPTIONS.find((r) => r.key === range);
  if (!opt || opt.hours === null) return '';
  const start = new Date(now.getTime() - opt.hours * 60 * 60 * 1000);
  return `?start=${encodeURIComponent(start.toISOString())}`;
}

/** 把秒级时间戳格式化成 "MM-DD HH:mm"（避免依赖 locale，跨环境稳定）。 */
function formatEventTime(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${hh}:${mm}`;
}

/** 事件类型 → 中文短标签。 */
const EVENT_LABEL: Record<string, string> = {
  page_view: '页面访问',
  resume_upload: '简历上传',
  jd_parse: 'JD 解析',
  match_analysis: '匹配分析',
  star_rewrite: 'STAR 改写',
  interview_coach_start: '面试开始',
  interview_coach_end: '面试结束',
  transcript_upload: '面经上传',
  export: '导出',
  error: '错误',
};

export default function AnalyticsTab() {
  const [range, setRange] = useState<RangeKey>('all');
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (selected: RangeKey) => {
    setLoading(true);
    setError(null);
    try {
      const url = `${ANALYTICS_API}${buildQuery(selected, new Date())}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || '获取统计数据失败');
      }
      setData(body as AnalyticsOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络异常，请稍后重试');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range);
  }, [range, fetchData]);

  // 衍生指标
  const totalEvents = useMemo(() => {
    if (!data) return 0;
    return (
      data.resumeUploads +
      data.jdParses +
      data.matchAnalyses +
      data.starRewrites +
      data.interviewSessions +
      data.transcriptUploads +
      (data.exports.pdf + data.exports.docx + data.exports.md)
    );
  }, [data]);

  // 最近 7 日事件总数 = dailyTrend 末尾 7 个 bucket 之和
  const recentEventCount7d = useMemo(() => {
    if (!data) return 0;
    const last7 = data.dailyTrend.slice(-7);
    return last7.reduce((sum, p) => sum + p.count, 0);
  }, [data]);

  const topEvent = useMemo(() => {
    if (!data || data.topEvents.length === 0) return null;
    return data.topEvents[0] ?? null;
  }, [data]);

  const eventTypeBars = useMemo(() => {
    if (!data) return [] as Array<{ name: string; label: string; count: number }>;
    return [
      { name: 'resume_upload', label: EVENT_LABEL.resume_upload!, count: data.resumeUploads },
      { name: 'jd_parse', label: EVENT_LABEL.jd_parse!, count: data.jdParses },
      { name: 'match_analysis', label: EVENT_LABEL.match_analysis!, count: data.matchAnalyses },
      { name: 'star_rewrite', label: EVENT_LABEL.star_rewrite!, count: data.starRewrites },
      { name: 'interview_session', label: '面试模拟', count: data.interviewSessions },
      { name: 'transcript_upload', label: EVENT_LABEL.transcript_upload!, count: data.transcriptUploads },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      {/* 顶部：标题 + 范围选择 + 刷新 */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">数据统计</h2>
          <p className="text-sm text-muted-foreground mt-1">
            来自前端埋点的事件流（fire-and-forget → in-memory store），用于观测功能使用与错误率
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger size="sm" className="w-[140px]" data-testid="range-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key} data-testid={`range-${o.key}`}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(range)}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            刷新
          </Button>
        </div>
      </div>

      {/* 错误态：整页错误时只显示错误，不渲染下方模块 */}
      {error && (
        <Card data-testid="analytics-error" className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-5 flex items-center gap-3 text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="text-sm">加载失败：{error}</p>
          </CardContent>
        </Card>
      )}

      {/* 4 张 KPI 卡 */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          testId="kpi-total"
          icon={Activity}
          iconBg="bg-emerald-50"
          iconFg="text-emerald-600"
          label="总事件数"
          value={loading ? '-' : totalEvents}
          hint="所选时间范围内"
        />
        <KpiCard
          testId="kpi-users"
          icon={Users}
          iconBg="bg-blue-50"
          iconFg="text-blue-600"
          label="独立用户数"
          value={loading || !data ? '-' : data.totalUsers}
          hint="埋点未携带 userId"
          hintMuted
        />
        <KpiCard
          testId="kpi-top"
          icon={TrendingUp}
          iconBg="bg-amber-50"
          iconFg="text-amber-600"
          label="Top 事件"
          value={
            loading
              ? '-'
              : topEvent
                ? `${EVENT_LABEL[topEvent.type] ?? topEvent.type} · ${topEvent.count}`
                : '—'
          }
          hint="所选范围内最高频"
        />
        <KpiCard
          testId="kpi-7d"
          icon={Layers}
          iconBg="bg-purple-50"
          iconFg="text-purple-600"
          label="最近 7 日事件数"
          value={loading || !data ? '-' : recentEventCount7d}
          hint="近 7 日窗口"
        />
      </div>

      {/* 折线图：最近 30 日事件趋势（始终显示完整 30 日） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            最近 30 日事件趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart points={data?.dailyTrend ?? []} loading={loading} />
        </CardContent>
      </Card>

      {/* 柱状图：事件类型分布 */}
      <Card>
        <CardHeader>
          <CardTitle>事件类型分布</CardTitle>
        </CardHeader>
        <CardContent>
          <EventTypeBars bars={eventTypeBars} loading={loading} />
        </CardContent>
      </Card>

      {/* 最近事件列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>最近事件</CardTitle>
            {!loading && data && (
              <span className="text-xs text-muted-foreground">共 {data.recentEvents.length} 条</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <RecentEventsList events={data?.recentEvents ?? []} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- 子组件 ----------------

interface KpiCardProps {
  testId: string;
  icon: React.ElementType;
  iconBg: string;
  iconFg: string;
  label: string;
  value: number | string;
  hint?: string;
  hintMuted?: boolean;
}

function KpiCard({ testId, icon: Icon, iconBg, iconFg, label, value, hint, hintMuted }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`w-4 h-4 ${iconFg}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              data-testid={testId}
              className={`text-2xl font-bold truncate ${hintMuted ? 'text-muted-foreground' : 'text-foreground'}`}
              title={typeof value === 'string' ? value : undefined}
            >
              {value}
            </p>
            {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TrendChartProps {
  points: Array<{ date: string; count: number }>;
  loading: boolean;
}

/** 折线图（伪 SVG，无依赖）：N 个点 + 折线。高度按 max 归一化。 */
function TrendChart({ points, loading }: TrendChartProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        加载趋势数据...
      </div>
    );
  }
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">暂无趋势数据</p>;
  }
  const max = Math.max(1, ...points.map((p) => p.count));
  const W = 100;
  const H = 120;
  const stepX = W / Math.max(1, points.length - 1);
  const polyPoints = points
    .map((p, i) => {
      const x = i * stepX;
      const y = H - (p.count / max) * (H - 8) - 4;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <div className="w-full" data-testid="trend-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-32"
        role="img"
        aria-label="最近 30 日事件趋势"
      >
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-emerald-500"
          points={polyPoints}
        />
        {points.map((p, i) => {
          const x = i * stepX;
          const y = H - (p.count / max) * (H - 8) - 4;
          return <circle key={p.date} cx={x} cy={y} r={0.6} className="fill-emerald-500" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-mono">
        <span>{points[0]?.date}</span>
        <span>峰值 {max}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

interface EventTypeBarsProps {
  bars: Array<{ name: string; label: string; count: number }>;
  loading: boolean;
}

/** 横向条形图（Tailwind 宽度百分比）。 */
function EventTypeBars({ bars, loading }: EventTypeBarsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        加载分布数据...
      </div>
    );
  }
  if (bars.every((b) => b.count === 0)) {
    return <p className="text-sm text-muted-foreground py-8 text-center">暂无事件</p>;
  }
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="space-y-2" data-testid="type-bars">
      {bars.map((b) => {
        const pct = (b.count / max) * 100;
        return (
          <div key={b.name} className="flex items-center gap-3 text-xs">
            <span className="w-24 text-muted-foreground shrink-0">{b.label}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/80 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 text-right text-foreground font-mono">{b.count}</span>
          </div>
        );
      })}
    </div>
  );
}

interface RecentEventsListProps {
  events: AnalyticsOverview['recentEvents'];
  loading: boolean;
}

function RecentEventsList({ events, loading }: RecentEventsListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        加载事件列表...
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center border-t border-border">
        暂无事件记录
      </p>
    );
  }
  return (
    <div className="border-t border-border divide-y divide-border/60 max-h-[420px] overflow-y-auto">
      {events.map((e, i) => {
        const label = EVENT_LABEL[e.type] ?? e.type;
        return (
          <div
            key={`${e.timestamp}-${i}`}
            className="flex items-center gap-3 px-6 py-2.5 text-xs"
            data-testid="event-row"
          >
            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Badge variant="secondary" className="font-mono shrink-0">
              {label}
            </Badge>
            <span className="font-mono text-muted-foreground shrink-0">
              {formatEventTime(e.timestamp)}
            </span>
            <span className="text-muted-foreground truncate flex-1" title={formatRelativeTime(new Date(e.timestamp).toISOString())}>
              {e.data ? JSON.stringify(e.data) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
