// src/app/api/resume/parse/route.ts
// ReUp v2 — server-only endpoint for binary PDF/DOCX resume parsing.
// Node runtime is required: pdf-parse / mammoth need Buffer and
// the bundled pdfjs v1.10.100 is CJS. Browser bundle is excluded
// because this file is only imported via the API route, not by
// any client component.

import { NextResponse, type NextRequest } from 'next/server';
import { parseResume } from '@/features/resume/parser';
import { shouldFallback, llmFallbackParse } from '@/features/resume/parser-text';
import { LLMClient } from '@/server/llm/llm-client';
import type { ResumeSource } from '@/features/resume/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MESSAGE_TRUNC = 200;

const ALLOWED_MIME: Record<'pdf' | 'word', string> = {
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function jsonError(error: string, status: number, extra?: Record<string, string>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('invalid_form', 400);
  }

  const file = form.get('file');
  const source = form.get('source');

  if (!(file instanceof File)) {
    return jsonError('missing_file', 400);
  }
  if (typeof source !== 'string') {
    return jsonError('missing_source', 400);
  }
  if (source !== 'pdf' && source !== 'word') {
    return jsonError('invalid_source', 400);
  }

  const expectedMime = ALLOWED_MIME[source];
  if (file.type !== expectedMime) {
    return jsonError('invalid_mime', 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return jsonError('file_too_large', 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const doc = await parseResume(buffer, source as ResumeSource);

    // Phase 1 J: LLM fallback when rule-based parser produces empty structure.
    const enableLLMFallback = process.env.RESUME_PDF_LLM_FALLBACK === 'true';
    const privacyMode = process.env.NEXT_PUBLIC_PRIVACY_MODE === 'local-only';
    if (enableLLMFallback && !privacyMode && shouldFallback(doc)) {
      try {
        const llmClient = new LLMClient();
        const fallbackDoc = await llmFallbackParse(
          doc.raw,
          (messages) => llmClient.invoke(messages),
          doc,
        );
        return NextResponse.json({ ok: true, doc: fallbackDoc });
      } catch (llmErr) {
        console.warn('[resume/parse] LLM fallback failed, returning rule-based result:',
          llmErr instanceof Error ? llmErr.message : String(llmErr));
        // Silently fall through to rule-based result below.
      }
    }

    return NextResponse.json({ ok: true, doc });
  } catch (e) {
    const msg = truncate(e instanceof Error ? e.message : String(e), MESSAGE_TRUNC);
    return jsonError('parse_failed', 422, { message: msg });
  }
}
