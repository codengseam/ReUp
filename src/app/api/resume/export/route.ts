// src/app/api/resume/export/route.ts
// ReUp v2 Phase 5 (F1-F3) + Phase 2 (Task 2.2): resume export endpoint.
//
// POST /api/resume/export
//   body: {
//     format: 'md' | 'pdf' | 'docx',
//     resume: ResumeDocument,
//     starResult?: StarRewriteResult,
//     rewritten?: ResumeDocument
//   }
//   resp: 200 + binary/text body (Content-Disposition: attachment), or 400
//
// When `rewritten` is provided, the route renders the rewritten document
// (basic info is preserved from the original `resume` via merge). The
// `rewritten` payload is the contextual-rewriter's `RewriteResult.rewritten`.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { exportResumeAsMarkdown } from '@/features/resume/export-md';
import { exportResumeAsPdfBuffer } from '@/features/resume/export-pdf';
import { exportResumeAsDocxBuffer } from '@/features/resume/export-docx';
import type { ResumeDocument } from '@/features/resume/types';
import type { StarRewriteResult, StarSection } from '@/features/resume/star-rewriter';
import { STAR_SECTIONS } from '@/features/resume/star-rewriter';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const STAR_SECTION_ENUM = z.enum(STAR_SECTIONS as readonly [StarSection, ...StarSection[]]);

const starSectionRecord = z.object(
  STAR_SECTIONS.reduce<Record<StarSection, z.ZodType<string>>>(
    (acc, s) => {
      acc[s] = z.string();
      return acc;
    },
    {} as Record<StarSection, z.ZodType<string>>,
  ),
);

const resumeSchema = z.custom<ResumeDocument>((v) => v !== null && typeof v === 'object', {
  message: 'resume must be an object',
});

const bodySchema = z.object({
  format: z.enum(['md', 'pdf', 'docx']),
  resume: resumeSchema,
  starResult: z
    .object({
      sections: starSectionRecord,
      confidence: z.number().min(0).max(1).optional(),
      citations: z.array(z.object({ id: z.string(), text: z.string(), source: z.string().optional() })).optional(),
    })
    .optional(),
  rewritten: resumeSchema.optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an ISO date suitable for filenames: YYYY-MM-DD. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function attachmentFilename(format: 'md' | 'pdf' | 'docx', rewritten: boolean): string {
  const suffix = rewritten ? '-rewritten' : '';
  return `resume${suffix}-${todayStamp()}.${format}`;
}

/** Merge original basic info into a rewritten document so header fields
 *  (name, contact, title) are preserved when the rewriter does not touch them. */
function mergeForExport(resume: ResumeDocument, rewritten?: ResumeDocument): ResumeDocument {
  if (!rewritten) return resume;
  return {
    ...rewritten,
    meta: rewritten.meta ?? resume.meta,
    basic: { ...resume.basic, ...rewritten.basic },
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1) Parse JSON body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid or missing JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2) Validate
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { format, resume, starResult, rewritten } = parsed.data;
  const source = mergeForExport(resume, rewritten);

  // 3) Dispatch
  try {
    if (format === 'md') {
      const text = exportResumeAsMarkdown(source, starResult as StarRewriteResult | undefined);
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${attachmentFilename('md', !!rewritten)}"`,
        },
      });
    }

    if (format === 'pdf') {
      const buf = await exportResumeAsPdfBuffer(source, starResult as StarRewriteResult | undefined);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(buf.length),
          'Content-Disposition': `attachment; filename="${attachmentFilename('pdf', !!rewritten)}"`,
        },
      });
    }

    // format === 'docx'
    const buf = await exportResumeAsDocxBuffer(source, starResult as StarRewriteResult | undefined);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename="${attachmentFilename('docx', !!rewritten)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    console.error('[api/resume/export] failed:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Silence unused import warning (re-exported for convenience in callers)
export type { ResumeDocument, StarRewriteResult };
// Mark STAR_SECTION_ENUM as intentionally referenced (used to build the Zod schema).
void STAR_SECTION_ENUM;
