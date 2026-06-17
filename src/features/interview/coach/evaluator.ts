import type { LLMClient } from '@/server/llm/llm-client';
import type { ResumeDocument } from '@/features/resume/types';
import { createLogger } from '@/server/logger';

const logger = createLogger('interview:coach:evaluator');

export interface InterviewMessage {
  role: 'interviewer' | 'candidate';
  content: string;
}

export interface InterviewReport {
  overallScore: number; // 1-10
  strengths: string[];
  weaknesses: string[];
  phaseScores: Record<string, number>;
  suggestions: string[];
  summary: string;
}

function buildEvalPrompt(messages: InterviewMessage[], resume: ResumeDocument): string {
  const name = resume.basic.name ?? '候选人';
  const title = resume.basic.title ?? '';

  const transcript = messages
    .map((m) => `[${m.role === 'interviewer' ? '面试官' : '候选人'}]: ${m.content}`)
    .join('\n');

  return `你是一位资深面试评估专家。请根据以下面试对话，对候选人进行综合评估。

候选人：${name}${title ? `（${title}）` : ''}

面试记录：
${transcript}

请输出 JSON 格式（不要包含其他内容）：
{
  "overallScore": 7,
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["不足1", "不足2"],
  "phaseScores": {
    "自我介绍": 7,
    "项目深挖": 6,
    "技术考察": 5,
    "行为面试": 8
  },
  "suggestions": ["建议1", "建议2"],
  "summary": "总体评价文字描述"
}

评分规则：
- overallScore: 1-10 整数
- phaseScores: 每个阶段 1-10 整数，未涉及的阶段填 0
- strengths: 至少 2 条，最多 5 条
- weaknesses: 至少 1 条，最多 5 条
- suggestions: 至少 2 条具体改进建议
- summary: 100-300 字总体评价`;
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

export async function evaluateInterview(
  messages: InterviewMessage[],
  resume: ResumeDocument,
  llmClient: LLMClient
): Promise<InterviewReport> {
  if (messages.length === 0) {
    return {
      overallScore: 0,
      strengths: [],
      weaknesses: ['未进行任何面试对话'],
      phaseScores: {},
      suggestions: ['建议完成至少一轮面试对话后再生成报告'],
      summary: '面试尚未开始，无法生成评估报告。',
    };
  }

  const prompt = buildEvalPrompt(messages, resume);

  try {
    const response = await llmClient.invoke([{ role: 'user', content: prompt }]);
    const jsonStr = extractJSON(response.content);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    return {
      overallScore: typeof parsed.overallScore === 'number' ? Math.round(parsed.overallScore) : 0,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
      phaseScores: typeof parsed.phaseScores === 'object' && parsed.phaseScores !== null
        ? Object.fromEntries(
            Object.entries(parsed.phaseScores as Record<string, unknown>).map(([k, v]) => [
              k,
              typeof v === 'number' ? Math.round(v) : 0,
            ])
          )
        : {},
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    };
  } catch (err) {
    logger.error('LLM evaluation failed, using fallback', err instanceof Error ? err : undefined);

    const candidateMessages = messages.filter((m) => m.role === 'candidate');
    const responseCount = candidateMessages.length;
    const avgLength = responseCount > 0
      ? candidateMessages.reduce((sum, m) => sum + m.content.length, 0) / responseCount
      : 0;

    let score = 5;
    if (avgLength > 200) score = 7;
    if (avgLength > 500) score = 8;
    if (responseCount === 0) score = 0;

    return {
      overallScore: score,
      strengths: ['能够完成面试对话'],
      weaknesses: ['系统无法生成详细评估，请参考对话记录自行复盘'],
      phaseScores: {},
      suggestions: ['建议重试生成报告', '回顾面试对话中的关键问题'],
      summary: `面试共 ${responseCount} 轮对话。由于系统原因无法生成详细评估，以上为自动估算结果。`,
    };
  }
}