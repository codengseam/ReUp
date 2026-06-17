// 阶段 4 Task 4.3：feedback-store 单元测试
// RED → GREEN → REFACTOR

import { describe, it, expect, beforeEach } from 'vitest';
import { recordFeedback, listFeedback, _resetForTest } from '@/lib/feedback-store';

describe('feedback-store', () => {
  beforeEach(async () => { await _resetForTest(); });

  it('records and lists feedback', async () => {
    await recordFeedback({ messageId: 'm1', conversationId: 'c1', reason: 'too_vague' });
    const list = await listFeedback();
    expect(list.length).toBe(1);
    expect(list[0].reason).toBe('too_vague');
  });

  it('assigns id and createdAt on record', async () => {
    const fb = await recordFeedback({
      messageId: 'm2',
      conversationId: 'c1',
      reason: 'wrong',
      query: 'q',
      response: 'r',
    });
    expect(fb.id).toBeTruthy();
    expect(typeof fb.createdAt).toBe('number');
    expect(fb.createdAt).toBeGreaterThan(0);
  });

  it('appends multiple feedbacks in order', async () => {
    await recordFeedback({ messageId: 'm1', conversationId: 'c1', reason: 'too_vague' });
    await recordFeedback({ messageId: 'm2', conversationId: 'c1', reason: 'unhelpful' });
    await recordFeedback({ messageId: 'm3', conversationId: 'c2', reason: 'other' });
    const list = await listFeedback();
    expect(list.length).toBe(3);
    expect(list[0].messageId).toBe('m1');
    expect(list[1].messageId).toBe('m2');
    expect(list[2].messageId).toBe('m3');
  });

  it('listFeedback returns a copy (not the internal buffer reference)', async () => {
    await recordFeedback({ messageId: 'm1', conversationId: 'c1', reason: 'too_vague' });
    const a = await listFeedback();
    const b = await listFeedback();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  // Phase 5 E3: positive feedback (thumbsUp) variant.
  it('records and persists positive feedback with reason "good"', async () => {
    const fb = await recordFeedback({
      messageId: 'sec-alpha',
      conversationId: 'conv-alpha',
      reason: 'good',
      response: 'improve bullet 1 ...',
    });
    expect(fb.reason).toBe('good');
    expect(fb.messageId).toBe('sec-alpha');
    expect(fb.conversationId).toBe('conv-alpha');
    expect(fb.response).toContain('improve bullet 1');

    const list = await listFeedback();
    expect(list.length).toBe(1);
    expect(list[0]?.reason).toBe('good');
  });
});
