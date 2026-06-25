import type { LLMClient } from '@/server/llm/llm-client';
import type { InterviewTranscript } from '../transcript/parser';
import type { ResumeDocument } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';
import { createLogger } from '@/server/logger';

const logger = createLogger('interview:analysis:analyzer');

export interface QuestionAnalysis {
  question: string;
  answer: string;
  intent: string;
  evaluation: string;
  strengths: string[];
  weaknesses: string[];
  improvedAnswer: string;
  knowledgePoints: string[];
}

export interface ComprehensiveAnalysis {
  transcriptId: string;
  questionAnalyses: QuestionAnalysis[];
  commonIssues: string[];
  trendAnalysis: string;
  resumeGaps: string[];
  overallSuggestions: string[];
}

export type AnalysisProgress = {
  type: 'question_start';
  index: number;
  total: number;
} | {
  type: 'question_done';
  index: number;
  total: number;
  analysis: QuestionAnalysis;
} | {
  type: 'comprehensive_start';
} | {
  type: 'comprehensive_done';
  commonIssues: string[];
  trendAnalysis: string;
  resumeGaps: string[];
  overallSuggestions: string[];
} | {
  type: 'complete';
  result: ComprehensiveAnalysis;
};

function buildQuestionPrompt(
  question: string,
  answer: string,
  index: number,
  total: number,
  resume?: ResumeDocument,
  jd?: JDDocument
): string {
  const resumeContext = resume
    ? `\n候选人简历背景：\n- 姓名：${resume.basic.name ?? '未知'}\n- 职位：${resume.basic.title ?? '未知'}\n- 工作年限：${resume.basic.yearsOfExperience ?? '未知'}年\n- 技能：${resume.skills.join('、') || '无'}`
    : '';

  const jdContext = jd
    ? `\n目标职位 JD：\n- 职位：${jd.title}\n- 硬性要求：${jd.hardRequirements.map(r => r.description).join('；')}\n- 技能要求：${jd.skills.map(s => `${s.name}(${s.level})`).join('、')}`
    : '';

  return `你是一位资深面试评估专家。请对以下面试问答进行深度分析。

这是第 ${index + 1}/${total} 个问题。${resumeContext}${jdContext}

面试官问题：
"""
${question}
"""

候选人回答：
"""
${answer}
"""

请输出严格 JSON 格式（不要包含 markdown 代码块标记）：
{
  "intent": "面试官考察意图（50-100字，分析面试官想通过这个问题了解什么）",
  "evaluation": "回答评估（100-200字，综合评价回答质量）",
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["不足1", "不足2"],
  "improvedAnswer": "改进后的回答话术（提供具体、可用的改进版本）",
  "knowledgePoints": ["相关知识补充1", "相关知识补充2"]
}

要求：
1. intent 要具体，不要泛泛而谈
2. evaluation 要客观，有依据
3. strengths 至少 1 条，最多 3 条
4. weaknesses 至少 1 条，最多 3 条
5. improvedAnswer 要具体可操作，不少于 100 字
6. knowledgePoints 至少 1 条，最多 5 条
7. 只返回 JSON，不要有任何额外的文字说明`;
}

function buildComprehensivePrompt(
  questionAnalyses: QuestionAnalysis[],
  resume?: ResumeDocument,
  jd?: JDDocument
): string {
  const analysesText = questionAnalyses
    .map((qa, i) => {
      return `问题${i + 1}：${qa.question}
考察意图：${qa.intent}
优点：${qa.strengths.join('、')}
不足：${qa.weaknesses.join('、')}`;
    })
    .join('\n\n');

  const resumeContext = resume
    ? `\n候选人简历背景：${resume.basic.name ?? '未知'}，${resume.basic.title ?? '未知'}，${resume.basic.yearsOfExperience ?? '未知'}年经验，技能：${resume.skills.join('、')}`
    : '';

  const jdContext = jd
    ? `\n目标职位：${jd.title}，要求：${jd.skills.map(s => s.name).join('、')}`
    : '';

  return `你是一位资深面试评估专家。请基于以下所有面试问题的分析结果，进行综合分析。

${resumeContext}${jdContext}

各问题分析汇总：
${analysesText}

请输出严格 JSON 格式（不要包含 markdown 代码块标记）：
{
  "commonIssues": ["共性问题1", "共性问题2"],
  "trendAnalysis": "趋势分析（100-200字，分析候选人在面试中表现出的整体趋势和模式）",
  "resumeGaps": ["简历暴露的弱项1", "简历暴露的弱项2"],
  "overallSuggestions": ["综合改进建议1", "综合改进建议2"]
}

要求：
1. commonIssues 至少 1 条，最多 5 条，反映跨问题的共性不足
2. trendAnalysis 要分析回答质量的变化趋势
3. resumeGaps 结合简历（如有）分析暴露的弱项，无简历时返回空数组
4. overallSuggestions 至少 2 条，最多 5 条，具体可操作
5. 只返回 JSON，不要有任何额外的文字说明`;
}

