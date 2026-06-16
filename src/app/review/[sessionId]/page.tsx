'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  AlertTriangle,
  ClipboardList,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { ReviewResult } from '@/lib/review/types';

const VERDICT_LABELS: Record<string, string> = {
  strong_hire: '强烈推荐',
  hire: '推荐录用',
  lean_hire: '倾向录用',
  lean_no_hire: '倾向不录用',
  no_hire: '不推荐',
  strong_no_hire: '强烈不推荐',
};

const VERDICT_COLORS: Record<string, string> = {
  strong_hire: 'bg-green-500 hover:bg-green-500 text-white',
  hire: 'bg-emerald-500 hover:bg-emerald-500 text-white',
  lean_hire: 'bg-blue-500 hover:bg-blue-500 text-white',
  lean_no_hire: 'bg-amber-500 hover:bg-amber-500 text-white',
  no_hire: 'bg-orange-500 hover:bg-orange-500 text-white',
  strong_no_hire: 'bg-red-500 hover:bg-red-500 text-white',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500 text-red-600',
  major: 'border-amber-500 text-amber-600',
  minor: 'border-blue-500 text-blue-600',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  major: '重要',
  minor: '次要',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-blue-100 text-blue-700',
};

const DIMENSION_LABELS: Record<string, string> = {
  technicalDepth: '技术深度',
  communication: '表达清晰度',
  problemSolving: '思维结构',
  projectMastery: '项目掌握',
  behavioralFit: '行为匹配',
  systemDesign: '系统设计',
};

export default function ReviewDetailPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;

  const [review, setReview] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const fetchReview = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/review/${sessionId}`);
        if (res.status === 404) {
          setError('未找到该面试复盘');
          return;
        }
        if (!res.ok) {
          throw new Error(`请求失败 (${res.status})`);
        }
        const data = await res.json();
        setReview(data.review);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchReview();
  }, [sessionId]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-8">
            <Link href="/" className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <h1 className="text-xl font-semibold text-foreground">面试复盘</h1>
          </div>
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            <span className="ml-3 text-muted-foreground">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-8">
            <Link href="/" className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <h1 className="text-xl font-semibold text-foreground">面试复盘</h1>
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">{error}</p>
              <Link
                href="/"
                className="inline-block mt-4 text-sm text-primary hover:underline"
              >
                返回首页
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Not found (no review data)
  if (!review) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-8">
            <Link href="/" className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <h1 className="text-xl font-semibold text-foreground">面试复盘</h1>
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-lg">未找到复盘数据</p>
              <Link
                href="/"
                className="inline-block mt-4 text-sm text-primary hover:underline"
              >
                返回首页
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const dimensions = review.dimensions;
  const dimEntries = Object.entries(dimensions).filter(
    ([, v]) => v !== undefined
  ) as [string, number][];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href="/" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">面试复盘</h1>
        </div>

        {/* Score & Verdict */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">
                  {review.overallScore.toFixed(1)}
                </span>
                <span className="text-sm text-muted-foreground">/ 10</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className={`${VERDICT_COLORS[review.overallVerdict] ?? 'bg-muted text-muted-foreground'} text-sm px-3 py-1`}
                >
                  {VERDICT_LABELS[review.overallVerdict] ?? review.overallVerdict}
                </Badge>
              </div>
            </div>
            {review.summary && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                {review.summary}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dimension Scores */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              维度评分
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dimEntries.map(([key, value]) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {DIMENSION_LABELS[key] ?? key}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">
                    {value.toFixed(1)}
                  </span>
                </div>
                <Progress value={value * 10} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Great Moments */}
        {review.greatMoments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                亮点
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {review.greatMoments.map((moment, idx) => (
                <div key={idx} className="space-y-1.5">
                  <p className="text-sm text-foreground leading-relaxed">
                    &ldquo;{moment.snippet}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground">{moment.why}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Top Issues */}
        {review.topIssues.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                问题
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {review.topIssues.map((issue, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${SEVERITY_COLORS[issue.severity] ?? ''}`}
                    >
                      {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {issue.category}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {issue.problem}
                  </p>
                  {issue.snippet && (
                    <p className="text-sm text-muted-foreground italic">
                      &ldquo;{issue.snippet}&rdquo;
                    </p>
                  )}
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    建议：{issue.suggestion}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Per-Question Feedback */}
        {review.perQuestionFeedback.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" />
                逐题反馈
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {review.perQuestionFeedback.map((fb, idx) => (
                <div key={idx} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      题目 {idx + 1}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {fb.score.toFixed(1)} 分
                    </Badge>
                  </div>

                  {/* Evaluation breakdown */}
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(fb.evaluation).map(([ek, ev]) => (
                      <div key={ek} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {ek === 'accuracy' ? '准确性' : ek === 'depth' ? '深度' : ek === 'clarity' ? '清晰度' : '结构'}
                        </span>
                        <span className="text-foreground tabular-nums">{ev.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>

                  {/* What went well */}
                  {fb.whatWentWell.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                        做得好的地方
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {fb.whatWentWell.map((item, wi) => (
                          <li key={wi} className="text-sm text-muted-foreground">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* What to improve */}
                  {fb.whatToImprove.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                        需要改进
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {fb.whatToImprove.map((item, wi) => (
                          <li key={wi} className="text-sm text-muted-foreground">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Model answer */}
                  {fb.modelAnswer && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        参考回答
                      </p>
                      <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3 leading-relaxed">
                        {fb.modelAnswer}
                      </p>
                    </div>
                  )}

                  {idx < review.perQuestionFeedback.length - 1 && (
                    <hr className="border-border" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Actionable Items */}
        {review.actionableItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                行动建议
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {review.actionableItems.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`text-xs ${PRIORITY_COLORS[item.priority] ?? ''}`}
                    >
                      {item.priority}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    预计耗时：{item.estimatedHours} 小时
                  </p>
                  {item.resources && item.resources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.resources.map((res, ri) => (
                        <span
                          key={ri}
                          className="text-xs bg-muted text-muted-foreground rounded px-2 py-0.5"
                        >
                          {res}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Trace info */}
        <div className="text-xs text-muted-foreground text-center pb-8">
          模型：{review.trace.modelUsed} · Token：{review.trace.inputTokens}+{review.trace.outputTokens} · 耗时：{review.trace.totalLatencyMs}ms
          {review.trace.ragChunksUsed > 0 && <> · 知识库片段：{review.trace.ragChunksUsed}</>}
        </div>
      </div>
    </div>
  );
}