import { NextResponse, type NextRequest } from 'next/server';
import { LLMClient } from '@/lib/llm-client';
import { generateReview, generateFallbackReview } from '@/lib/review';
import { saveReview } from '@/lib/review/store';
import type { ReviewInput } from '@/lib/review/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: ReviewInput;
  try {
    body = await request.json() as ReviewInput;
  } catch {
    return NextResponse.json({ ok: false, error: '请求体格式错误，需要 JSON' }, { status: 400 });
  }

  try {
    // Basic validation
    if (!body.sessionId || !body.transcript || !body.transcript.length) {
      return NextResponse.json({ ok: false, error: '缺少必填字段 sessionId/transcript' }, { status: 400 });
    }

    // Transcript size limit
    if (body.transcript.length > 20) {
      return NextResponse.json({ ok: false, error: 'transcript 不能超过 20 题' }, { status: 400 });
    }

    let result;
    try {
      const llm = new LLMClient();
      result = await generateReview(llm, body);
    } catch (llmError) {
      console.warn('[review/generate] LLM failed, using fallback:', llmError instanceof Error ? llmError.message : String(llmError));
      result = generateFallbackReview(body);
    }

    // Persist
    try {
      await saveReview(result);
    } catch (dbError) {
      console.warn('[review/generate] DB save failed:', dbError instanceof Error ? dbError.message : String(dbError));
      // Don't fail the request — return the result even if save fails
    }

    return NextResponse.json({ ok: true, review: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成复盘失败';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}