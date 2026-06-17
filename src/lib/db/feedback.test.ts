// src/lib/db/feedback.test.ts
// M2: 用户反馈 SQLite 化 + thumbs_down 触发评估
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./eval-jobs', () => ({
  enqueueEvalJob: vi.fn(() => 1),
}));

import { _resetDbForTest } from './connection';
import { recordFeedback, getFeedbackStats, isValidReason } from './feedback';
import { enqueueEvalJob } from './eval-jobs';

beforeEach(() => {
  process.env.LOOP_ENGINEERING_DB = ':memory:';
  _resetDbForTest();
  vi.clearAllMocks();
});

describe('isValidReason', () => {
  it('accepts all 6 reason types', () => {
    for (const r of ['thumbs_up', 'thumbs_down', 'too_vague', 'wrong', 'unhelpful', 'other']) {
      expect(isValidReason(r)).toBe(true);
    }
  });
  it('rejects unknown reasons', () => {
    expect(isValidReason('haha')).toBe(false);
    expect(isValidReason('')).toBe(false);
  });
});

describe('recordFeedback', () => {
  it('thumbs_down triggers high-priority enqueue', () => {
    recordFeedback({
      id: 'fb-1',
      request_id: 'req-abc',
      message_id: 'msg-1',
      reason: 'thumbs_down',
    });
    expect(enqueueEvalJob).toHaveBeenCalledWith('req-abc', 1);
  });

  it('thumbs_up does NOT enqueue', () => {
    recordFeedback({
      id: 'fb-2',
      request_id: 'req-abc',
      message_id: 'msg-1',
      reason: 'thumbs_up',
    });
    expect(enqueueEvalJob).not.toHaveBeenCalled();
  });

  it('thumbs_down without request_id does NOT enqueue', () => {
    recordFeedback({
      id: 'fb-3',
      request_id: null,
      message_id: 'msg-1',
      reason: 'thumbs_down',
    });
    expect(enqueueEvalJob).not.toHaveBeenCalled();
  });
});

describe('getFeedbackStats', () => {
  it('计算 thumbs_down_rate', () => {
    recordFeedback({ id: '1', request_id: 'r', message_id: 'm', reason: 'thumbs_up' });
    recordFeedback({ id: '2', request_id: 'r', message_id: 'm', reason: 'thumbs_up' });
    recordFeedback({ id: '3', request_id: 'r', message_id: 'm', reason: 'thumbs_down' });
    const stats = getFeedbackStats(30);
    expect(stats.total).toBe(3);
    expect(stats.thumbs_up).toBe(2);
    expect(stats.thumbs_down).toBe(1);
    expect(stats.thumbs_down_rate).toBeCloseTo(1 / 3);
  });
});
