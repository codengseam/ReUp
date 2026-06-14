'use client';

import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  rewriteResume,
  rewriteResumeStream,
  STAR_SECTIONS,
  type StarSection,
} from '@/lib/resume/star-rewriter';
import type { ResumeDocument } from '@/lib/resume/types';

interface StreamingResultProps {
  resume: ResumeDocument;
}

// H4: 4-section streaming STAR rewrite result. Streams chunks from
// `rewriteResumeStream` into per-section cards. Confidence badge is
// populated once `rewriteResume` resolves.
export function StreamingResult({ resume }: StreamingResultProps) {
  const [sections, setSections] = useState<Record<StarSection, string>>({
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setSections({ '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' });
    setCompleted(new Set());
    setConfidence(null);
    setIsStreaming(true);
    setError(null);

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
      }
    };

    (async () => {
      try {
        for await (const chunk of rewriteResumeStream(resume, {
          signal: controller.signal,
          onChunk,
        })) {
          // chunks already delivered via onChunk
          void chunk;
        }
        if (controller.signal.aborted) return;
        const result = await rewriteResume(resume, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setConfidence(result.confidence);
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
              isDone={completed.has(section)}
              isCopied={copied === section}
              onCopy={() => {
                void handleCopy(section);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface SectionCardProps {
  section: StarSection;
  text: string;
  isDone: boolean;
  isCopied: boolean;
  onCopy: () => void;
}

function SectionCard({ section, text, isDone, isCopied, onCopy }: SectionCardProps): ReactNode {
  const isEmpty = text.length === 0;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 min-h-[160px] flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">【{section}】</span>
          {isEmpty || !isDone ? (
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
    </div>
  );
}
