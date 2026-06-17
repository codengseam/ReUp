// src/lib/eval/ragas.test.ts
// M2: RAGAS 指标测试 (mock LLM)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@/lib/llm-client', () => ({
  // 必须用 function/ class (arrow 不能 new)
  LLMClient: vi.fn().mockImplementation(function () {
    return { invoke: mockInvoke };
  }),
}));

vi.mock('@/lib/runtime-config', () => ({
  getModelCandidates: vi.fn().mockResolvedValue([]),
}));

import {
  evaluateFaithfulness,
  evaluateAnswerRelevancy,
  evaluateContextRelevancy,
} from './ragas';

describe('ragas metrics (with mocked LLM)', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    // 默认: 按 prompt 内容返回不同响应
    mockInvoke.mockImplementation(({ messages }: { messages: Array<{ content: string }> }) => {
      const content = messages[messages.length - 1]?.content || '';
      if (content.includes('拆分为独立的陈述句')) {
        return Promise.resolve({
          content: JSON.stringify({
            claims: [
              { statement: '晋升答辩需要准备PPT', supported: true, reason: 'context提到PPT' },
              { statement: '答辩时间控制在30分钟', supported: false, reason: 'context未提时间' },
            ],
          }),
        });
      }
      if (content.includes('评估以下回答与原始问题的相关性')) {
        return Promise.resolve({
          content: JSON.stringify({ relevancy: 0.85, reason: '直接回应问题' }),
        });
      }
      if (content.includes('检索到的上下文与问题的相关性')) {
        return Promise.resolve({
          content: JSON.stringify({ relevancy: 0.7, reason: '部分相关' }),
        });
      }
      return Promise.resolve({ content: '{}' });
    });
  });

  it('evaluateFaithfulness returns 0-1 score from claims', async () => {
    const result = await evaluateFaithfulness(
      '晋升答辩需要准备PPT，答辩时间控制在30分钟。',
      '晋升答辩准备包括：制作PPT展示工作成果，准备演讲稿。',
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    // mock: 1 supported / 2 total = 0.5
    expect(result.score).toBe(0.5);
    expect(result.claims).toHaveLength(2);
  });

  it('evaluateFaithfulness returns 0 for empty answer (no LLM call)', async () => {
    const result = await evaluateFaithfulness('', 'ctx');
    expect(result.score).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('evaluateAnswerRelevancy returns 0-1', async () => {
    const result = await evaluateAnswerRelevancy('答：...', '问: 怎么晋升?');
    expect(result.score).toBe(0.85);
    expect(result.reason).toBeTruthy();
  });

  it('evaluateContextRelevancy returns 0-1', async () => {
    const result = await evaluateContextRelevancy('背景知识...', '问题: 怎么晋升?');
    expect(result.score).toBe(0.7);
  });

  it('evaluateFaithfulness with empty claims array returns 1 (vacuous truth)', async () => {
    mockInvoke.mockResolvedValueOnce({ content: JSON.stringify({ claims: [] }) });
    const result = await evaluateFaithfulness('answer', 'context');
    expect(result.score).toBe(1);
    expect(result.claims).toHaveLength(0);
  });

  it('handles empty input gracefully (no LLM call)', async () => {
    const f = await evaluateFaithfulness('', 'ctx');
    expect(f.score).toBe(0);
    const r = await evaluateAnswerRelevancy('', 'q');
    expect(r.score).toBe(0);
    const c = await evaluateContextRelevancy('', 'q');
    expect(c.score).toBe(0);
  });

  it('returns -1 when LLM throws', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'));
    const result = await evaluateFaithfulness('a', 'c');
    expect(result.score).toBe(-1);
    expect(result.error).toBeTruthy();
  });
});
