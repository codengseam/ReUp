'use client';

// src/components/shared/resume/RewriteDiff.tsx
// ReUp Phase 2 (Task 2.2): Visual diff display for STAR rewrite changes.
//
// Props:
//   - changes: RewriteChange[] — the list of before/after changes returned
//     by the contextual-rewriter (one entry per rewritten section).
//
// UI:
//   - Top: Tabs for each section ("工作经历" / "项目经历" / "技能列表")
//   - Active tab body: a reason banner + a two-column before/after diff
//     where original bullets get a red strikethrough background and
//     rewritten bullets get a green highlight background.

import { useMemo, useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { computeLineDiff, type DiffLine } from '@/features/resume/diff';
import type { RewriteChange } from '@/features/resume/rewriter/contextual-rewriter';

interface RewriteDiffProps {
  changes: RewriteChange[];
}

const TAB_VALUES = ['experience', 'projects', 'skills'] as const;
type TabValue = (typeof TAB_VALUES)[number];

const TAB_LABELS: Record<TabValue, string> = {
  experience: '工作经历',
  projects: '项目经历',
  skills: '技能列表',
};

const CHANGE_TO_TAB: Record<string, TabValue> = {
  工作经历: 'experience',
  项目经历: 'projects',
  技能列表: 'skills',
};

export function RewriteDiff({ changes }: RewriteDiffProps) {
  const grouped = useMemo(() => groupChanges(changes), [changes]);
  const firstChange = changes[0];
  const initialTab =
    firstChange && CHANGE_TO_TAB[firstChange.section]
      ? CHANGE_TO_TAB[firstChange.section]
      : 'experience';
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-[13px] font-medium text-foreground">暂无改写结果</p>
        <p className="text-[11px] text-muted-foreground">完成改写后，这里会展示原文与改写后并排对比</p>
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as TabValue); }} className="w-full">
      <TabsList>
        {TAB_VALUES.map((v) => {
          const hasContent = grouped[v].length > 0;
          return (
            <TabsTrigger key={v} value={v} disabled={!hasContent} className="text-[11px] gap-1">
              {TAB_LABELS[v]}
              {hasContent && <span className="text-[9px] text-muted-foreground">({grouped[v].length})</span>}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {TAB_VALUES.map((v) => (
        <TabsContent key={v} value={v} className="mt-3">
          {grouped[v].length === 0
            ? <EmptyTab label={TAB_LABELS[v]} />
            : <DiffBody change={grouped[v][0]!} />}
        </TabsContent>
      ))}
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyTab({ label }: { label: string }) {
  return (
    <p className="text-[11px] text-muted-foreground text-center py-8">
      {label} 未参与改写
    </p>
  );
}

function DiffBody({ change }: { change: RewriteChange }) {
  const lines: DiffLine[] = useMemo(() => computeLineDiff(change.before, change.after), [change.before, change.after]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
        <span><span className="font-semibold">改写理由：</span>{change.reason}</span>
      </div>
      <div className="grid grid-cols-2 gap-0 rounded-lg border border-border overflow-hidden">
        <SidePanel
          title="原文"
          tone="before"
          lines={lines.filter((l) => l.type !== 'added')}
        />
        <SidePanel
          title="改写后"
          tone="after"
          lines={lines.filter((l) => l.type !== 'removed')}
        />
      </div>
    </div>
  );
}

interface SidePanelProps {
  title: string;
  tone: 'before' | 'after';
  lines: DiffLine[];
}

function SidePanel({ title, tone, lines }: SidePanelProps) {
  return (
    <div className="flex flex-col min-h-[160px]">
      <div className={
        tone === 'before'
          ? 'px-3 py-1.5 text-[11px] font-semibold text-red-800 bg-red-50 border-b border-border'
          : 'px-3 py-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border-b border-border'
      }>
        {title}
      </div>
      <div className="flex-1 p-2 overflow-auto">
        {lines.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic px-1">（无内容）</p>
        ) : (
          <ul className="space-y-0.5">
            {lines.map((line, i) => (
              <DiffLineItem key={i} line={line} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DiffLineItem({ line }: { line: DiffLine }): React.ReactNode {
  if (line.type === 'added') {
    return (
      <li className="px-1.5 py-0.5 rounded text-[11px] leading-relaxed bg-emerald-50 text-emerald-900">
        {line.text || <span className="italic text-muted-foreground">（空行）</span>}
      </li>
    );
  }
  if (line.type === 'removed') {
    return (
      <li className="px-1.5 py-0.5 rounded text-[11px] leading-relaxed bg-red-50 text-red-900 line-through">
        {line.text || <span className="italic text-muted-foreground">（空行）</span>}
      </li>
    );
  }
  return (
    <li className="px-1.5 py-0.5 text-[11px] leading-relaxed text-foreground">
      {line.text || <span className="italic text-muted-foreground">（空行）</span>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupChanges(changes: RewriteChange[]): Record<TabValue, RewriteChange[]> {
  const out: Record<TabValue, RewriteChange[]> = { experience: [], projects: [], skills: [] };
  for (const c of changes) {
    const tab = CHANGE_TO_TAB[c.section];
    if (tab) out[tab].push(c);
  }
  return out;
}
