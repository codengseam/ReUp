'use client';

import { useMemo } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/shared/utils/utils';

// ---------- types ----------

interface InterviewReportData {
  overallScore: number;
  phaseScores: {
    selfIntro: number;
    projectDeepDive: number;
    techAssessment: number;
    behavioral: number;
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  summary: string;
}

interface Props {
  report: InterviewReportData;
  onRestart?: () => void;
}

// ---------- radar chart (SVG) ----------

const DIMENSIONS = [
  { key: 'selfIntro' as const, label: '自我介绍' },
  { key: 'projectDeepDive' as const, label: '项目深挖' },
  { key: 'techAssessment' as const, label: '技术考察' },
  { key: 'behavioral' as const, label: '行为面试' },
];

const RADAR_SIZE = 200;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 80;
const MAX_SCORE = 10;

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: cx + r * Math.cos(angleRad - Math.PI / 2),
    y: cy + r * Math.sin(angleRad - Math.PI / 2),
  };
}

function RadarChart({ scores }: { scores: InterviewReportData['phaseScores'] }) {
  const n = DIMENSIONS.length;
  const angleStep = (2 * Math.PI) / n;

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const gridPolygons = gridLevels.map(level => {
    const points = DIMENSIONS.map((_, i) => {
      const angle = i * angleStep;
      const r = RADAR_RADIUS * level;
      const pt = polarToCartesian(RADAR_CENTER, RADAR_CENTER, r, angle);
      return `${pt.x},${pt.y}`;
    });
    return points.join(' ');
  });

  const dataPoints = DIMENSIONS.map((d, i) => {
    const score = scores[d.key];
    const angle = i * angleStep;
    const r = (score / MAX_SCORE) * RADAR_RADIUS;
    return polarToCartesian(RADAR_CENTER, RADAR_CENTER, r, angle);
  });
  const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  const labels = DIMENSIONS.map((d, i) => {
    const angle = i * angleStep;
    const pt = polarToCartesian(RADAR_CENTER, RADAR_CENTER, RADAR_RADIUS + 22, angle);
    return { ...pt, label: d.label };
  });

  return (
    <svg
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      className="w-full max-w-[200px] h-auto mx-auto"
    >
      {/* grid */}
      {gridPolygons.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-muted-foreground/30"
        />
      ))}
      {/* axis lines */}
      {DIMENSIONS.map((_, i) => {
        const angle = i * angleStep;
        const pt = polarToCartesian(RADAR_CENTER, RADAR_CENTER, RADAR_RADIUS, angle);
        return (
          <line
            key={i}
            x1={RADAR_CENTER}
            y1={RADAR_CENTER}
            x2={pt.x}
            y2={pt.y}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-muted-foreground/30"
          />
        );
      })}
      {/* data polygon */}
      <polygon
        points={dataPolygon}
        fill="#10b981"
        fillOpacity="0.25"
        stroke="#10b981"
        strokeWidth="1.5"
      />
      {/* data points */}
      {dataPoints.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r="3"
          fill="#10b981"
        />
      ))}
      {/* labels */}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground text-[10px]"
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
}

// ---------- component ----------

export default function InterviewReport({ report, onRestart }: Props) {
  const { overallScore, phaseScores, strengths, weaknesses, suggestions, summary } =
    report;

  const scoreColor = useMemo(() => {
    if (overallScore >= 8) return 'text-emerald-500';
    if (overallScore >= 6) return 'text-amber-500';
    return 'text-red-500';
  }, [overallScore]);

  const scoreLabel = useMemo(() => {
    if (overallScore >= 9) return '优秀';
    if (overallScore >= 7) return '良好';
    if (overallScore >= 5) return '一般';
    return '需提升';
  }, [overallScore]);

  return (
    <div className="space-y-6">
      {/* overall score */}
      <Card className="text-center">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm text-muted-foreground mb-1">面试综合评分</p>
          <div className={cn('text-6xl font-bold', scoreColor)}>
            {overallScore.toFixed(1)}
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'mt-2',
              overallScore >= 8
                ? 'bg-emerald-100 text-emerald-700'
                : overallScore >= 6
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
            )}
          >
            {scoreLabel}
          </Badge>
          {summary && (
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              {summary}
            </p>
          )}
        </CardContent>
      </Card>

      {/* radar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">各阶段评分</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <RadarChart scores={phaseScores} />
        </CardContent>
      </Card>

      {/* strengths & weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              优势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {strengths.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="text-emerald-500 mt-1 shrink-0">&#10003;</span>
                  {s}
                </li>
              ))}
              {strengths.length === 0 && (
                <li className="text-sm text-muted-foreground">暂无数据</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              待改进
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {weaknesses.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="text-amber-500 mt-1 shrink-0">&#9888;</span>
                  {w}
                </li>
              ))}
              {weaknesses.length === 0 && (
                <li className="text-sm text-muted-foreground">暂无数据</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            改进建议
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="text-primary font-bold shrink-0">
                  {i + 1}.
                </span>
                {s}
              </li>
            ))}
            {suggestions.length === 0 && (
              <li className="text-sm text-muted-foreground">暂无数据</li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* restart */}
      {onRestart && (
        <div className="flex justify-center">
          <Button onClick={onRestart} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            再练一次
          </Button>
        </div>
      )}
    </div>
  );
}