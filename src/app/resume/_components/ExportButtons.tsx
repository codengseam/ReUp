'use client';

// src/app/resume/_components/ExportButtons.tsx
// ReUp v2 Phase 5 (H6): export buttons row — Copy Markdown, Export PDF, Export DOCX.
//
// Renders three buttons below the StreamingResult card.
// - Copy Markdown: builds a markdown representation of the resume + STAR
//   result, calls navigator.clipboard.writeText (best-effort).
// - PDF / DOCX: POST `{ format, resume, starResult }` to
//   `/api/resume/export`, reads the response as a Blob, triggers a
//   temporary <a download> click, and revokes the object URL.
//
// Buttons are disabled when `resume` or `starResult` is null so the UI
// stays in a sensible state across parse → rewrite → export.

import { useCallback, useState } from 'react';
import { Check, Copy, FileDown, FileText, FileType } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ResumeDocument } from '@/lib/resume/types';
import type { StarRewriteResult } from '@/lib/resume/star-rewriter';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExportButtonsProps {
  resume: ResumeDocument | null;
  starResult: StarRewriteResult | null;
}

// ---------------------------------------------------------------------------
// Markdown formatter
// ---------------------------------------------------------------------------

/**
 * Build a single Markdown document from a resume + STAR result.
 * Used by the Copy Markdown button and (transitively) the export
 * pipeline. Pure / sync — no LLM, no IO.
 */
export function formatResumeMarkdown(
  resume: ResumeDocument,
  starResult: StarRewriteResult | null,
): string {
  const lines: string[] = [];
  const { basic, experience, projects, skills, education } = resume;

  // Header
  if (basic.name) lines.push(`# ${basic.name}`);
  if (basic.title) lines.push(`**${basic.title}**`);
  if (typeof basic.yearsOfExperience === 'number') {
    lines.push(`工作年限: ${basic.yearsOfExperience} 年`);
  }
  if (basic.contact) {
    const contact = Object.entries(basic.contact)
      .map(([k, v]) => `${k}: ${v}`)
      .join('  ');
    if (contact) lines.push(contact);
  }
  lines.push('');

  // Experience
  if (experience.length > 0) {
    lines.push('## 工作经历');
    for (const e of experience) {
      lines.push(`### ${e.company} · ${e.role} (${e.period})`);
      for (const b of e.bullets) lines.push(`- ${b}`);
      lines.push('');
    }
  }

  // Projects
  if (projects.length > 0) {
    lines.push('## 项目经历');
    for (const p of projects) {
      lines.push(`### ${p.name}${p.period ? ` (${p.period})` : ''}`);
      for (const b of p.bullets) lines.push(`- ${b}`);
      lines.push('');
    }
  }

  // Skills
  if (skills.length > 0) {
    lines.push('## 技能');
    lines.push(skills.join('、'));
    lines.push('');
  }

  // Education
  if (education.length > 0) {
    lines.push('## 教育背景');
    for (const ed of education) {
      lines.push(`- ${ed.school} · ${ed.degree} (${ed.period})`);
    }
    lines.push('');
  }

  // STAR rewrite
  if (starResult) {
    lines.push('## STAR 重写');
    lines.push('');
    lines.push(`### 【我的分析】\n${starResult.sections['我的分析']}`);
    lines.push(`### 【STAR改写】\n${starResult.sections['STAR改写']}`);
    lines.push(`### 【底层心法】\n${starResult.sections['底层心法']}`);
    lines.push(`### 【建议】\n${starResult.sections['建议']}`);
    lines.push('');
    lines.push(`> confidence: ${starResult.confidence.toFixed(2)}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportButtons({ resume, starResult }: ExportButtonsProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [busyFormat, setBusyFormat] = useState<'pdf' | 'docx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = resume === null || starResult === null;

  const handleCopyMarkdown = useCallback(async () => {
    if (!resume || !starResult) return;
    setError(null);
    const md = formatResumeMarkdown(resume, starResult);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
      } else {
        const ta = document.createElement('textarea');
        ta.value = md;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => {
        setCopied((cur) => (cur ? false : cur));
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [resume, starResult]);

  const handleExportBinary = useCallback(
    async (format: 'pdf' | 'docx') => {
      if (!resume || !starResult) return;
      setError(null);
      setBusyFormat(format);
      try {
        const res = await fetch('/api/resume/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, resume, starResult }),
        });
        if (!res.ok) {
          throw new Error(`Export failed: ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = format === 'pdf' ? 'resume.pdf' : 'resume.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyFormat(null);
      }
    },
    [resume, starResult],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDown className="w-4 h-4 text-primary" />
          6. 导出优化后的简历
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void handleCopyMarkdown();
            }}
            disabled={disabled}
            aria-label="复制 Markdown"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '已复制' : 'Copy Markdown'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void handleExportBinary('pdf');
            }}
            disabled={disabled || busyFormat !== null}
            aria-label="导出 PDF"
          >
            <FileType className="w-4 h-4" />
            {busyFormat === 'pdf' ? '导出中…' : 'Export PDF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void handleExportBinary('docx');
            }}
            disabled={disabled || busyFormat !== null}
            aria-label="导出 DOCX"
          >
            <FileText className="w-4 h-4" />
            {busyFormat === 'docx' ? '导出中…' : 'Export DOCX'}
          </Button>
        </div>
        {error && (
          <div
            role="alert"
            className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded"
          >
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
