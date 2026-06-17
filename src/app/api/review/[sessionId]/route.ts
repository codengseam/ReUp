import { NextResponse, type NextRequest } from 'next/server';
import { getReview } from '@/features/review/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const review = await getReview(sessionId);
    if (!review) {
      return NextResponse.json({ ok: false, error: '复盘不存在' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取复盘失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}