import { NextResponse, type NextRequest } from 'next/server';
import { getUserPredictions } from '@/features/offer/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    if (!userId) {
      return NextResponse.json({ ok: false, error: '缺少 userId 参数' }, { status: 400 });
    }

    const predictions = await getUserPredictions(userId, Math.min(limit, 50));
    return NextResponse.json({ ok: true, predictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取预测列表失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}