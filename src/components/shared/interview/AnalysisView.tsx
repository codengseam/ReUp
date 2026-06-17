'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, AlertCircle, Sparkles, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { QuestionCard, NumberedListCard, type QuestionAnalysis } from './analysis-helpers';
import type { InterviewTranscript } from '@/features/interview/transcript';

interface ComprehensiveAnalysis {
  transcriptId: string;
  questionAnalyses: QuestionAnalysis[];
  commonIssues: string[];
  trendAnalysis: string;
  resumeGaps: string[];
  overallSuggestions: string[];
}

type AnalysisProgress =
  | { type: 'question_start'; index: number; total: number }
  | { type: 'question_done'; index: number; total: number; analysis: QuestionAnalysis }
  | { type: 'comprehensive_start' }
  | {
      type: 'comprehensive_done';
      commonIssues: string[];
      trendAnalysis: string;
      resumeGaps: string[];
      overallSuggestions: string[];
    }
  | { type: 'complete'; result: ComprehensiveAnalysis }
  | { type: 'error'; message?: string };

interface Props {
  transcript: InterviewTranscript;
  onBack: () => void;
}

export default function AnalysisView({ transcript, onBack }: Props) {
  const [progress, setProgress] = useState<AnalysisProgress[]>([]);
  const [result, setResult] = useState<ComprehensiveAnalysis | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const controller = new AbortController();
    setProgress([]);
    setResult(null);
    setError('');
    setDone(false);

    (async () => {
      try {
        const res = await fetch('/api/interview/transcript/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcriptId: transcript.id }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload) as AnalysisProgress;
              setProgress((prev) => [...prev, evt]);
              if (evt.type === 'complete') {
                setResult(evt.result);
                setDone(true);
              } else if (evt.type === 'error') {
                setError(evt.message ?? '分析失败');
                setDone(true);
              }
            } catch {
              // ignore malformed event
            }
          }
        }
        setDone(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : '分析请求失败');
        setDone(true);
      }
    })();

    return () => controller.abort();
  }, [transcript.id]);

  const latestQuestionIndex = (() => {
    for (let i = progress.length - 1; i >= 0; i--) {
      const evt = progress[i];
      if (evt.type === 'question_done') return evt.index;
    }
    return -1;
  })();

  const completedQuestions = progress.filter(
    (e): e is Extract<AnalysisProgress, { type: 'question_done' }> => e.type === 'question_done',
  );

  const comprehensive = progress.find(
    (e): e is Extract<AnalysisProgress, { type: 'comprehensive_done' }> =>
      e.type === 'comprehensive_done',
  );

  const totalQuestions = transcript.questions.length;
  const currentQuestionNumber = Math.min(latestQuestionIndex + 2, totalQuestions);

  return (
    <div className="space-y-4 max-w-3xl mx-auto" data-testid="analysis-view">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1" data-testid="analysis-back">
          <ArrowLeft className="h-4 w-4" />返回列表
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {transcript.company || '未知公司'}
            {transcript.position ? ` · ${transcript.position}` : ''}
          </h2>
          {transcript.round && <p className="text-xs text-muted-foreground">{transcript.round}</p>}
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-6 flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {!done && !error && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>正在分析第 {currentQuestionNumber} / {totalQuestions} 个问题...</span>
          </CardContent>
        </Card>
      )}

      {result && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">总览</TabsTrigger>
            <TabsTrigger value="per-question">逐题 ({result.questionAnalyses.length})</TabsTrigger>
            <TabsTrigger value="common">共性问题</TabsTrigger>
            <TabsTrigger value="suggestions">改进建议</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {result.trendAnalysis && (
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-emerald-700">
                    <Sparkles className="h-4 w-4" />趋势分析
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-emerald-800 whitespace-pre-wrap">{result.trendAnalysis}</p>
                </CardContent>
              </Card>
            )}
            {result.resumeGaps.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />简历弱项
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {result.resumeGaps.map((g, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-amber-500 shrink-0">•</span>{g}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="per-question" className="mt-4 space-y-4">
            {result.questionAnalyses.length === 0 && (
              <p className="text-sm text-muted-foreground">暂无逐题分析</p>
            )}
            {result.questionAnalyses.map((qa, i) => <QuestionCard key={i} index={i} analysis={qa} />)}
          </TabsContent>

          <TabsContent value="common" className="mt-4">
            <NumberedListCard
              items={comprehensive?.commonIssues ?? []}
              emptyText={done ? '暂无' : '分析中...'}
            />
          </TabsContent>

          <TabsContent value="suggestions" className="mt-4">
            <NumberedListCard
              items={comprehensive?.overallSuggestions ?? []}
              emptyText={done ? '暂无' : '分析中...'}
            />
          </TabsContent>
        </Tabs>
      )}

      {!result && done && !error && (
        <p className="text-sm text-muted-foreground">本次分析没有返回结果。</p>
      )}

      {completedQuestions.length > 0 && !result && (
        <p className="text-xs text-muted-foreground" data-testid="analysis-progress-count">
          已完成 {completedQuestions.length} / {totalQuestions} 个问题
        </p>
      )}
    </div>
  );
}
