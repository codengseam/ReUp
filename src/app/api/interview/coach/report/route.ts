import { NextResponse, type NextRequest } from 'next/server';
import { LLMClient } from '@/server/llm/llm-client';
import { getSession, evaluateInterview } from '@/features/interview/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { sessionId: string };
  try {
    body = await request.json() as { sessionId: string };
  } catch {
    return NextResponse.json({ ok: false, error: '请求体格式错误，需要 JSON' }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json({ ok: false, error: '缺少 sessionId' }, { status: 400 });
  }

  const session = getSession(body.sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session 不存在' }, { status: 404 });
  }

  const llm = new LLMClient();
  const report = await evaluateInterview(session.messages, session.resume, llm);

  return NextResponse.json({ ok: true, report });
}