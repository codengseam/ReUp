import { describe, it, expect, vi } from 'vitest';
import { analyzeTranscript } from '../analyzer';
import type { QuestionAnalysis, ComprehensiveAnalysis, AnalysisProgress } from '../analyzer';
import type { LLMClient } from '@/server/llm/llm-client';
import type { InterviewTranscript } from '../../transcript/parser';
import type { ResumeDocument } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';

function makeTranscript(questions: Array<{ question: string; answer: string }>): InterviewTranscript {
  return {
    id: 'test-transcript-1',
    company: '测试公司',
    position: '前端工程师',
    round: '一面',
    questions,
    result: '等待结果',
    rawText: 'test raw text',
    createdAt: new Date().toISOString(),
  };
}

function makeResume(): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: new Date().toISOString() },
    basic: { name: '张三', title: '前端工程师', yearsOfExperience: 5 },
    experience: [
      { company: 'A公司', role: '高级前端', period: '2022-2024', bullets: ['负责核心业务开发'] },
    ],
    projects: [],
    skills: ['React', 'TypeScript'],
    education: [],
    raw: 'test',
  };
}

function makeJD(): JDDocument {
  return {
    meta: { source: 'text', parsedAt: new Date().toISOString() },
    title: '高级前端工程师',
    hardRequirements: [
      { category: '技能', description: '精通React', priority: 'must' },
    ],
    responsibilities: ['负责前端架构设计'],
    skills: [{ name: 'React', level: '精通', required: true }],
    raw: 'test jd',
  };
}

function makeQuestionJSON(intent: string, evaluation: string, strengths: string[], weaknesses: string[], improved: string, knowledge: string[]) {
  return JSON.stringify({ intent, evaluation, strengths, weaknesses, improvedAnswer: improved, knowledgePoints: knowledge });
}

function createMockLLM(responses: string[]): LLMClient {
  let callIndex = 0;
  return {
    invoke: vi.fn().mockImplementation(() => {
      const content = responses[callIndex] ?? '{}';
      callIndex++;
      return Promise.resolve({ content });
    }),
    stream: vi.fn(),
    config: { apiKey: 'test', baseUrl: 'http://test', model: 'test', defaultTimeoutMs: 5000 },
  } as unknown as LLMClient;
}

function createFailingLLM(): LLMClient {
  return {
    invoke: vi.fn().mockRejectedValue(new Error('LLM error')),
    stream: vi.fn(),
    config: { apiKey: 'test', baseUrl: 'http://test', model: 'test', defaultTimeoutMs: 5000 },
  } as unknown as LLMClient;
}

