// src/app/api/feedback/route.ts
// 用户反馈 API (修复版: 改用 SQLite, 支持 thumbs_up/thumbs_down)
// 关键修复 (Loop Engineering Round 2):
// - 改用 SQLite (替代 feedback-store.ts JSON 文件), 防内存缓存+flush 竞态
// - 加 thumbs_up / thumbs_down 类型
// - size 限制 (防 DoS)
// - 500 错误统一 generic

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { recordFeedback, isValidReason, type FeedbackReason } from '@/lib/db/feedback';

export const runtime = 'nodejs';

const ALLOWED_REASONS: readonly FeedbackReason[] = [
  'thumbs_up', 'thumbs_down', 'too_vague', 'wrong', 'unhelpful', 'other',
] as const;

const MAX_COMMENT_LENGTH = 1000;
const MAX_ID_LENGTH = 256;

function isFeedbackReason(value: unknown): value is FeedbackReason {
  return typeof value === 'string' && (ALLOWED_REASONS as readonly string[]).includes(value);
}

function safeTruncate(s: string | undefined | null, max: number): string | null {
  if (s == null) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * POST /api/feedback
 * 接收 thumbsUp / thumbsDown / 原因 / 评论, 写入 SQLite feedback 表
 * - thumbs_down 自动触发评估 (高优先级入队)
 * - 反馈是 best-effort: 失败仅记录日志, 不影响调用方主流程
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messageId?: unknown;
      conversationId?: unknown;
      requestId?: unknown; // 新增: 关联到 request_log.request_id
      reason?: unknown;
      comment?: unknown;
    };

    const messageId = typeof body.messageId === 'string' ? body.messageId.slice(0, MAX_ID_LENGTH) : '';
    if (!messageId) {
      return NextResponse.json({ error: '缺少必填参数: messageId' }, { status: 400 });
    }
    if (!isFeedbackReason(body.reason)) {
      return NextResponse.json(
        { error: `reason 必须是 ${ALLOWED_REASONS.join(' | ')} 之一` },
        { status: 400 }
      );
    }

    const rec = recordFeedback({
      id: randomUUID(),
      request_id: typeof body.requestId === 'string' ? body.requestId.slice(0, MAX_ID_LENGTH) : null,
      message_id: messageId,
      reason: body.reason,
      comment: safeTruncate(
        typeof body.comment === 'string' ? body.comment : null,
        MAX_COMMENT_LENGTH,
      ),
    });

    return NextResponse.json({ success: true, id: rec.id });
  } catch (error) {
    console.error('[api/feedback] record failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
