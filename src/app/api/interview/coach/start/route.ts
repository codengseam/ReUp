import { NextResponse, type NextRequest } from 'next/server';
import { LLMClient } from '@/server/llm/llm-client';
import { createSession } from '@/features/interview/coach';
import type { ResumeDocument } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { resume: ResumeDocument; jd?: JDDocument | null };
  try {
    body = await request.json() as { resume: ResumeDocument; jd?: JDDocument | null };
  } catch {
    return NextResponse.json({ ok: false, error: '请求体格式错误，需要 JSON' }, { status: 400 });
  }

  if (!body.resume || !body.resume.basic) {
    return NextResponse.json({ ok: false, error: '缺少 resume 数据' }, { status: 400 });
  }

  const session = createSession(body.resume, body.jd ?? null);

  let openingQuestion = '你好！我是今天的面试官，感谢你来参加面试。请先用 1-2 分钟做一个自我介绍吧。';
  try {
    const llm = new LLMClient();
    const response = await llm.invoke([
      { role: 'system', content: session.systemPrompt },
      { role: 'user', content: '请作为面试官，开始面试的第一句话。包含打招呼和邀请自我介绍。' },
    ]);
    if (response.content.trim()) {
      openingQuestion = response.content.trim();
    }
  } catch {
    // Use default opening question on LLM failure
  }

  session.messages.push({ role: 'interviewer', content: openingQuestion });

  return NextResponse.json({ ok: true, sessionId: session.id, openingQuestion });
}