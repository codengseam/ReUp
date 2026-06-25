'use client';

// src/components/shared/resume/StarRewritePanel.tsx
// ReUp Phase 2 (Task 2.2): STAR contextual rewrite panel with live diff streaming.
//
// UI:
//   - Top: target section checkboxes (experience / projects / skills)
//   - Middle: side-by-side "原文" vs "改写后" (git-diff style)
//   - Bottom: "开始改写" button + progress indicator
//
// Stream protocol: POSTs to /api/resume/rewrite with
//   { resume, matchReport?, targetSections, stream: true }
// and consumes the SSE response (type=chunk | done | error). On `done` it
// fires onComplete with the aggregated RewriteResult.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, GitCompare, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/shared/utils/utils';
import { safeTrack } from '@/shared/utils/analytics-helpers';
import type { ResumeDocument, MatchReport } from '@/features/resume/types';
import type { TargetSection, RewriteResult, RewriteChange } from '@/features/resume/rewriter/contextual-rewriter';

interface StarRewritePanelProps {
  resume: ResumeDocument;
  matchReport?: MatchReport;
  onComplete?: (result: RewriteResult) => void;
}

type SectionKey = TargetSection;
type SectionTexts = Record<SectionKey, string>;

const SECTION_LABELS: Record<SectionKey, string> = {
  experience: '工作经历',
  projects: '项目经历',
  skills: '技能列表',
};

const ALL_SECTIONS: ReadonlyArray<SectionKey> = ['experience', 'projects', 'skills'];

const EMPTY_TEXTS: SectionTexts = { experience: '', projects: '', skills: '' };

