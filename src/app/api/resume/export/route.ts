// src/app/api/resume/export/route.ts
// ReUp v2 Phase 5 (F1-F3): resume export endpoint.
//
// POST /api/resume/export
//   body: { format: 'md' | 'pdf' | 'docx', resume: ResumeDocument, starResult?: StarRewriteResult }
//   resp: 200 + binary/text body (Content-Disposition: attachment), or 400 on validation failure
//
// The route is intentionally thin: it validates the input with Zod,
// dispatches to the format-specific export module, and returns the
// resulting buffer with the right MIME type + filename.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { exportResumeAsMarkdown } from '@/lib/resume/export-md';
import { exportResumeAsPdfBuffer } from '@/lib/resume/export-pdf';
import { exportResumeAsDocxBuffer } from '@/lib/resume/export-docx';
import type { ResumeDocument } from '@/lib/resume/types';
import type { StarRewriteResult, StarSection } from '@/lib/resume/star-rewriter';
import { STAR_SECTIONS } from '@/lib/resume/star-rewriter';

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

const bodySchema = z.object({
  format: z.enum(['md', 'pdf', 'docx']),
  resume: z.custom<ResumeDocument>((v) => v !== null && typeof v === 'object', {
    message: 'resume must be an object',
  }),
  starResult: z
    .object({
      sections: starSectionRecord,
      confidence: z.number().min(0).max(1).optional(),
      citations: z.array(z.object({ id: z.string(), text: z.string(), source: z.string().optional() })).optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an ISO date suitable for filenames: YYYY-MM-DD. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function attachmentFilename(format: 'md' | 'pdf' | 'docx'): string {
  return `resume-${todayStamp()}.${format}`;
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

  const { format, resume, starResult } = parsed.data;

  // 3) Dispatch
  try {
    if (format === 'md') {
      const text = exportResumeAsMarkdown(resume, starResult as StarRewriteResult | undefined);
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${attachmentFilename('md')}"`,
        },
      });
    }

    if (format === 'pdf') {
      const buf = await exportResumeAsPdfBuffer(resume, starResult as StarRewriteResult | undefined);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(buf.length),
          'Content-Disposition': `attachment; filename="${attachmentFilename('pdf')}"`,
        },
      });
    }

    // format === 'docx'
    const buf = await exportResumeAsDocxBuffer(resume, starResult as StarRewriteResult | undefined);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename="${attachmentFilename('docx')}"`,
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
