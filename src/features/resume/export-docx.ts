// src/lib/resume/export-docx.ts
// ReUp v2 Phase 5 (F3): DOCX export for the STAR rewrite result.
//
// Renders a `ResumeDocument` (and optional `StarRewriteResult`) as an
// in-memory DOCX Buffer using the `docx` library (v9.x). Pure of side
// effects beyond constructing the Buffer — no disk I/O, no LLM calls.
//
// CJK rendering:
//   The `docx` library does not embed fonts; Word / LibreOffice fall
//   back to the system font when opening the file. This means Chinese
//   characters render correctly in Word on any system that has a CJK
//   font installed (which is true for default Windows / macOS / modern
//   LibreOffice). This is a substantial improvement over the PDF
//   branch, which only ships the standard PDF font set.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { ResumeDocument } from './types';
import type { StarRewriteResult } from './star-rewriter';
import { STAR_SECTIONS } from './star-rewriter';

export interface ExportDocxOptions {
  /** Override the document title (defaults to candidate name or "简历"). */
  title?: string;
}

const PLACEHOLDER = '（暂无内容）';

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];
type AlignmentTypeValue = (typeof AlignmentType)[keyof typeof AlignmentType];

/**
 * Build a single `Paragraph` from text and an optional heading level.
 * Convenience helper to keep the export code compact.
 */
function para(text: string, heading?: HeadingLevelValue, alignment?: AlignmentTypeValue): Paragraph {
  const opts: { heading?: HeadingLevelValue; alignment?: AlignmentTypeValue; children: TextRun[] } = {
    children: [new TextRun({ text })],
  };
  if (heading !== undefined) opts.heading = heading;
  if (alignment !== undefined) opts.alignment = alignment;
  return new Paragraph(opts);
}

/**
 * Render a `ResumeDocument` (and optional `StarRewriteResult`) as a
 * DOCX Buffer. The function is async because `Packer.toBuffer` returns
 * a Promise<Buffer> (zip assembly happens off the main thread).
 */
export async function exportResumeAsDocxBuffer(
  resume: ResumeDocument,
  starResult?: StarRewriteResult,
  opts: ExportDocxOptions = {},
): Promise<Buffer> {
  const title = opts.title ?? resume.basic.name ?? '简历';
  const children: Paragraph[] = [];

  // Title
  children.push(para(title, HeadingLevel.TITLE, AlignmentType.CENTER));

  // Basic info
  children.push(para('基本信息', HeadingLevel.HEADING_1));
  const basic = resume.basic;
  const basicLines: string[] = [];
  if (basic.name) basicLines.push(`姓名: ${basic.name}`);
  if (basic.title) basicLines.push(`职位: ${basic.title}`);
  if (typeof basic.yearsOfExperience === 'number') {
    basicLines.push(`工作年限: ${basic.yearsOfExperience} 年`);
  }
  if (basic.contact) {
    for (const [k, v] of Object.entries(basic.contact)) {
      if (v) basicLines.push(`${k}: ${v}`);
    }
  }
  if (basicLines.length === 0) {
    children.push(para(PLACEHOLDER));
  } else {
    for (const line of basicLines) children.push(para(line));
  }

  // Experience
  children.push(para('工作经历', HeadingLevel.HEADING_1));
  if (resume.experience.length === 0) {
    children.push(para(PLACEHOLDER));
  } else {
    for (const exp of resume.experience) {
      children.push(para(`${exp.company} — ${exp.role}`, HeadingLevel.HEADING_2));
      if (exp.period) children.push(para(exp.period));
      if (exp.bullets.length === 0) {
        children.push(para(PLACEHOLDER));
      } else {
        for (const b of exp.bullets) children.push(para(`• ${b}`));
      }
    }
  }

  // Projects
  children.push(para('项目经历', HeadingLevel.HEADING_1));
  if (resume.projects.length === 0) {
    children.push(para(PLACEHOLDER));
  } else {
    for (const proj of resume.projects) {
      children.push(para(proj.name, HeadingLevel.HEADING_2));
      if (proj.period) children.push(para(proj.period));
      if (proj.bullets.length === 0) {
        children.push(para(PLACEHOLDER));
      } else {
        for (const b of proj.bullets) children.push(para(`• ${b}`));
      }
    }
  }

  // Skills
  children.push(para('技能', HeadingLevel.HEADING_1));
  if (resume.skills.length === 0) {
    children.push(para(PLACEHOLDER));
  } else {
    for (const s of resume.skills) children.push(para(`• ${s}`));
  }

  // Education
  children.push(para('教育背景', HeadingLevel.HEADING_1));
  if (resume.education.length === 0) {
    children.push(para(PLACEHOLDER));
  } else {
    for (const edu of resume.education) {
      children.push(para(`${edu.school} — ${edu.degree}`, HeadingLevel.HEADING_2));
      if (edu.period) children.push(para(edu.period));
    }
  }

  // STAR rewrite result
  if (starResult) {
    children.push(para('STAR 改写结果', HeadingLevel.HEADING_1));
    for (const section of STAR_SECTIONS) {
      children.push(para(`【${section}】`, HeadingLevel.HEADING_2));
      const content = starResult.sections[section];
      children.push(para(content && content.length > 0 ? content : PLACEHOLDER));
    }
  }

  // Build the docx and pack into a Buffer.
  const doc = new Document({
    creator: 'ReUp',
    title,
    description: 'Resume (ReUp v2 Phase 5 export)',
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}
