import { NextRequest, NextResponse } from 'next/server';
import { recordFeedback, type FeedbackReason } from '@/server/db/feedback-store';

const ALLOWED_REASONS: readonly FeedbackReason[] = [
  'too_vague',
  'wrong',
  'unhelpful',
  'other',
] as const;

function isFeedbackReason(value: unknown): value is FeedbackReason {
  return typeof value === 'string' && (ALLOWED_REASONS as readonly string[]).includes(value);
}

/**
 * POST /api/feedback
 * 接收 thumbsDown 反馈，调用 feedback-store 持久化到 feedback.json
 * - 反馈是 best-effort：失败仅记录日志，不影响调用方主流程
 * - 客户端 (page.tsx) 外层已包了 try/catch 做失败隔离
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageId, conversationId, reason, comment, query, response } = body as {
      messageId?: unknown;
      conversationId?: unknown;
      reason?: unknown;
      comment?: unknown;
      query?: unknown;
      response?: unknown;
    };

    if (typeof messageId !== 'string' || !messageId) {
      return NextResponse.json({ error: '缺少必填参数：messageId' }, { status: 400 });
    }
    if (typeof conversationId !== 'string') {
      return NextResponse.json({ error: '缺少必填参数：conversationId' }, { status: 400 });
    }
    if (!isFeedbackReason(reason)) {
      return NextResponse.json(
        { error: `reason 必须是 ${ALLOWED_REASONS.join(' | ')} 之一` },
        { status: 400 }
      );
    }

    const feedback = await recordFeedback({
      messageId,
      conversationId,
      reason,
      comment: typeof comment === 'string' ? comment : undefined,
      query: typeof query === 'string' ? query : undefined,
      response: typeof response === 'string' ? response : undefined,
    });

    return NextResponse.json({ success: true, id: feedback.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '反馈记录失败';
    console.error('[api/feedback] record failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
