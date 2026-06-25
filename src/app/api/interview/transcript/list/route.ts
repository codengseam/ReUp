import { NextResponse } from 'next/server';
import { listTranscripts } from '@/features/interview/transcript';
import { createLogger } from '@/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:interview:transcript:list');

export async function GET() {
  try {
    const transcripts = listTranscripts();
    logger.info('Transcript list fetched', { count: transcripts.length });
    return NextResponse.json({ ok: true, transcripts });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取列表失败';
    logger.error('Transcript list fetch failed', err instanceof Error ? err : undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