describe('analyzeTranscript', () => {
  const singleQuestion = [{ question: '请做自我介绍', answer: '我叫张三，5年前端经验。' }];
  const multiQuestions = [
    { question: '请做自我介绍', answer: '我叫张三，5年前端经验。' },
    { question: 'React的虚拟DOM原理', answer: '虚拟DOM是React用于优化渲染性能的技术。' },
    { question: '你最大的缺点是什么', answer: '我有时候过于追求完美。' },
  ];

  it('returns empty analysis for empty questions', async () => {
    const transcript = makeTranscript([]);
    const llm = createMockLLM([]);
    const result = await analyzeTranscript(transcript, llm);

    expect(result.transcriptId).toBe('test-transcript-1');
    expect(result.questionAnalyses).toEqual([]);
    expect(result.commonIssues).toContain('面经中没有识别到任何问答');
    expect(result.trendAnalysis).toContain('无法进行趋势分析');
  });

  it('analyzes single question correctly', async () => {
    const transcript = makeTranscript(singleQuestion);
    const qaJSON = makeQuestionJSON(
      '了解候选人基本情况',
      '回答简洁清晰',
      ['表达清晰', '结构完整'],
      ['缺少亮点'],
      '改进后的自我介绍...',
      ['STAR法则', '自我介绍框架']
    );
    const compJSON = JSON.stringify({
      commonIssues: ['回答过于简短'],
      trendAnalysis: '整体表现平稳',
      resumeGaps: ['缺少项目细节'],
      overallSuggestions: ['多准备技术案例', '练习STAR法则'],
    });

    const llm = createMockLLM([qaJSON, compJSON]);
    const result = await analyzeTranscript(transcript, llm, { resume: makeResume() });

    expect(result.questionAnalyses).toHaveLength(1);
    expect(result.questionAnalyses[0]!.intent).toBe('了解候选人基本情况');
    expect(result.questionAnalyses[0]!.strengths).toEqual(['表达清晰', '结构完整']);
    expect(result.questionAnalyses[0]!.weaknesses).toEqual(['缺少亮点']);
    expect(result.questionAnalyses[0]!.improvedAnswer).toBe('改进后的自我介绍...');
    expect(result.commonIssues).toEqual(['回答过于简短']);
    expect(result.trendAnalysis).toBe('整体表现平稳');
    expect(result.resumeGaps).toEqual(['缺少项目细节']);
    expect(result.overallSuggestions).toEqual(['多准备技术案例', '练习STAR法则']);
  });

  it('analyzes multiple questions', async () => {
    const transcript = makeTranscript(multiQuestions);
    const responses = [
      makeQuestionJSON('intent1', 'eval1', ['s1'], ['w1'], 'improved1', ['kp1']),
      makeQuestionJSON('intent2', 'eval2', ['s2'], ['w2'], 'improved2', ['kp2']),
      makeQuestionJSON('intent3', 'eval3', ['s3'], ['w3'], 'improved3', ['kp3']),
      JSON.stringify({
        commonIssues: ['共性1'],
        trendAnalysis: '趋势分析',
        resumeGaps: [],
        overallSuggestions: ['建议1', '建议2'],
      }),
    ];
    const llm = createMockLLM(responses);
    const result = await analyzeTranscript(transcript, llm);

    expect(result.questionAnalyses).toHaveLength(3);
    expect(result.questionAnalyses[0]!.intent).toBe('intent1');
    expect(result.questionAnalyses[1]!.intent).toBe('intent2');
    expect(result.questionAnalyses[2]!.intent).toBe('intent3');
    expect(result.commonIssues).toEqual(['共性1']);
    expect(result.trendAnalysis).toBe('趋势分析');
  });

  it('handles LLM failure on individual question with fallback', async () => {
    const transcript = makeTranscript(singleQuestion);
    const llm = createFailingLLM();
    // Need a comp response too since it will try
    const result = await analyzeTranscript(transcript, llm);

    expect(result.questionAnalyses).toHaveLength(1);
    expect(result.questionAnalyses[0]!.intent).toBe('分析失败');
    expect(result.questionAnalyses[0]!.weaknesses).toContain('分析失败，请重试');
  });

  it('emits progress events via callback', async () => {
    const transcript = makeTranscript(singleQuestion);
    const qaJSON = makeQuestionJSON('intent', 'eval', ['s'], ['w'], 'improved', ['kp']);
    const compJSON = JSON.stringify({
      commonIssues: ['issue'],
      trendAnalysis: 'trend',
      resumeGaps: [],
      overallSuggestions: ['sug'],
    });
    const llm = createMockLLM([qaJSON, compJSON]);

    const events: AnalysisProgress[] = [];
    await analyzeTranscript(transcript, llm, undefined, (progress) => {
      events.push(progress);
    });

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0]!.type).toBe('question_start');
    expect(events[1]!.type).toBe('question_done');
    expect(events[2]!.type).toBe('comprehensive_start');
    expect(events[events.length - 1]!.type).toBe('complete');
  });

  it('handles JSON in markdown code block', async () => {
    const transcript = makeTranscript(singleQuestion);
    const qaJSON = '```json\n' + makeQuestionJSON('intent', 'eval', ['s'], ['w'], 'improved', ['kp']) + '\n```';
    const compJSON = '```json\n' + JSON.stringify({
      commonIssues: ['issue'],
      trendAnalysis: 'trend',
      resumeGaps: [],
      overallSuggestions: ['sug'],
    }) + '\n```';
    const llm = createMockLLM([qaJSON, compJSON]);

    const result = await analyzeTranscript(transcript, llm);
    expect(result.questionAnalyses[0]!.intent).toBe('intent');
    expect(result.trendAnalysis).toBe('trend');
  });

  it('handles invalid JSON with fallback', async () => {
    const transcript = makeTranscript(singleQuestion);
    const llm = createMockLLM(['not valid json', 'also not json']);
    const result = await analyzeTranscript(transcript, llm);

    expect(result.questionAnalyses).toHaveLength(1);
    expect(result.questionAnalyses[0]!.weaknesses).toContain('分析失败，请重试');
  });

  it('handles missing fields gracefully', async () => {
    const transcript = makeTranscript(singleQuestion);
    const llm = createMockLLM(['{}', '{}']);
    const result = await analyzeTranscript(transcript, llm);

    expect(result.questionAnalyses[0]!.intent).toBe('');
    expect(result.questionAnalyses[0]!.strengths).toEqual([]);
    expect(result.questionAnalyses[0]!.weaknesses).toEqual([]);
    expect(result.questionAnalyses[0]!.improvedAnswer).toBe('');
    expect(result.questionAnalyses[0]!.knowledgePoints).toEqual([]);
  });

  it('cross-references with resume and JD', async () => {
    const transcript = makeTranscript(singleQuestion);
    const qaJSON = makeQuestionJSON('intent', 'eval', ['s'], ['w'], 'improved', ['kp']);
    const compJSON = JSON.stringify({
      commonIssues: ['issue'],
      trendAnalysis: 'trend',
      resumeGaps: ['gap1'],
      overallSuggestions: ['sug'],
    });
    const llm = createMockLLM([qaJSON, compJSON]);

    const result = await analyzeTranscript(transcript, llm, {
      resume: makeResume(),
      jd: makeJD(),
    });

    expect(result.resumeGaps).toEqual(['gap1']);
  });

  it('without resume, resumeGaps is empty', async () => {
    const transcript = makeTranscript(singleQuestion);
    const qaJSON = makeQuestionJSON('intent', 'eval', ['s'], ['w'], 'improved', ['kp']);
    const compJSON = JSON.stringify({
      commonIssues: ['issue'],
      trendAnalysis: 'trend',
      resumeGaps: ['gap1'],
      overallSuggestions: ['sug'],
    });
    const llm = createMockLLM([qaJSON, compJSON]);

    const result = await analyzeTranscript(transcript, llm);
    expect(result.resumeGaps).toEqual([]);
  });
});