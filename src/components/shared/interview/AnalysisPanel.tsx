'use client';

import { useState } from 'react';
import {
  Lightbulb,
  Target,
  ThumbsUp,
  AlertTriangle,
  BookOpen,
  AlertCircle,
  FileText,
  Star,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/shared/utils/utils';
import type { ComprehensiveAnalysis, PerQuestionAnalysis } from '@/shared/types/interview';

interface Props {
  analysis: ComprehensiveAnalysis;
}

function QuestionAnalysisCard({ qa, index }: { qa: PerQuestionAnalysis; index: number }) {
  return (
    <div className="space-y-4">
      {/* Question header */}
      <div className="flex items-start gap-2">
        <Badge variant="outline" className="shrink-0 mt-0.5">
          Q{index + 1}
        </Badge>
        <p className="text-sm font-medium text-foreground">{qa.question}</p>
      </div>

      {/* Intent explanation */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
            <Target className="h-4 w-4" />
            考察意图
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-emerald-800">{qa.intent}</p>
        </CardContent>
      </Card>

      {/* Evaluation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-emerald-500" />
              优点
            </CardTitle>
          </CardHeader>
          <CardContent>
            {qa.evaluation.strengths.length > 0 ? (
              <ul className="space-y-1.5">
                {qa.evaluation.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-emerald-500 shrink-0">&#10003;</span>
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">暂无评价</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              不足
            </CardTitle>
          </CardHeader>
          <CardContent>
            {qa.evaluation.weaknesses.length > 0 ? (
              <ul className="space-y-1.5">
                {qa.evaluation.weaknesses.map((w, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-amber-500 shrink-0">&#9888;</span>
                    {w}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">暂无评价</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Improved answer */}
      <Card className="border-emerald-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
            <Lightbulb className="h-4 w-4" />
            改进建议
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-emerald-800 whitespace-pre-wrap">
            {qa.improvedAnswer}
          </p>
        </CardContent>
      </Card>

      {/* Knowledge points */}
      {qa.knowledgePoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              相关知识点
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {qa.knowledgePoints.map((kp, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {kp}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AnalysisPanel({ analysis }: Props) {
  const [activeTab, setActiveTab] = useState('q0');

  const scoreColor = analysis.overallScore >= 8
    ? 'text-emerald-500'
    : analysis.overallScore >= 6
    ? 'text-amber-500'
    : 'text-red-500';

  const scoreLabel = analysis.overallScore >= 9
    ? '优秀'
    : analysis.overallScore >= 7
    ? '良好'
    : analysis.overallScore >= 5
    ? '一般'
    : '需提升';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Overall header */}
      <Card className="text-center">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm text-muted-foreground mb-1">综合分析评分</p>
          <div className={cn('text-6xl font-bold', scoreColor)}>
            {analysis.overallScore.toFixed(1)}
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'mt-2',
              analysis.overallScore >= 8
                ? 'bg-emerald-100 text-emerald-700'
                : analysis.overallScore >= 6
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
            )}
          >
            {scoreLabel}
          </Badge>
          {analysis.summary && (
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              {analysis.summary}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-question tabbed analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            逐题分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 flex-wrap h-auto">
              {analysis.perQuestionAnalysis.map((_, i) => (
                <TabsTrigger key={i} value={`q${i}`} className="text-xs">
                  Q{i + 1}
                </TabsTrigger>
              ))}
            </TabsList>
            {analysis.perQuestionAnalysis.map((qa, i) => (
              <TabsContent key={i} value={`q${i}`}>
                <QuestionAnalysisCard qa={qa} index={i} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Common issues */}
      {analysis.commonIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              共性问题
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.commonIssues.map((issue, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="text-amber-500 font-bold shrink-0">{i + 1}.</span>
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Resume gaps */}
      {analysis.resumeGaps && analysis.resumeGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              简历关联问题
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.resumeGaps.map((gap, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  {gap}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}