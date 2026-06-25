'use client';

import { useMemo, useState, useEffect } from 'react';
import { Search, Trophy, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import TranscriptListItem from './TranscriptListItem';
import type { InterviewTranscript } from '@/features/interview/transcript';

type ResultFilter = 'all' | 'passed' | 'failed' | 'waiting';
type SortOrder = 'desc' | 'asc';

interface Props {
  transcripts: InterviewTranscript[];
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  loading?: boolean;
  error?: string;
}

const PAGE_SIZE = 20;

const RESULT_KEYWORDS: Record<ResultFilter, string[]> = {
  all: [],
  passed: ['通过', 'passed'],
  failed: ['未通过', 'failed'],
  waiting: ['等待结果', 'waiting'],
};

function matchesResult(transcript: InterviewTranscript, filter: ResultFilter): boolean {
  if (filter === 'all') return true;
  const value = transcript.result ?? '';
  return RESULT_KEYWORDS[filter].includes(value);
}

export default function TranscriptList({ transcripts, onSelect, onDelete, loading, error }: Props) {
  const [keyword, setKeyword] = useState('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const list = transcripts.filter((t) => {
      if (!matchesResult(t, resultFilter)) return false;
      if (!kw) return true;
      const haystack = [
        t.company ?? '',
        t.position ?? '',
        t.round ?? '',
        t.result ?? '',
        t.questions.map((q) => q.question).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(kw);
    });
    list.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? tb - ta : ta - tb;
    });
    return list;
  }, [transcripts, keyword, resultFilter, sortOrder]);

  // Reset visible count when filter inputs change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [keyword, resultFilter, sortOrder]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const canDelete = Boolean(onDelete);

  const pendingDelete = pendingDeleteId
    ? transcripts.find((t) => t.id === pendingDeleteId)
    : null;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          我的面经
          {!loading && (
            <Badge variant="secondary" className="ml-2">
              共 {transcripts.length} 条
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索公司、职位、问题..."
              className="pl-9"
              data-testid="transcript-list-search"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={resultFilter} onValueChange={(v) => setResultFilter(v as ResultFilter)}>
            <SelectTrigger className="w-full sm:w-36" data-testid="transcript-list-result-filter">
              <SelectValue placeholder="结果筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部结果</SelectItem>
              <SelectItem value="passed">通过</SelectItem>
              <SelectItem value="failed">未通过</SelectItem>
              <SelectItem value="waiting">等待结果</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
            <SelectTrigger className="w-full sm:w-36" data-testid="transcript-list-sort">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">时间倒序</SelectItem>
              <SelectItem value="asc">时间正序</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p className="text-sm text-red-500" data-testid="transcript-list-error">{error}</p>
        )}

        {loading && (
          <p className="text-sm text-muted-foreground" data-testid="transcript-list-loading">加载中...</p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground" data-testid="transcript-list-empty">
            {transcripts.length === 0
              ? '暂无面经。先在「上传面经」卡片里提交一份吧。'
              : '没有匹配的面经。试着调整搜索或筛选条件。'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="space-y-3" data-testid="transcript-list-items">
            {visible.map((t) => (
              <TranscriptListItem
                key={t.id}
                transcript={t}
                isExpanded={expanded[t.id] ?? false}
                onSelect={(id) => onSelect?.(id)}
                onToggle={(id) =>
                  setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }))
                }
                onRequestDelete={(id) => setPendingDeleteId(id)}
                canDelete={canDelete}
              />
            ))}
          </ul>
        )}

        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              data-testid="transcript-list-load-more"
            >
              加载更多（还有 {filtered.length - visibleCount} 条）
            </Button>
          </div>
        )}

        <AlertDialog
          open={pendingDeleteId !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除面经？</AlertDialogTitle>
              <AlertDialogDescription>
                将永久删除
                {pendingDelete?.company ? `「${pendingDelete.company}` : '此'}
                {pendingDelete?.position ? ` · ${pendingDelete.position}` : ''}
                {pendingDelete?.company ? '」' : ''}
                面经，此操作不可恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingDeleteId) {
                    onDelete?.(pendingDeleteId);
                    setPendingDeleteId(null);
                  }
                }}
                className="bg-red-500 hover:bg-red-600"
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
