'use client';

// src/app/resume/_components/StreamingResult.tsx
// ReUp v2 Phase 3 P0 (H4) + Phase 5 (E1-E3) integration.
//
// Streams the 4-section STAR rewrite into per-section cards. The
// Phase 5 additions wire:
// - per-section "重写此段" button (E1) — calls rewriteResumeSection
// - per-section "查看差异" button (E2) — toggles a diff panel that
//   compares the section's first-streamed text against its current
//   text using computeLineDiff
// - per-section 👍/👎 buttons (E3) — POST feedback to /api/feedback
// - onComplete callback that surfaces the final StarRewriteResult
//   to the parent for export

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { computeLineDiff, type DiffLine } from '@/lib/resume/diff';
import { rewriteResumeSection } from '@/lib/resume/iteration';
import {
  rewriteResume,
  rewriteResumeStream,
  STAR_SECTIONS,
  type StarSection,
  type StarRewriteResult,
} from '@/lib/resume/star-rewriter';
import type { ResumeDocument } from '@/lib/resume/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

interface StreamingResultProps {
  resume: ResumeDocument;
  /**
   * Fires once the final non-streaming `rewriteResume` resolves.
   * Parent uses it to feed the export pipeline. Optional so the
   * existing call site keeps working.
   */
  onComplete?: (result: StarRewriteResult) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setSections({ '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' });
    setOriginals({ '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' });
    setCompleted(new Set());
    setConfidence(null);
    setIsStreaming(true);
    setError(null);
    setDiffOpen(new Set());
    setRewriting(new Set());
    setFeedback({ '我的分析': null, 'STAR改写': null, '底层心法': null, '建议': null });

    const onChunk = (chunk: { section: StarSection; delta: string; done: boolean }): void => {
      setSections((prev) => ({
        ...prev,
        [chunk.section]: prev[chunk.section] + chunk.delta,
      }));
      if (chunk.done) {
        setCompleted((prev) => {
          const next = new Set(prev);
          next.add(chunk.section);
          return next;
        });
        // Capture the first-streamed text per section so the diff has
        // a stable baseline even after a "重写此段" round-trip.
        setOriginals((prev) => {
          if (prev[chunk.section]) return prev;
          return { ...prev, [chunk.section]: sectionsRef.current[chunk.section] };
        });
      }
    };

    // Keep a ref of the latest sections map so the chunk handler can
    // snapshot the "first done" text without re-binding the effect.
    const sectionsRef = {
      current: { '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' } as Record<StarSection, string>,
    };

    (async () => {
      try {
        for await (const chunk of rewriteResumeStream(resume, {
          signal: controller.signal,
          onChunk: (c) => {
            sectionsRef.current[c.section] = sectionsRef.current[c.section] + c.delta;
            onChunk(c);
          },
        })) {
          // chunks already delivered via onChunk
          void chunk;
        }
        if (controller.signal.aborted) return;
        const result = await rewriteResume(resume, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setConfidence(result.confidence);
        onComplete?.(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) {
          setIsStreaming(false);
        }
      }
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
    // onComplete is intentionally excluded from the deps — we don't
    // want a parent re-render to restart the entire stream.
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
        const result = await rewriteResumeSection(resume, section, currentText);
        setSections((prev) => ({ ...prev, [section]: result.text }));
        setConfidence(result.confidence);
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
      // Optimistic UI
      setFeedback((prev) => ({ ...prev, [section]: vote }));
      try {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        // best-effort — surface in console, keep optimistic state
        console.warn('[StreamingResult] feedback POST failed:', err);
      }
    },
    [sections]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            5. 重写结果（实时流式）
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {confidence !== null && (
              <Badge variant="secondary" className="font-mono">
                confidence {confidence.toFixed(2)}
              </Badge>
            )}
            <Badge variant="outline" className="font-mono">
              {completed.size} / 4 sections complete
            </Badge>
            {isStreaming && (
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                取消
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div
            role="alert"
            className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mb-3"
          >
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              onCopy={() => {
                void handleCopy(section);
              }}
              onRewrite={() => {
                void handleRewrite(section);
              }}
              onToggleDiff={() => {
                toggleDiff(section);
              }}
              onFeedback={(vote) => {
                void sendFeedback(section, vote);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section card
// ---------------------------------------------------------------------------

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
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 min-h-[160px] flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">【{section}】</span>
          {isEmpty || !isDone || isRewriting ? (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              done
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCopy}
          disabled={isEmpty}
          aria-label={`复制 ${section}`}
          title="复制"
        >
          {isCopied ? (
            <Check className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
      {isEmpty ? (
        <div className="space-y-2 mt-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
      ) : (
        <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed flex-1">
          {text}
        </p>
      )}
      <div className="flex items-center gap-1 pt-1 border-t border-border/50">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRewrite}
          disabled={isEmpty || isRewriting}
          aria-label={`重写此段 ${section}`}
          title="重写此段"
        >
          {isRewriting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleDiff}
          disabled={isEmpty || !originalText}
          aria-label={`查看 ${section} 差异`}
          title="查看差异"
          data-state={isDiffOpen ? 'open' : 'closed'}
        >
          <GitCompare className="w-3.5 h-3.5" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFeedback('up');
          }}
          disabled={isEmpty}
          aria-label={`点赞 ${section}`}
          title="赞"
          data-state={feedbackVote === 'up' ? 'up' : 'none'}
        >
          <ThumbsUp
            className={`w-3.5 h-3.5 ${
              feedbackVote === 'up' ? 'text-emerald-600 fill-emerald-600' : ''
            }`}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFeedback('down');
          }}
          disabled={isEmpty}
          aria-label={`点踩 ${section}`}
          title="踩"
          data-state={feedbackVote === 'down' ? 'down' : 'none'}
        >
          <ThumbsDown
            className={`w-3.5 h-3.5 ${
              feedbackVote === 'down' ? 'text-red-600 fill-red-600' : ''
            }`}
          />
        </Button>
      </div>
      {isDiffOpen && originalText && (
        <div
          className="rounded border border-border bg-background p-2 text-[11px] font-mono space-y-0.5 max-h-48 overflow-y-auto"
          aria-label={`${section} 差异`}
        >
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
      <div className="bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded">+ {line.text}</div>
    );
  }
  if (line.type === 'removed') {
    return (
      <div className="bg-red-50 text-red-900 line-through px-1.5 py-0.5 rounded">
        - {line.text}
      </div>
    );
  }
  return <div className="text-muted-foreground px-1.5 py-0.5">  {line.text}</div>;
}
