// src/app/api/resume/analyze/route.ts
// ReUp v2 Phase 1 (Task 1.4): unified resume analysis endpoint.
// Accepts FormData (resumeFile + optional jdText), runs the full
// diagnostics + ATS + match pipeline, and returns a JSON report.

import { NextResponse, type NextRequest } from 'next/server';
import { parseResume } from '@/features/resume/parser';
import { parseJD } from '@/features/jd/parser';
import { analyzeResume, analyzeJDOnly } from '@/features/resume/analyzer';
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

    const hasResumeFile = file instanceof File && file.size > 0;
    const hasJdText = typeof jdText === 'string' && jdText.trim().length > 0;

    if (!hasResumeFile && !hasJdText) {
      return NextResponse.json({ ok: false, error: 'missing_resume_and_jd' }, { status: 400 });
    }
    if (file instanceof File && file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
    }

    let llmClient: LLMClient | undefined;
    try { llmClient = new LLMClient(); } catch { /* LLM not configured */ }

    const jdDoc = hasJdText ? await parseJD(jdText.trim()) : null;

    // JD-only analysis: no resume required.
    if (!hasResumeFile && jdDoc) {
      const result = await analyzeJDOnly(jdDoc, { llmClient });
      const elapsed = Date.now() - start;
      logger.info('jd analyzed', { traceId, duration: elapsed });
      return NextResponse.json(
        { ok: true, ...result, elapsed },
        { headers: { 'x-trace-id': traceId } },
      );
    }

    const resumeFile = file as File;
    const lowerName = resumeFile.name.toLowerCase();
    // Determine source from MIME type, with extension fallback for empty types.
    const source: ResumeSource =
      resumeFile.type === 'application/pdf' || lowerName.endsWith('.pdf') ? 'pdf' :
      resumeFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx') ? 'word' :
      resumeFile.type === 'text/markdown' || lowerName.endsWith('.md') || lowerName.endsWith('.markdown') ? 'md' :
      'text';

    const input = source === 'pdf' || source === 'word'
      ? Buffer.from(await resumeFile.arrayBuffer())
      : await resumeFile.text();

    const resume = await parseResume(input, source);
    const result = await analyzeResume(resume, jdDoc, { llmClient });

    const elapsed = Date.now() - start;
    logger.info('resume analyzed', { traceId, duration: elapsed, hasJd: hasJdText });

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