function extractJSON(text: string): string {
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlock) return jsonBlock[1].trim();
  const codeBlock = text.match(/```\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function parseQuestionAnalysis(
  question: string,
  answer: string,
  raw: string
): QuestionAnalysis {
  try {
    const json = extractJSON(raw);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    return {
      question,
      answer,
      intent: typeof parsed.intent === 'string' ? parsed.intent : '',
      evaluation: typeof parsed.evaluation === 'string' ? parsed.evaluation : '',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
      improvedAnswer: typeof parsed.improvedAnswer === 'string' ? parsed.improvedAnswer : '',
      knowledgePoints: Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints.map(String) : [],
    };
  } catch {
    logger.warn('Failed to parse question analysis JSON, using fallback');
    return {
      question,
      answer,
      intent: '无法解析分析结果',
      evaluation: 'LLM 返回格式异常，请重试',
      strengths: [],
      weaknesses: ['分析失败，请重试'],
      improvedAnswer: '',
      knowledgePoints: [],
    };
  }
}

function parseComprehensiveAnalysis(
  raw: string,
  hasResume: boolean
): Pick<ComprehensiveAnalysis, 'commonIssues' | 'trendAnalysis' | 'resumeGaps' | 'overallSuggestions'> {
  try {
    const json = extractJSON(raw);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    return {
      commonIssues: Array.isArray(parsed.commonIssues) ? parsed.commonIssues.map(String) : [],
      trendAnalysis: typeof parsed.trendAnalysis === 'string' ? parsed.trendAnalysis : '',
      resumeGaps: hasResume && Array.isArray(parsed.resumeGaps) ? parsed.resumeGaps.map(String) : [],
      overallSuggestions: Array.isArray(parsed.overallSuggestions) ? parsed.overallSuggestions.map(String) : [],
    };
  } catch {
    logger.warn('Failed to parse comprehensive analysis JSON, using fallback');
    return {
      commonIssues: ['无法生成综合分析'],
      trendAnalysis: 'LLM 返回格式异常，请重试',
      resumeGaps: [],
      overallSuggestions: ['建议重新运行分析'],
    };
  }
}

/**
 * Deep analysis of interview transcripts.
 * Analyzes each question individually and generates a comprehensive report.
 */
export async function analyzeTranscript(
  transcript: InterviewTranscript,
  llmClient: LLMClient,
  context?: {
    resume?: ResumeDocument;
    jd?: JDDocument;
  },
  onProgress?: (progress: AnalysisProgress) => void
): Promise<ComprehensiveAnalysis> {
  const questions = transcript.questions;
  if (questions.length === 0) {
    return {
      transcriptId: transcript.id,
      questionAnalyses: [],
      commonIssues: ['面经中没有识别到任何问答'],
      trendAnalysis: '无问答数据，无法进行趋势分析。',
      resumeGaps: [],
      overallSuggestions: ['请确认面经内容是否完整，重新上传后再试。'],
    };
  }

  const questionAnalyses: QuestionAnalysis[] = [];

  // Analyze each question sequentially
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    onProgress?.({ type: 'question_start', index: i, total: questions.length });

    try {
      const prompt = buildQuestionPrompt(
        q.question,
        q.answer,
        i,
        questions.length,
        context?.resume,
        context?.jd
      );
      const response = await llmClient.invoke(
        [{ role: 'user', content: prompt }],
        { temperature: 0.3 }
      );
      const analysis = parseQuestionAnalysis(q.question, q.answer, response.content);
      questionAnalyses.push(analysis);
      onProgress?.({ type: 'question_done', index: i, total: questions.length, analysis });
    } catch (err) {
      logger.error(`Question analysis failed for index ${i}`, err instanceof Error ? err : undefined);
      const fallback: QuestionAnalysis = {
        question: q.question,
        answer: q.answer,
        intent: '分析失败',
        evaluation: `LLM 调用失败：${err instanceof Error ? err.message : '未知错误'}`,
        strengths: [],
        weaknesses: ['分析失败，请重试'],
        improvedAnswer: '',
        knowledgePoints: [],
      };
      questionAnalyses.push(fallback);
      onProgress?.({ type: 'question_done', index: i, total: questions.length, analysis: fallback });
    }
  }

  // Generate comprehensive analysis
  onProgress?.({ type: 'comprehensive_start' });

  try {
    const comprehensivePrompt = buildComprehensivePrompt(
      questionAnalyses,
      context?.resume,
      context?.jd
    );
    const response = await llmClient.invoke(
      [{ role: 'user', content: comprehensivePrompt }],
      { temperature: 0.3 }
    );
    const comprehensive = parseComprehensiveAnalysis(response.content, !!context?.resume);

    onProgress?.({
      type: 'comprehensive_done',
      ...comprehensive,
    });

    const result: ComprehensiveAnalysis = {
      transcriptId: transcript.id,
      questionAnalyses,
      ...comprehensive,
    };

    onProgress?.({ type: 'complete', result });
    return result;
  } catch (err) {
    logger.error('Comprehensive analysis failed', err instanceof Error ? err : undefined);

    const fallback: ComprehensiveAnalysis = {
      transcriptId: transcript.id,
      questionAnalyses,
      commonIssues: ['综合分析与共性趋势分析生成失败'],
      trendAnalysis: `LLM 调用失败：${err instanceof Error ? err.message : '未知错误'}`,
      resumeGaps: [],
      overallSuggestions: ['建议重新运行综合分析'],
    };

    onProgress?.({ type: 'complete', result: fallback });
    return fallback;
  }
}