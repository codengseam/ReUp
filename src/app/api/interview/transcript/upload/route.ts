import { NextResponse, type NextRequest } from 'next/server';
import { LLMClient } from '@/server/llm/llm-client';
import { parseTranscript, storeTranscript } from '@/features/interview/transcript';
import { createLogger, generateTraceId } from '@/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:interview:transcript:upload');

export async function POST(request: NextRequest) {
  const traceId = generateTraceId();
  let body: { text: string; meta?: { company?: string; position?: string; round?: string } };

  try {
    body = await request.json() as { text: string; meta?: { company?: string; position?: string; round?: string } };
  } catch {
    return NextResponse.json({ ok: false, error: '请求体格式错误，需要 JSON' }, { status: 400 });
  }

  if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
    return NextResponse.json({ ok: false, error: '缺少 text 字段' }, { status: 400 });
  }

  logger.info('Transcript upload started', { traceId, textLength: body.text.length });

  try {
    const llm = new LLMClient();
    const transcript = await parseTranscript(body.text.trim(), llm, body.meta);

    storeTranscript(transcript);

    logger.info('Transcript parsed and stored successfully', {
      traceId,
      transcriptId: transcript.id,
      questionCount: transcript.questions.length,
    });

    return NextResponse.json({ ok: true, transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    logger.error('Transcript upload failed', err instanceof Error ? err : undefined, { traceId });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}