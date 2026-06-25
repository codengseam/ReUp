// src/features/interview/transcript/parser.ts
// Structured interview transcript parser using LLM.

import type { LLMClient } from '@/server/llm/llm-client';
import { createLogger } from '@/server/logger';

const logger = createLogger('interview:transcript:parser');

export interface InterviewTranscript {
  id: string;
  company?: string;
  position?: string;
  round?: string; // "一面" | "二面" | "终面" | "HR面" etc.
  questions: Array<{
    question: string;
    answer: string;
    interviewerNote?: string;
  }>;
  result?: string; // "通过" | "未通过" | "等待结果"
  rawText: string;
  createdAt: string;
}

interface ParsedTranscriptOutput {
  company?: string;
  position?: string;
  round?: string;
  questions: Array<{
    question: string;
    answer: string;
    interviewerNote?: string;
  }>;
  result?: string;
}

function buildParsePrompt(rawText: string, meta?: { company?: string; position?: string; round?: string }): string {
  const metaHint = meta
    ? `用户提供了一些额外信息，可作为参考：${JSON.stringify(meta)}`
    : '请从文本中自动提取所有信息。';

  return `你是一位专业的面试复盘助手。请从以下面试经历文本中提取结构化信息。

${metaHint}

面试经历文本：
"""
${rawText}
"""

请提取以下信息并返回严格 JSON 格式（不要包含 markdown 代码块标记）：
{
  "company": "公司名称（如果文本中提到了）",
  "position": "面试职位（如果文本中提到了）",
  "round": "面试轮次：一面/二面/三面/终面/HR面/群面/技术面（如果文本中提到了）",
  "questions": [
    {
      "question": "面试官提出的问题",
      "answer": "候选人的回答",
      "interviewerNote": "面试官的点评或追问（如有）"
    }
  ],
  "result": "面试结果：通过/未通过/等待结果（如果文本中提到了）"
}

要求：
1. 每个 question 和 answer 字段不能为空
2. 如果文本中某个问题只有问没有答，该 answer 填 "（未记录回答）"
3. 只返回 JSON，不要有任何额外的文字说明`;
}

function parseLLMResponse(content: string): ParsedTranscriptOutput {
  // Strip possible markdown code fences
  let json = content.trim();
  if (json.startsWith('```')) {
    const end = json.lastIndexOf('```');
    if (end > 3) {
      json = json.slice(json.indexOf('\n') + 1, end).trim();
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Fallback: try to extract JSON from the content
    const match = json.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  const obj = parsed as Record<string, unknown>;

  const questions: Array<{ question: string; answer: string; interviewerNote?: string }> = [];
  if (Array.isArray(obj.questions)) {
    for (const q of obj.questions) {
      if (typeof q === 'object' && q !== null) {
        const qi = q as Record<string, unknown>;
        const question = typeof qi.question === 'string' ? qi.question.trim() : '';
        const answer = typeof qi.answer === 'string' ? qi.answer.trim() : '';
        if (question || answer) {
          questions.push({
            question: question || '（未识别问题）',
            answer: answer || '（未记录回答）',
            interviewerNote: typeof qi.interviewerNote === 'string' ? qi.interviewerNote : undefined,
          });
        }
      }
    }
  }

  return {
    company: typeof obj.company === 'string' ? obj.company : undefined,
    position: typeof obj.position === 'string' ? obj.position : undefined,
    round: typeof obj.round === 'string' ? obj.round : undefined,
    questions,
    result: typeof obj.result === 'string' ? obj.result : undefined,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

// ===== Transcript Store =====

const TRANSCRIPT_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const transcriptStore = new Map<string, InterviewTranscript>();

function cleanupExpiredTranscripts(): void {
  const now = Date.now();
  for (const [id, transcript] of transcriptStore) {
    const createdAt = new Date(transcript.createdAt).getTime();
    if (now - createdAt > TRANSCRIPT_TTL_MS) {
      transcriptStore.delete(id);
    }
  }
}

const cleanupTimer = setInterval(cleanupExpiredTranscripts, CLEANUP_INTERVAL_MS);
if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
  cleanupTimer.unref();
}

export function storeTranscript(transcript: InterviewTranscript): void {
  transcriptStore.set(transcript.id, transcript);
}

export function getTranscript(id: string): InterviewTranscript | undefined {
  return transcriptStore.get(id);
}

export function listTranscripts(): InterviewTranscript[] {
  return Array.from(transcriptStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function deleteTranscript(id: string): boolean {
  return transcriptStore.delete(id);
}

/**
 * Parse raw interview text into a structured InterviewTranscript using LLM.
 */
export async function parseTranscript(
  rawText: string,
  llmClient: LLMClient,
  meta?: { company?: string; position?: string; round?: string }
): Promise<InterviewTranscript> {
  const prompt = buildParsePrompt(rawText, meta);
  const response = await llmClient.invoke([
    { role: 'system', content: '你是一位专业的面试复盘助手，擅长从面试经历中提取结构化信息。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.2 });

  logger.info('Transcript parsed by LLM', { traceId: generateId() });

  const parsed = parseLLMResponse(response.content);

  return {
    id: generateId(),
    company: parsed.company || meta?.company,
    position: parsed.position || meta?.position,
    round: parsed.round || meta?.round,
    questions: parsed.questions,
    result: parsed.result,
    rawText,
    createdAt: new Date().toISOString(),
  };
}