// src/features/interview/transcript/__tests__/parser.test.ts
// Structured transcript parser tests.

import { describe, it, expect, vi } from 'vitest';
import { LLMClient, type LLMResponse } from '@/server/llm/llm-client';
import { parseTranscript } from '../parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLLMClientWithResponse(response: LLMResponse | Error): {
  client: LLMClient;
  invokeSpy: ReturnType<typeof vi.fn>;
} {
  const client = new LLMClient({ apiKey: 'test-key' });
  const invokeSpy = vi.fn(async (): Promise<LLMResponse> => {
    if (response instanceof Error) throw response;
    return response;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).invoke = invokeSpy;
  return { client, invokeSpy };
}

function makeLLMResponse(content: string): LLMResponse {
  return {
    content,
    model: 'test-model',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleRawText = `
今天去字节跳动面试了前端高级工程师，这是一面。

面试官先问：请做一下自我介绍。
我回答：我是张三，有5年前端开发经验，主要在React和TypeScript方向。

面试官接着问：React的虚拟DOM原理是什么？
我回答：虚拟DOM是React中的一个核心概念，它是一个轻量级的JavaScript对象，用来描述真实DOM结构。当状态变化时，React会先更新虚拟DOM，然后通过diff算法比较新旧虚拟DOM，最后只更新变化的部分到真实DOM。

面试官追问：能说一下diff算法的具体策略吗？
我回答：React采用三级策略：tree diff、component diff和element diff。tree diff只对同层节点比较；component diff对同类型组件继续比较，不同类型则直接替换；element diff通过key来优化列表渲染。

面试官最后说：好的，今天面试就到这里，我们会在一周内通知结果。
`;

const sampleLLMResult = JSON.stringify({
  company: '字节跳动',
  position: '前端高级工程师',
  round: '一面',
  questions: [
    {
      question: '请做一下自我介绍',
      answer: '我是张三，有5年前端开发经验，主要在React和TypeScript方向。',
    },
    {
      question: 'React的虚拟DOM原理是什么？',
      answer: '虚拟DOM是React中的一个核心概念，它是一个轻量级的JavaScript对象，用来描述真实DOM结构。当状态变化时，React会先更新虚拟DOM，然后通过diff算法比较新旧虚拟DOM，最后只更新变化的部分到真实DOM。',
      interviewerNote: '能说一下diff算法的具体策略吗？',
    },
    {
      question: '能说一下diff算法的具体策略吗？',
      answer: 'React采用三级策略：tree diff、component diff和element diff。tree diff只对同层节点比较；component diff对同类型组件继续比较，不同类型则直接替换；element diff通过key来优化列表渲染。',
    },
  ],
  result: '等待结果',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseTranscript', () => {
  it('parses raw interview text into structured transcript', async () => {
    const { client, invokeSpy } = mockLLMClientWithResponse(makeLLMResponse(sampleLLMResult));

    const transcript = await parseTranscript(sampleRawText, client);

    expect(transcript).toBeDefined();
    expect(transcript.id).toBeTruthy();
    expect(typeof transcript.id).toBe('string');
    expect(transcript.company).toBe('字节跳动');
    expect(transcript.position).toBe('前端高级工程师');
    expect(transcript.round).toBe('一面');
    expect(transcript.result).toBe('等待结果');
    expect(transcript.questions).toHaveLength(3);
    expect(transcript.rawText).toBe(sampleRawText);
    expect(transcript.createdAt).toBeTruthy();

    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });

  it('fills question and answer fields from questions array', async () => {
    const { client } = mockLLMClientWithResponse(makeLLMResponse(sampleLLMResult));
    const transcript = await parseTranscript(sampleRawText, client);

    expect(transcript.questions[0].question).toBe('请做一下自我介绍');
    expect(transcript.questions[0].answer).toContain('张三');
    expect(transcript.questions[1].interviewerNote).toBe('能说一下diff算法的具体策略吗？');
  });

  it('uses meta fallback when LLM does not extract fields', async () => {
    const minimalResult = JSON.stringify({
      questions: [
        { question: '自我介绍', answer: '我是测试' },
      ],
    });
    const { client } = mockLLMClientWithResponse(makeLLMResponse(minimalResult));

    const transcript = await parseTranscript('自我介绍：我是测试', client, {
      company: '阿里',
      position: '后端',
      round: '二面',
    });

    expect(transcript.company).toBe('阿里');
    expect(transcript.position).toBe('后端');
    expect(transcript.round).toBe('二面');
    expect(transcript.questions).toHaveLength(1);
  });

  it('handles markdown code fences in LLM response', async () => {
    const fenced = '```json\n' + sampleLLMResult + '\n```';
    const { client } = mockLLMClientWithResponse(makeLLMResponse(fenced));

    const transcript = await parseTranscript(sampleRawText, client);

    expect(transcript.company).toBe('字节跳动');
    expect(transcript.questions).toHaveLength(3);
  });

  it('handles empty questions gracefully', async () => {
    const emptyResult = JSON.stringify({
      company: '腾讯',
      position: '产品经理',
      questions: [],
      result: '未通过',
    });
    const { client } = mockLLMClientWithResponse(makeLLMResponse(emptyResult));

    const transcript = await parseTranscript('面了腾讯产品经理，挂了。', client);

    expect(transcript.company).toBe('腾讯');
    expect(transcript.questions).toHaveLength(0);
    expect(transcript.result).toBe('未通过');
  });

  it('handles malformed questions gracefully', async () => {
    const badResult = JSON.stringify({
      questions: [
        { question: 123, answer: null },
        { question: '有效的提问', answer: '有效的回答' },
      ],
    });
    const { client } = mockLLMClientWithResponse(makeLLMResponse(badResult));

    const transcript = await parseTranscript('test', client);

    expect(transcript.questions).toHaveLength(1);
    expect(transcript.questions[0].question).toBe('有效的提问');
  });

  it('extracts nested JSON from malformed LLM response', async () => {
    const messy = '好的，这是解析结果：\n' + sampleLLMResult + '\n以上就是结构化后的面经。';
    const { client } = mockLLMClientWithResponse(makeLLMResponse(messy));

    const transcript = await parseTranscript(sampleRawText, client);

    expect(transcript.company).toBe('字节跳动');
    expect(transcript.questions).toHaveLength(3);
  });

  it('creates unique IDs for each transcript', async () => {
    const { client } = mockLLMClientWithResponse(makeLLMResponse(sampleLLMResult));

    const t1 = await parseTranscript(sampleRawText, client);
    const t2 = await parseTranscript(sampleRawText, client);

    expect(t1.id).not.toBe(t2.id);
  });

  it('passes rawText through unchanged', async () => {
    const { client } = mockLLMClientWithResponse(makeLLMResponse(sampleLLMResult));

    const transcript = await parseTranscript(sampleRawText, client);

    expect(transcript.rawText).toBe(sampleRawText);
  });

  it('propagates LLM errors', async () => {
    const { client } = mockLLMClientWithResponse(new Error('LLM service unavailable'));

    await expect(parseTranscript('test', client)).rejects.toThrow('LLM service unavailable');
  });
});