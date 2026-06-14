// src/lib/resume/export-pdf.ts
// ReUp v2 Phase 5 (F2): PDF export for the STAR rewrite result.
//
// Renders a `ResumeDocument` (and optional `StarRewriteResult`) as an
// in-memory PDF Buffer using pdfkit (v0.15.x). Pure of side effects
// beyond constructing the Buffer — no disk I/O, no LLM calls.
//
// CAVEAT — Chinese rendering:
//   pdfkit ships only the standard PDF font set (Helvetica / Times /
//   Courier and a handful of variants). It has no CJK glyphs. This
//   module sticks to Helvetica; any Chinese character in the input
//   will appear as a missing-glyph glyph in the rendered PDF. The
//   spec (F2 Q4) recommends a print-CSS HTML fallback for full CJK
//   support, which is handled by the UI sub-agent. The API route here
//   is best-effort ASCII / Latin output for the PDF branch.

import { PassThrough } from 'node:stream';
import PDFDocument from 'pdfkit';
import type { ResumeDocument } from './types';
import type { StarRewriteResult } from './star-rewriter';
import { STAR_SECTIONS } from './star-rewriter';

export interface ExportPdfOptions {
  /** Override the document title (defaults to candidate name or "Resume"). */
  title?: string;
}

const PLACEHOLDER = '(no content)';
const MARGIN_X = 50;

/**
 * Render a `ResumeDocument` (and optional `StarRewriteResult`) as a
 * PDF Buffer. The function is async because pdfkit's stream-based
 * emission is event-driven; the final Buffer is only available after
 * the underlying Readable's `end` event fires.
 */
export async function exportResumeAsPdfBuffer(
  resume: ResumeDocument,
  starResult?: StarRewriteResult,
  opts: ExportPdfOptions = {},
): Promise<Buffer> {
  const title = opts.title ?? resume.basic.name ?? 'Resume';

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    sink.on('end', () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: MARGIN_X, right: MARGIN_X },
      info: {
        Title: title,
        Author: resume.basic.name ?? 'ReUp',
        Subject: 'Resume (ReUp v2 Phase 5 export)',
        Producer: 'ReUp pdfkit',
      },
    });
    doc.on('error', reject);
    doc.pipe(sink);

    // All text uses Helvetica; CJK chars will not render — see caveat above.
    doc.font('Helvetica');

    // Title
    doc.fontSize(20).text(title, { align: 'left' });
    doc.moveDown(0.5);

    // Basic info
    doc.fontSize(14).text('Basic Info', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11);
    const basic = resume.basic;
    const basicLines: string[] = [];
    if (basic.name) basicLines.push(`Name: ${basic.name}`);
    if (basic.title) basicLines.push(`Title: ${basic.title}`);
    if (typeof basic.yearsOfExperience === 'number') {
      basicLines.push(`Years of Experience: ${basic.yearsOfExperience}`);
    }
    if (basic.contact) {
      for (const [k, v] of Object.entries(basic.contact)) {
        if (v) basicLines.push(`${k}: ${v}`);
      }
    }
    doc.text(basicLines.length > 0 ? basicLines.join('\n') : PLACEHOLDER);
    doc.moveDown();

    // Experience
    doc.fontSize(14).text('Experience', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11);
    if (resume.experience.length === 0) {
      doc.text(PLACEHOLDER);
    } else {
      for (const exp of resume.experience) {
        doc.font('Helvetica-Bold').text(`${exp.company} — ${exp.role}`);
        doc.font('Helvetica').text(exp.period);
        for (const b of exp.bullets) doc.text(`• ${b}`);
        doc.moveDown(0.5);
      }
    }

    // Projects
    doc.fontSize(14).text('Projects', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11);
    if (resume.projects.length === 0) {
      doc.text(PLACEHOLDER);
    } else {
      for (const proj of resume.projects) {
        doc.font('Helvetica-Bold').text(proj.name);
        doc.font('Helvetica').text(proj.period ?? '');
        for (const b of proj.bullets) doc.text(`• ${b}`);
        doc.moveDown(0.5);
      }
    }

    // Skills
    doc.fontSize(14).text('Skills', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11);
    if (resume.skills.length === 0) {
      doc.text(PLACEHOLDER);
    } else {
      doc.text(resume.skills.join(', '));
    }
    doc.moveDown();

    // Education
    doc.fontSize(14).text('Education', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11);
    if (resume.education.length === 0) {
      doc.text(PLACEHOLDER);
    } else {
      for (const edu of resume.education) {
        doc.font('Helvetica-Bold').text(`${edu.school} — ${edu.degree}`);
        doc.font('Helvetica').text(edu.period);
        doc.moveDown(0.5);
      }
    }

    // STAR rewrite result
    if (starResult) {
      doc.addPage();
      doc.fontSize(16).text('STAR Rewrite', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      for (const section of STAR_SECTIONS) {
        doc.font('Helvetica-Bold').text(`[${section}]`);
        doc.font('Helvetica');
        const content = starResult.sections[section];
        doc.text(content && content.length > 0 ? content : PLACEHOLDER);
        doc.moveDown(0.5);
      }
    }

    doc.end();
  });
}
