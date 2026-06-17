'use client';

import { TrendingUp, AlertCircle, Sparkles, PenLine } from 'lucide-react';
import type { MatchReport, ATSResult } from '@/features/resume/types';

interface Props {
  matchReport: MatchReport;
  atsResult: ATSResult;
}

export function MatchGauge({ matchReport, atsResult }: Props) {
  const matchPercentage = computeMatchPercentage(matchReport);
  const atsPercentage = atsResult.coverage.percentage;

  return (
    <div className="space-y-4">
      {/* Gauges Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Match Score Gauge */}
        <div className="flex flex-col items-center p-4 rounded-xl border border-border bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            综合匹配度
          </p>
          <CircularGauge value={matchPercentage} size={120} color="#10b981" />
          <p className="text-[11px] text-muted-foreground mt-2">
            {matchPercentage >= 80 ? '非常匹配' : matchPercentage >= 60 ? '较为匹配' : '有待提升'}
          </p>
        </div>

        {/* ATS Coverage Gauge */}
        <div className="flex flex-col items-center p-4 rounded-xl border border-border bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            ATS 覆盖率
          </p>
          <CircularGauge value={atsPercentage} size={120} color={atsPercentage >= 70 ? '#10b981' : atsPercentage >= 40 ? '#f59e0b' : '#ef4444'} />
          <p className="text-[11px] text-muted-foreground mt-2">
            {atsPercentage >= 70 ? '覆盖良好' : atsPercentage >= 40 ? '需要补充' : '覆盖不足'}
          </p>
        </div>
      </div>

      {/* Strengths */}
      {matchReport.strengths.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <TrendingUp className="w-3 h-3 text-emerald-600" />
            优势 ({matchReport.strengths.length})
          </div>
          <ul className="space-y-1">
            {matchReport.strengths.map((s, idx) => (
              <li key={idx} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-emerald-800">{s.dimension}</p>
                  {s.evidence && (
                    <p className="text-[9px] text-emerald-700 mt-0.5 leading-relaxed">{s.evidence}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps */}
      {matchReport.gaps.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            短板 ({matchReport.gaps.length})
          </div>
          <ul className="space-y-1">
            {matchReport.gaps.map((g, idx) => (
              <li key={idx} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-100">
                <p className="text-[10px] font-medium text-amber-800">{g.dimension}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                  g.severity === 'high' ? 'bg-red-100 text-red-700' :
                  g.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {g.severity === 'high' ? '高' : g.severity === 'medium' ? '中' : '低'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top 3 Priorities */}
      {matchReport.priorities.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Sparkles className="w-3 h-3 text-primary" />
            优先优化建议 ({matchReport.priorities.length})
          </div>
          <ol className="space-y-2">
            {matchReport.priorities.map((p) => (
              <li key={p.rank} className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-border bg-muted/30">
                <span className="text-[11px] font-mono font-semibold text-foreground shrink-0 w-4">
                  {p.rank}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-foreground leading-relaxed">{p.action}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{p.expectedImpact}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                  title="一键改写（Phase 2）"
                >
                  <PenLine className="w-3 h-3" />
                  一键改写
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function CircularGauge({ value, size, color }: { value: number; size: number; color: string }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(100, Math.max(0, value));
  const offset = circumference - (clampedValue / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold text-foreground leading-none" style={{ color }}>
          {Math.round(clampedValue)}
        </span>
        <span className="text-[9px] text-muted-foreground mt-0.5">%</span>
      </div>
    </div>
  );
}

function computeMatchPercentage(report: MatchReport): number {
  const total = report.strengths.length + report.gaps.length;
  if (total === 0) return 0;
  const raw = (report.strengths.length / total) * 100;
  return Math.round(raw);
}