export function StarRewritePanel({ resume, matchReport, onComplete }: StarRewritePanelProps) {
  const [selected, setSelected] = useState<Set<SectionKey>>(new Set(ALL_SECTIONS));
  const [texts, setTexts] = useState<SectionTexts>(EMPTY_TEXTS);
  const [done, setDone] = useState<Set<SectionKey>>(new Set());
  const [current, setCurrent] = useState<SectionKey | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const toggle = useCallback((s: SectionKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async () => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setTexts(EMPTY_TEXTS);
    setDone(new Set());
    const changes: RewriteChange[] = [];
    const originalSnapshot: SectionTexts = renderAllSections(resume);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/resume/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume,
          matchReport,
          targetSections: Array.from(selected),
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const aggregated: SectionTexts = { ...EMPTY_TEXTS };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const out = consumeFrame(frame, aggregated);
          if (out?.error) throw new Error(out.error);
          const sec = out?.doneSection;
          if (sec) setDone((prev) => new Set(prev).add(sec));
        }
        // Best-effort current-section indicator: the most recently
        // streamed section that has not yet been marked done.
        let latest: SectionKey | null = null;
        for (const s of ALL_SECTIONS) {
          if (aggregated[s].length > 0) latest = s;
        }
        if (latest) setCurrent(latest);
      }

      setTexts(aggregated);
      for (const s of selected) {
        const after = aggregated[s];
        if (after.length > 0) {
          changes.push({
            section: SECTION_LABELS[s],
            before: originalSnapshot[s],
            after,
            reason: s === 'skills'
              ? '基于 JD 需求优化技能列表'
              : `基于匹配差距和诊断问题，用 STAR 法则重写${SECTION_LABELS[s]}`,
          });
        }
      }
      // Track star_rewrite completion: count sections actually rewritten.
      const sectionCount = changes.length;
      safeTrack({ type: 'star_rewrite', data: { sectionCount } });
      onComplete?.({ original: resume, rewritten: resume, changes });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('改写已取消');
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        safeTrack({
          type: 'error',
          data: {
            message,
            stack: err instanceof Error ? err.stack ?? undefined : undefined,
          },
        });
      }
    } finally {
      setBusy(false);
      setCurrent(null);
      abortRef.current = null;
    }
  }, [busy, selected, resume, matchReport, onComplete]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const completedCount = done.size;
  const totalCount = selected.size;
  const progressPct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="flex flex-col gap-4">
      <SectionSelector selected={selected} onToggle={toggle} disabled={busy} />
      <DiffView resume={resume} texts={texts} done={done} current={current} />
      <Footer
        busy={busy}
        selectedCount={totalCount}
        completedCount={completedCount}
        progressPct={progressPct}
        canStart={!busy && selected.size > 0}
        error={error}
        onStart={() => { void start(); }}
        onCancel={cancel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FrameResult {
  error?: string;
  doneSection?: SectionKey;
}

function consumeFrame(frame: string, aggregated: SectionTexts): FrameResult | null {
  const dataLine = frame.replace(/^data: /, '');
  if (!dataLine) return null;
  type SseMsg = { type: string; section?: SectionKey; delta?: string; done?: boolean; error?: string };
  let msg: SseMsg;
  try { msg = JSON.parse(dataLine) as SseMsg; } catch { return null; }
  if (msg.type === 'chunk' && msg.section && msg.delta !== undefined) {
    aggregated[msg.section] += msg.delta;
    if (msg.done) return { doneSection: msg.section };
    return null;
  }
  if (msg.type === 'error') {
    return { error: msg.error ?? 'Rewrite failed' };
  }
  return null;
}

function renderAllSections(resume: ResumeDocument): SectionTexts {
  return {
    experience: resume.experience
      .map((e) => `[${e.company} - ${e.role} (${e.period})]\n${e.bullets.map((b) => `  - ${b}`).join('\n')}`)
      .join('\n\n') || '（无内容）',
    projects: resume.projects
      .map((p) => `[${p.name}${p.period ? ` (${p.period})` : ''}]\n${p.bullets.map((b) => `  - ${b}`).join('\n')}`)
      .join('\n\n') || '（无内容）',
    skills: resume.skills.join(', ') || '（无技能列表）',
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionSelectorProps {
  selected: Set<SectionKey>;
  onToggle: (s: SectionKey) => void;
  disabled: boolean;
}

function SectionSelector({ selected, onToggle, disabled }: SectionSelectorProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary" />改写范围
      </span>
      {ALL_SECTIONS.map((s) => {
        const checked = selected.has(s);
        return (
          <label key={s} className={cn('flex items-center gap-1.5 text-[11px] cursor-pointer select-none', disabled && 'opacity-60')}>
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={() => { onToggle(s); }}
              aria-label={`选择 ${SECTION_LABELS[s]}`}
            />
            {SECTION_LABELS[s]}
          </label>
        );
      })}
    </div>
  );
}

interface DiffViewProps {
  resume: ResumeDocument;
  texts: SectionTexts;
  done: Set<SectionKey>;
  current: SectionKey | null;
}

function DiffView({ resume, texts, done, current }: DiffViewProps) {
  const originals = renderAllSections(resume);
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border overflow-hidden">
      <DiffColumn
        title="原文"
        tone="original"
        body={ALL_SECTIONS.map((s) => `${SECTION_LABELS[s]}：\n${originals[s]}`).join('\n\n')}
      />
      <DiffColumn
        title="改写后"
        tone="rewritten"
        body={ALL_SECTIONS.map((s) => `${SECTION_LABELS[s]}：\n${texts[s] || '（等待开始）'}${current === s && !done.has(s) ? '…' : ''}`).join('\n\n')}
      />
    </div>
  );
}

interface DiffColumnProps {
  title: string;
  tone: 'original' | 'rewritten';
  body: string;
}

function DiffColumn({ title, tone, body }: DiffColumnProps) {
  return (
    <div className="flex flex-col min-h-[220px]">
      <div className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border-b border-border',
        tone === 'original' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800',
      )}>
        <GitCompare className="w-3.5 h-3.5" />{title}
      </div>
      <pre className="flex-1 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground overflow-auto">
        {body}
      </pre>
    </div>
  );
}

interface FooterProps {
  busy: boolean;
  selectedCount: number;
  completedCount: number;
  progressPct: number;
  canStart: boolean;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
}

function Footer({ busy, selectedCount, completedCount, progressPct, canStart, error, onStart, onCancel }: FooterProps) {
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button
          onClick={onStart}
          disabled={!canStart}
          className="h-9 px-4 text-[12px]"
          aria-label="开始改写"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
          {busy ? '改写中…' : '开始改写'}
        </Button>
        {busy && (
          <Button variant="ghost" size="sm" className="h-9 text-[12px]" onClick={onCancel} aria-label="取消改写">
            取消
          </Button>
        )}
        <div className="flex-1 min-w-0">
          {busy ? (
            <div className="flex items-center gap-2">
              <Progress value={progressPct} className="h-1.5" />
              <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                {completedCount} / {selectedCount}
              </span>
            </div>
          ) : completedCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
              <Check className="w-3 h-3" />已完成 {completedCount} / {selectedCount}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">未选择任何 section 时按钮禁用</span>
          )}
        </div>
      </div>
    </div>
  );
}
