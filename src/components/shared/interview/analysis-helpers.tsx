'use client';

import type { ReactNode } from 'react';
import { Target, ThumbsUp, AlertTriangle, Lightbulb, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface QuestionAnalysis {
  question: string;
  answer: string;
  intent: string;
  evaluation: string;
  strengths: string[];
  weaknesses: string[];
  improvedAnswer: string;
  knowledgePoints: string[];
}

export function QuestionCard({ index, analysis: qa }: { index: number; analysis: QuestionAnalysis }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge variant="outline">Q{index + 1}</Badge>{qa.question}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {qa.intent && (
          <div className="flex items-start gap-2 text-xs">
            <Target className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">考察意图：</span>
              <span className="text-muted-foreground">{qa.intent}</span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ProsAndCons icon={<ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />} title="优点" items={qa.strengths} />
          <ProsAndCons icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />} title="不足" items={qa.weaknesses} />
        </div>
        {qa.improvedAnswer && (
          <div className="rounded border border-emerald-200 bg-emerald-50/30 p-2">
            <p className="text-xs font-medium text-emerald-700 flex items-center gap-1 mb-1">
              <Lightbulb className="h-3.5 w-3.5" />改进建议
            </p>
            <p className="text-xs text-emerald-800 whitespace-pre-wrap">{qa.improvedAnswer}</p>
          </div>
        )}
        {qa.knowledgePoints.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            {qa.knowledgePoints.map((kp, j) => (
              <Badge key={j} variant="secondary" className="text-[10px]">{kp}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProsAndCons({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground flex items-center gap-1 mb-1">
        {icon}{title}
      </p>
      {items.length > 0 ? (
        <ul className="text-xs text-muted-foreground space-y-1">
          {items.map((s, j) => <li key={j}>· {s}</li>)}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">暂无</p>
      )}
    </div>
  );
}

export function NumberedListCard({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <Card>
      <CardContent className="pt-6 space-y-2 text-sm text-muted-foreground">
        {items.map((c, i) => (
          <p key={i}><span className="font-medium text-foreground">{i + 1}. </span>{c}</p>
        ))}
      </CardContent>
    </Card>
  );
}
