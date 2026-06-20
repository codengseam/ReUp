'use client';

import React from 'react';
import { AlertTriangle, Bug, Calendar, FileText, Info, ChevronDown, Target, BookOpen, Briefcase } from 'lucide-react';
import type { DiagnosticResult, DiagnosticIssue } from '@/features/resume/diagnostics';

interface Props {
  diagnostics: DiagnosticResult;
}

const TYPE_LABELS: Record<DiagnosticIssue['type'], string> = {
  typo: '错别字',
  timeline: '时间线',
  format: '格式',
  contradiction: '矛盾',
  impact: '量化成果',
  readability: '可读性',
  career: '职业叙事',
};

const TYPE_ICONS: Record<DiagnosticIssue['type'], React.ReactNode> = {
  typo: <Bug className="w-3 h-3" />,
  timeline: <Calendar className="w-3 h-3" />,
  format: <FileText className="w-3 h-3" />,
  contradiction: <AlertTriangle className="w-3 h-3" />,
  impact: <Target className="w-3 h-3" />,
  readability: <BookOpen className="w-3 h-3" />,
  career: <Briefcase className="w-3 h-3" />,
};

const SEVERITY_COLORS: Record<DiagnosticIssue['severity'], { bg: string; text: string; border: string; dot: string }> = {
  error: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
};

const SEVERITY_LABELS: Record<DiagnosticIssue['severity'], string> = {
  error: '错误',
  warning: '警告',
  info: '提示',
};

export function DiagnosticsPanel({ diagnostics }: Props) {
  const { summary, issues } = diagnostics;

  const grouped = issues.reduce<Record<DiagnosticIssue['type'], DiagnosticIssue[]>>(
    (acc, issue) => {
      if (!acc[issue.type]) acc[issue.type] = [];
      acc[issue.type].push(issue);
      return acc;
    },
    { typo: [], timeline: [], format: [], contradiction: [], impact: [], readability: [], career: [] },
  );

  const groupKeys = (Object.keys(grouped) as DiagnosticIssue['type'][]).filter(
    (k) => grouped[k].length > 0,
  );

  if (issues.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
          <Info className="w-5 h-5 text-emerald-500" />
        </div>
        <p className="text-[13px] font-medium text-foreground">未发现诊断问题</p>
        <p className="text-[11px] text-muted-foreground mt-1">简历内容通过了所有检查项</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg border border-border">
        <span className="text-[11px] font-semibold text-foreground">
          共 {summary.total} 个问题
        </span>
        <div className="flex items-center gap-2">
          <SeverityCount label="错误" count={summary.errors} color="red" />
          <SeverityCount label="警告" count={summary.warnings} color="amber" />
          <SeverityCount label="提示" count={summary.infos} color="blue" />
        </div>
      </div>

      {/* Grouped Issues */}
      <div className="space-y-2">
        {groupKeys.map((type) => (
          <IssueGroup
            key={type}
            type={type}
            issues={grouped[type]}
            defaultOpen={type === 'contradiction' || type === 'timeline'}
          />
        ))}
      </div>
    </div>
  );
}

function SeverityCount({ label, count, color }: { label: string; count: number; color: 'red' | 'amber' | 'blue' }) {
  if (count === 0) return null;
  const colors = {
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[color]}`}>
      {label} {count}
    </span>
  );
}

function IssueGroup({
  type,
  issues,
  defaultOpen,
}: {
  type: DiagnosticIssue['type'];
  issues: DiagnosticIssue[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{TYPE_ICONS[type]}</span>
          <span className="text-[11px] font-semibold text-foreground">{TYPE_LABELS[type]}</span>
          <span className="text-[10px] text-muted-foreground">({issues.length})</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border">
          {issues.map((issue, idx) => (
            <IssueRow key={idx} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: DiagnosticIssue }) {
  const colors = SEVERITY_COLORS[issue.severity];
  return (
    <div className={`px-3 py-2.5 ${issue.severity === 'error' ? 'bg-red-50/30' : ''}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-block px-1 py-0 text-[9px] font-medium rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
              {SEVERITY_LABELS[issue.severity]}
            </span>
            <span className="text-[11px] text-foreground">{issue.message}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-muted-foreground font-mono">{issue.location}</span>
            {issue.suggestion && (
              <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 py-0 rounded">
                建议: {issue.suggestion}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}