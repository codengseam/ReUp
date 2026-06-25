// src/lib/resume/export-md.ts
// ReUp v2 Phase 5 (F1): Markdown export for the STAR rewrite result.
//
// Produces a single Markdown string with:
//   - Title (#) with the candidate name (or a default)
//   - Basic info, experience, projects, skills, education
//   - "## STAR 改写结果" section with 4 `### 【<section>】` subsections
//
// Empty / missing fields render `（暂无内容）` (placeholder text in Chinese
// parens, matching the rest of the resume/STAR vocabulary).
//
// Special characters in bullet lines are preserved verbatim (we do not
// aggressively escape — Markdown renderers handle * / ` / | gracefully
// inside list items). This is a deliberate trade-off: a resume is meant
// to be human-edited downstream, and overly-aggressive escaping makes
// the source harder to read.

import type { ResumeDocument } from './types';
import type { StarRewriteResult, StarSection } from './star-rewriter';
import { STAR_SECTIONS } from './star-rewriter';

export interface ExportMarkdownOptions {
  /** Override the document title (defaults to candidate name or "简历"). */
  title?: string;
}

const PLACEHOLDER = '（暂无内容）';

/**
 * Render a `ResumeDocument` (and optional `StarRewriteResult`) as a Markdown
 * string. The function is pure: no I/O, no LLM calls.
 */
export function exportResumeAsMarkdown(
  resume: ResumeDocument,
  starResult?: StarRewriteResult,
  opts: ExportMarkdownOptions = {},
): string {
  const title = opts.title ?? resume.basic.name ?? '简历';
  const lines: string[] = [];

  // Title
  lines.push(`# ${title}`);
  lines.push('');

  // Basic info
  lines.push('## 基本信息');
  const basicLines: string[] = [];
  if (resume.basic.name) basicLines.push(`- **姓名**: ${resume.basic.name}`);
  if (resume.basic.title) basicLines.push(`- **职位**: ${resume.basic.title}`);
  if (typeof resume.basic.yearsOfExperience === 'number') {
    basicLines.push(`- **工作年限**: ${resume.basic.yearsOfExperience} 年`);
  }
  if (resume.basic.contact) {
    for (const [k, v] of Object.entries(resume.basic.contact)) {
      if (v) basicLines.push(`- **${k}**: ${v}`);
    }
  }
  if (basicLines.length === 0) {
    lines.push(PLACEHOLDER);
  } else {
    lines.push(...basicLines);
  }
  lines.push('');

  // Experience
  lines.push('## 工作经历');
  if (resume.experience.length === 0) {
    lines.push(PLACEHOLDER);
  } else {
    for (const exp of resume.experience) {
      const header = `### ${exp.company} — ${exp.role}`;
      lines.push(header);
      if (exp.period) lines.push(`*${exp.period}*`);
      lines.push('');
      if (exp.bullets.length === 0) {
        lines.push(PLACEHOLDER);
      } else {
        for (const b of exp.bullets) lines.push(`- ${b}`);
      }
      lines.push('');
    }
  }

  // Projects
  lines.push('## 项目经历');
  if (resume.projects.length === 0) {
    lines.push(PLACEHOLDER);
  } else {
    for (const proj of resume.projects) {
      lines.push(`### ${proj.name}`);
      if (proj.period) lines.push(`*${proj.period}*`);
      lines.push('');
      if (proj.bullets.length === 0) {
        lines.push(PLACEHOLDER);
      } else {
        for (const b of proj.bullets) lines.push(`- ${b}`);
      }
      lines.push('');
    }
  }

  // Skills
  lines.push('## 技能');
  if (resume.skills.length === 0) {
    lines.push(PLACEHOLDER);
  } else {
    for (const s of resume.skills) lines.push(`- ${s}`);
  }
  lines.push('');

  // Education
  lines.push('## 教育背景');
  if (resume.education.length === 0) {
    lines.push(PLACEHOLDER);
  } else {
    for (const edu of resume.education) {
      const head = `### ${edu.school} — ${edu.degree}`;
      lines.push(head);
      if (edu.period) lines.push(`*${edu.period}*`);
      lines.push('');
    }
  }

  // STAR rewrite result
  if (starResult) {
    lines.push('## STAR 改写结果');
    for (const section of STAR_SECTIONS) {
      lines.push(`### 【${section}】`);
      const content = starResult.sections[section];
      lines.push(content && content.length > 0 ? content : PLACEHOLDER);
      lines.push('');
    }
  }

  // Collapse trailing blank lines into a single newline.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// Re-export the section type alias for callers that want to type-narrow
// against the same constant list. Marked as `void` so the import is not
// dropped by linters.
export type { StarSection };
void STAR_SECTIONS;
