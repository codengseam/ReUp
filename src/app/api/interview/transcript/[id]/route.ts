import { NextResponse, type NextRequest } from 'next/server';
import { deleteTranscript, getTranscript } from '@/features/interview/transcript';
import { createLogger } from '@/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('api:interview:transcript:delete');

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: '缺少 id' }, { status: 400 });
    }

    const existing = getTranscript(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: '面经不存在' }, { status: 404 });
    }

    const removed = deleteTranscript(id);
    logger.info('Transcript deleted', { transcriptId: id, removed });
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    logger.error('Transcript delete failed', err instanceof Error ? err : undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
