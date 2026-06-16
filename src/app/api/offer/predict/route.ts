import { NextResponse, type NextRequest } from 'next/server';
import { predictOffer } from '@/lib/offer';
import { savePrediction } from '@/lib/offer/store';
import type { OfferPredictionInput } from '@/lib/offer/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as OfferPredictionInput;

    if (!body.userId || !body.level) {
      return NextResponse.json({ ok: false, error: '缺少必填字段 userId/level' }, { status: 400 });
    }

    const result = predictOffer(body);

    try {
      await savePrediction(result);
    } catch (dbError) {
      console.warn('[offer/predict] DB save failed:', dbError instanceof Error ? dbError.message : String(dbError));
    }

    return NextResponse.json({ ok: true, prediction: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Offer预测失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}