'use client';

import { ChevronUp, ChevronDown, Eye, Trash2, Building2, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/utils/utils';
import type { InterviewTranscript } from '@/features/interview/transcript';

const RESULT_LABEL: Record<string, string> = {
  通过: '通过',
  未通过: '未通过',
  等待结果: '等待结果',
  passed: '通过',
  failed: '未通过',
  waiting: '等待结果',
};

const RESULT_BADGE: Record<string, string> = {
  通过: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  未通过: 'bg-red-100 text-red-700 border-red-200',
  等待结果: 'bg-amber-100 text-amber-700 border-amber-200',
  passed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  waiting: 'bg-amber-100 text-amber-700 border-amber-200',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

interface ItemProps {
  transcript: InterviewTranscript;
  isExpanded: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRequestDelete: (id: string) => void;
  canDelete: boolean;
}

export default function TranscriptListItem({
  transcript: t,
  isExpanded: isOpen,
  onSelect,
  onToggle,
  onRequestDelete,
  canDelete,
}: ItemProps) {
  const resultLabel = t.result ? RESULT_LABEL[t.result] ?? t.result : null;
  const resultClass = t.result ? RESULT_BADGE[t.result] : null;
  return (
    <li
      data-testid="transcript-list-item"
      className="rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelect(t.id)}
          className="flex-1 min-w-0 text-left"
          data-testid="transcript-list-item-body"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold text-foreground">
              {t.company || '未知公司'}
            </span>
            {t.position && (
              <span className="text-sm text-muted-foreground">· {t.position}</span>
            )}
            {t.round && (
              <Badge variant="outline" className="text-xs">{t.round}</Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(t.createdAt)}
            </span>
            <span>{t.questions.length} 个问题</span>
            {resultLabel && resultClass && (
              <Badge variant="outline" className={cn('text-xs', resultClass)}>
                {resultLabel}
              </Badge>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onToggle(t.id)}
            aria-label={isOpen ? '收起问题' : '展开问题'}
            data-testid="transcript-list-toggle"
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelect(t.id)}
            className="gap-1"
            data-testid="transcript-list-view"
          >
            <Eye className="h-3.5 w-3.5" />
            查看/分析
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRequestDelete(t.id)}
              aria-label="删除面经"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              data-testid="transcript-list-delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {t.questions.length === 0 ? (
            <p className="text-xs text-muted-foreground">（无问题）</p>
          ) : (
            t.questions.map((q, i) => (
              <div key={i} className="rounded border border-border/60 p-2 text-xs space-y-1">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-[10px] shrink-0">Q{i + 1}</Badge>
                  <span className="text-foreground">{q.question}</span>
                </div>
                <p className="text-muted-foreground line-clamp-2 pl-7">
                  {q.answer}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </li>
  );
}
