import { describe, it, expect, vi, beforeEach } from 'vitest';

// 阶段 2：单测 parseIntentResponse + classifyIntent 的 fallback 路径
// 注：classifyIntent 的真实 LLM 路径不在本测试覆盖（需 E2E），只测 fallback / parse 行为

describe('parseIntentResponse', () => {
  it('parses valid JSON', async () => {
    const { parseIntentResponse } = await import('@/lib/intent-classifier');
    const raw = '{"intent":"general","strategy":"direct","rewrittenQuery":"P7 升 P8","riskLevel":"low","reason":"ok"}';
    const r = parseIntentResponse(raw);
    expect(r.intent).toBe('general');
    expect(r.strategy).toBe('direct');
    expect(r.riskLevel).toBe('low');
    expect(r.rewrittenQuery).toBe('P7 升 P8');
  });

  it('extracts JSON from prose', async () => {
    const { parseIntentResponse } = await import('@/lib/intent-classifier');
    const raw = '好的，结果是：{"intent":"off_topic","strategy":"multiquery","subQueries":["a","b"],"riskLevel":"low","reason":"ok"} 完';
    const r = parseIntentResponse(raw);
    expect(r.intent).toBe('off_topic');
    expect(r.strategy).toBe('multiquery');
    expect(r.subQueries).toEqual(['a', 'b']);
  });

  it('downgrades domain-specific intent (e.g. promotion) to general', async () => {
    // 框架级 IntentCategory 只保留 general/off_topic/jailbreak；
    // 领域特定值（如 promotion）不在合法集合内，应被降级为 general。
    const { parseIntentResponse } = await import('@/lib/intent-classifier');
    const raw = '{"intent":"promotion","strategy":"direct","rewrittenQuery":"P7 升 P8","riskLevel":"low","reason":"ok"}';
    const r = parseIntentResponse(raw);
    expect(r.intent).toBe('general');
    expect(r.strategy).toBe('direct');
    expect(r.rewrittenQuery).toBe('P7 升 P8');
  });

  it('falls back gracefully on garbage', async () => {
    const { parseIntentResponse } = await import('@/lib/intent-classifier');
    const r = parseIntentResponse('not json at all');
    expect(r.intent).toBe('general');
    expect(r.strategy).toBe('direct');
    expect(r.riskLevel).toBe('low');
    expect(r.reason).toBe('fallback');
  });
});

describe('classifyIntent', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.INTENT_CLASSIFIER_MODE;
  });

  it('returns legacy shape when INTENT_CLASSIFIER_MODE=legacy', async () => {
    process.env.INTENT_CLASSIFIER_MODE = 'legacy';
    const { classifyIntent } = await import('@/lib/intent-classifier');
    const r = await classifyIntent('任意用户查询', []);
    expect(r.intent).toBe('general');
    expect(r.strategy).toBe('direct');
    expect(r.rewrittenQuery).toBe('任意用户查询');
    expect(r.riskLevel).toBe('low');
    expect(r.reason).toBe('legacy_mode');
  });

  it('returns fallback shape when LLM invocation fails (default mode)', async () => {
    // 不 mock LLMClient，让 LLMClient.invoke 抛错 → catch 块触发 fallback
    const { classifyIntent } = await import('@/lib/intent-classifier');
    const r = await classifyIntent('任意用户查询', []);
    // 环境无 DASHSCOPE_API_KEY / 走 catch 路径 → 通用 fallback
    expect(r.intent).toBe('general');
    expect(r.strategy).toBe('direct');
    expect(r.rewrittenQuery).toBe('任意用户查询');
    expect(r.riskLevel).toBe('low');
  });
});
