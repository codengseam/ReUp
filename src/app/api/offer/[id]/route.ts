import { NextResponse, type NextRequest } from 'next/server';
import { getPrediction } from '@/lib/offer/store';
import prisma from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prediction = await getPrediction(id);
    if (!prediction) {
      return NextResponse.json({ ok: false, error: '预测不存在' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, prediction });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取预测失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { actualResult } = body;

    if (!actualResult || !['offer', 'rejected', 'pending', 'withdrawn'].includes(actualResult)) {
      return NextResponse.json({ ok: false, error: '无效的 actualResult' }, { status: 400 });
    }

    const prediction = await prisma.offerPrediction.findUnique({ where: { id } });
    if (!prediction) {
      return NextResponse.json({ ok: false, error: '预测不存在' }, { status: 404 });
    }

    const calibrationDelta = actualResult === 'offer' ? prediction.probability - 1 : prediction.probability - 0;

    await prisma.offerPrediction.update({
      where: { id },
      data: {
        actualResult,
        actualResultAt: new Date(),
        calibrationDelta,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}