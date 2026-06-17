'use client';

import {
  Check,
  Copy,
  GitCompare,
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { computeLineDiff, type DiffLine } from '@/lib/resume/diff';
import {
  STAR_SECTIONS,
  type StarSection,
  type StarRewriteResult,
} from '@/lib/resume/star-rewriter';
import type { ResumeDocument } from '@/lib/resume/types';

interface StreamingResultProps {
  resume: ResumeDocument;
  onComplete?: (result: StarRewriteResult) => void;
}

export function StreamingResult({ resume, onComplete }: StreamingResultProps) {
  const [sections, setSections] = useState<Record<StarSection, string>>({
    '我的分析': '',
    'STAR改写': '',
    '底层心法': '',
    '建议': '',
  });
  const [originals, setOriginals] = useState<Record<StarSection, string>>({
    '我的分析': '',
    'STAR改写': '',
    '底层心法': '',
    '建议': '',
  });
  const [completed, setCompleted] = useState<Set<StarSection>>(new Set());
  const [confidence, setConfidence] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<StarSection | null>(null);
  const [diffOpen, setDiffOpen] = useState<Set<StarSection>>(new Set());
  const [rewriting, setRewriting] = useState<Set<StarSection>>(new Set());
  const [feedback, setFeedback] = useState<Record<StarSection, 'up' | 'down' | null>>({
    '我的分析': null,
    'STAR改写': null,
    '底层心法': null,
    '建议': null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const sectionsRef = useRef<Record<StarSection, string>>({
    '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '',
  });

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    mountedRef.current = true;
    sectionsRef.current = { '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' };
    setSections({ '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' });
    setOriginals({ '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' });
    setCompleted(new Set());
    setConfidence(null);
    setIsStreaming(true);
    setError(null);
    setDiffOpen(new Set());
    setRewriting(new Set());
    setFeedback({ '我的分析': null, 'STAR改写': null, '底层心法': null, '建议': null });

    (async () => {
      // Auto-abort after 3 minutes if LLM is stuck
      const autoTimeout = setTimeout(() => controller.abort(), 180_000);
      try {
        const res = await fetch('/api/resume/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `API error ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const dataLine = line.replace(/^data: /, '');
            if (!dataLine) continue;

            // Parse JSON in a separate try/catch so malformed frames are
            // skipped but legitimate errors (type: 'error') propagate.
            type SseMsg = {
              type: string;
              section?: StarSection;
              delta?: string;
              done?: boolean;
              error?: string;
            };
            let msg: SseMsg;
            try {
              msg = JSON.parse(dataLine) as SseMsg;
            } catch {
              // skip malformed frames
              continue;
            }

            if (msg.type === 'chunk' && msg.section && msg.delta !== undefined) {
              sectionsRef.current[msg.section] += msg.delta;
              if (!mountedRef.current) break;
              setSections((prev) => ({
                ...prev,
                [msg.section!]: prev[msg.section!] + msg.delta!,
              }));
              if (msg.done) {
                if (!mountedRef.current) break;
                setCompleted((prev) => {
                  const next = new Set(prev);
                  next.add(msg.section!);
                  return next;
                });
                setOriginals((prev) => {
                  if (prev[msg.section!]) return prev;
                  return { ...prev, [msg.section!]: sectionsRef.current[msg.section!] };
                });
              }
            } else if (msg.type === 'done') {
              if (!mountedRef.current) break;
              const totalChars = Object.values(sectionsRef.current).reduce(
                (sum, t) => sum + t.length, 0,
              );
              const conf = Math.min(1, totalChars / 2000);
              setConfidence(conf);
              onComplete?.({
                sections: { ...sectionsRef.current },
                confidence: conf,
              });
            } else if (msg.type === 'error') {
              throw new Error(msg.error ?? 'STAR rewrite failed');
            }
          }
        }
      } catch (err) {
        clearTimeout(autoTimeout);
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (mountedRef.current) {
            setError('STAR \u91cd\u5199\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5');
          }
          return;
        }
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(autoTimeout);
        if (!controller.signal.aborted && mountedRef.current) {
          setIsStreaming(false);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleCopy = useCallback(
    async (section: StarSection) => {
      const text = sections[section];
      if (!text) return;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setCopied(section);
        setTimeout(() => {
          setCopied((cur) => (cur === section ? null : cur));
        }, 1500);
      } catch {
        // ignore
      }
    },
    [sections]
  );

  const handleRewrite = useCallback(
    async (section: StarSection) => {
      const currentText = sections[section];
      if (!currentText) return;
      setRewriting((prev) => {
        const next = new Set(prev);
        next.add(section);
        return next;
      });
      try {
        const res = await fetch('/api/resume/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume, section, currentText }),
        });
        const json = (await res.json()) as { text?: string; confidence?: number; error?: string };
        if (json.error) throw new Error(json.error);
        if (json.text) {
          setSections((prev) => ({ ...prev, [section]: json.text! }));
        }
        if (json.confidence !== undefined) {
          setConfidence(json.confidence);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRewriting((prev) => {
          const next = new Set(prev);
          next.delete(section);
          return next;
        });
      }
    },
    [resume, sections]
  );

  const toggleDiff = useCallback((section: StarSection) => {
    setDiffOpen((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const sendFeedback = useCallback(
    async (section: StarSection, vote: 'up' | 'down') => {
      const currentText = sections[section];
      const payload =
        vote === 'up'
          ? {
              messageId: section,
              conversationId: 'resume',
              reason: 'good' as const,
              response: currentText,
            }
          : {
              messageId: section,
              conversationId: 'resume',
              reason: 'other' as const,
              comment: 'dislike',
              response: currentText,
            };
      setFeedback((prev) => ({ ...prev, [section]: vote }));
      try {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn('[StreamingResult] feedback POST failed:', err);
      }
    },
    [sections]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          STAR 重写结果
        </div>
        <div className="flex items-center gap-1.5">
          {isStreaming && !error && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              AI 生成中...
            </span>
          )}
          {confidence !== null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-accent-foreground font-mono">
              置信度 {confidence.toFixed(2)}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">
            {completed.size} / 4 已完成
          </span>
          {isStreaming && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleCancel}>
              取消
            </Button>
          )}
        </div>
      </div>

      {error && !isStreaming && (
        <div role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-3">
          {error}
        </div>
      )}

      {/* 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2">
        {STAR_SECTIONS.map((section) => (
          <SectionCard
            key={section}
            section={section}
            text={sections[section]}
            originalText={originals[section]}
            isDone={completed.has(section)}
            isCopied={copied === section}
            isDiffOpen={diffOpen.has(section)}
            isRewriting={rewriting.has(section)}
            feedbackVote={feedback[section]}
            onCopy={() => { void handleCopy(section); }}
            onRewrite={() => { void handleRewrite(section); }}
            onToggleDiff={() => { toggleDiff(section); }}
            onFeedback={(vote) => { void sendFeedback(section, vote); }}
          />
        ))}
      </div>
    </div>
  );
}

interface SectionCardProps {
  section: StarSection;
  text: string;
  originalText: string;
  isDone: boolean;
  isCopied: boolean;
  isDiffOpen: boolean;
  isRewriting: boolean;
  feedbackVote: 'up' | 'down' | null;
  onCopy: () => void;
  onRewrite: () => void;
  onToggleDiff: () => void;
  onFeedback: (vote: 'up' | 'down') => void;
}

function SectionCard({
  section,
  text,
  originalText,
  isDone,
  isCopied,
  isDiffOpen,
  isRewriting,
  feedbackVote,
  onCopy,
  onRewrite,
  onToggleDiff,
  onFeedback,
}: SectionCardProps): ReactNode {
  const isEmpty = text.length === 0;
  const diffLines: DiffLine[] = isDiffOpen && originalText ? computeLineDiff(originalText, text) : [];

  return (
    <div className="border border-border rounded-lg p-3 bg-muted/30 min-h-[130px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-foreground">【{section}】</span>
          {isEmpty || !isDone || isRewriting ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-[9px] px-1 py-0.5 rounded bg-primary-container text-accent-foreground">
              done
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={onCopy}
          disabled={isEmpty}
          aria-label={`复制 ${section}`}
          title="复制"
        >
          {isCopied ? (
            <Check className="w-3 h-3 text-primary" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </Button>
      </div>

      {/* Content */}
      {isEmpty ? (
        <div className="space-y-1.5 mt-1">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-5/6" />
          <Skeleton className="h-2.5 w-4/6" />
        </div>
      ) : (
        <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed flex-1 line-clamp-6">
          {text}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 pt-1.5 mt-1.5 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={onRewrite}
          disabled={isEmpty || isRewriting}
          aria-label={`重写此段 ${section}`}
          title="重写此段"
        >
          {isRewriting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={onToggleDiff}
          disabled={isEmpty || !originalText}
          aria-label={`查看 ${section} 差异`}
          title="查看差异"
          data-state={isDiffOpen ? 'open' : 'closed'}
        >
          <GitCompare className="w-3 h-3" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => { onFeedback('up'); }}
          disabled={isEmpty}
          aria-label={`点赞 ${section}`}
        >
          <ThumbsUp
            className={`w-3 h-3 ${feedbackVote === 'up' ? 'text-emerald-600 fill-emerald-600' : ''}`}
          />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => { onFeedback('down'); }}
          disabled={isEmpty}
          aria-label={`点踩 ${section}`}
        >
          <ThumbsDown
            className={`w-3 h-3 ${feedbackVote === 'down' ? 'text-red-600 fill-red-600' : ''}`}
          />
        </Button>
      </div>

      {/* Diff panel */}
      {isDiffOpen && originalText && (
        <div className="rounded border border-border bg-background p-2 text-[10px] font-mono space-y-0.5 max-h-36 overflow-y-auto mt-1.5">
          {diffLines.length === 0 ? (
            <span className="text-muted-foreground">无差异</span>
          ) : (
            diffLines.map((line, i) => (
              <DiffLineRow key={i} line={line} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }): ReactNode {
  if (line.type === 'added') {
    return (
      <div className="bg-emerald-50 text-emerald-900 px-1 py-0.5 rounded">+ {line.text}</div>
    );
  }
  if (line.type === 'removed') {
    return (
      <div className="bg-red-50 text-red-900 line-through px-1 py-0.5 rounded">
        - {line.text}
      </div>
    );
  }
  return <div className="text-muted-foreground px-1 py-0.5">  {line.text}</div>;
}
