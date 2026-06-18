// src/app/api/resume/analyze/route.ts
// ReUp v2 Phase 1 (Task 1.4): unified resume analysis endpoint.
// Accepts FormData (resumeFile + optional jdText), runs the full
// diagnostics + ATS + match pipeline, and returns a JSON report.

import { NextResponse, type NextRequest } from 'next/server';
import { parseResume } from '@/features/resume/parser';
import { parseJD } from '@/features/jd/parser';
import { analyzeResume } from '@/features/resume/analyzer';
import { LLMClient } from '@/server/llm/llm-client';
import { createLogger, generateTraceId } from '@/server/logger';
import type { ResumeSource } from '@/features/resume/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const logger = createLogger('resume/analyze');

export async function POST(request: NextRequest) {
  const traceId = generateTraceId();
  const start = Date.now();

  try {
    const form = await request.formData();
    const file = form.get('resumeFile');
    const jdText = form.get('jdText');

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'missing_resume_file' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
    }
    const jd = typeof jdText === 'string' && jdText.trim().length > 0 ? jdText : null;

    const lowerName = file.name.toLowerCase();
    // Determine source from MIME type, with extension fallback for empty types.
    const source: ResumeSource =
      file.type === 'application/pdf' || lowerName.endsWith('.pdf') ? 'pdf' :
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx') ? 'word' :
      file.type === 'text/markdown' || lowerName.endsWith('.md') || lowerName.endsWith('.markdown') ? 'md' :
      'text';

    const input = source === 'pdf' || source === 'word'
      ? Buffer.from(await file.arrayBuffer())
      : await file.text();

    const resume = await parseResume(input, source);

    let llmClient: LLMClient | undefined;
    try { llmClient = new LLMClient(); } catch { /* LLM not configured */ }

    const jdDoc = jd ? await parseJD(jd) : null;
    const result = await analyzeResume(resume, jdDoc, { llmClient });

    const elapsed = Date.now() - start;
    logger.info('resume analyzed', { traceId, duration: elapsed, hasJd: jd !== null });

    return NextResponse.json(
      { ok: true, ...result, elapsed },
      { headers: { 'x-trace-id': traceId } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const message = e instanceof Error ? e.message : String(e);
    logger.error('analyze failed', e instanceof Error ? e : new Error(message), {
      traceId, duration: elapsed,
    });
    return NextResponse.json(
      { ok: false, error: 'analysis_failed', message },
      { status: 422, headers: { 'x-trace-id': traceId } },
    );
  }
}