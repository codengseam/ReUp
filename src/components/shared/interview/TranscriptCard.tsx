'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, Building2, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/shared/utils/utils';
import type { InterviewTranscript } from '@/shared/types/interview';

interface Props {
  transcript: InterviewTranscript;
  onAnalyze: (id: string) => void;
}

const RESULT_LABELS: Record<string, { label: string; className: string }> = {
  passed: { label: '通过', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  failed: { label: '未通过', className: 'bg-red-100 text-red-700 border-red-200' },
  waiting: { label: '等待结果', className: 'bg-amber-100 text-amber-700 border-amber-200' },
};

export default function TranscriptCard({ transcript, onAnalyze }: Props) {
  const [expanded, setExpanded] = useState(false);

  const resultStyle = transcript.result
    ? RESULT_LABELS[transcript.result]
    : undefined;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {transcript.company || '未知公司'}
              {transcript.position && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {transcript.position}
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {transcript.round && (
                <Badge variant="outline" className="gap-1">
                  <Hash className="h-3 w-3" />
                  {transcript.round}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {transcript.questions.length} 个问题
              </Badge>
              {resultStyle && (
                <Badge
                  variant="outline"
                  className={cn('text-xs', resultStyle.className)}
                >
                  {resultStyle.label}
                </Badge>
              )}
            </div>
          </div>
          <Button
            onClick={() => onAnalyze(transcript.id)}
            size="sm"
            className="gap-1.5 shrink-0"
          >
            <Search className="h-3.5 w-3.5" />
            深度分析
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Expandable questions */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? '收起问题列表' : '展开问题列表'}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {transcript.questions.map((q, i) => (
              <div
                key={q.questionId}
                className="rounded-lg border border-border p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs shrink-0">
                    Q{i + 1}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">
                    {q.question}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">
                    {q.category}
                  </Badge>
                  <span>难度: {q.difficulty}/5</span>
                </div>
                {q.userAnswer && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    <span className="font-medium text-foreground">我的回答：</span>
                    {q.userAnswer.length > 150
                      ? q.userAnswer.slice(0, 150) + '...'
                      : q.userAnswer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}