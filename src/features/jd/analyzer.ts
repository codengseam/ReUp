// src/features/jd/analyzer.ts
// ReUp v2: JD-only and JD-deep analysis pipeline.
// Provides LLM-driven JD expert analysis with a deterministic rule-based fallback.

import type { LLMClient, Message } from '@/server/llm/llm-client';
import type { JDDocument } from './types';

export interface JDAnalysis {
  /** One-sentence summary of the role. */
  summary: string;
  /** Core competencies the JD is really looking for. */
  keyCompetencies: string[];
  /** Likely interview questions grouped by weight. */
  interviewQuestions: Array<{
    question: string;
    weight: 'high' | 'medium' | 'low';
    purpose: string;
  }>;
  /** Hidden risks or red flags a candidate should watch for. */
  hiddenRisks: string[];
  /** Culture / team fit hints. */
  cultureFit: string[];
  /** Possible career growth path from this role. */
  growthPath: string[];
}

const JD_ANALYSIS_SYSTEM_PROMPT =
  '你是资深 HR 与用人部门负责人。请基于以下 JD 文本，给出专业、结构化的岗位分析。' +
  '严格输出 JSON 对象，不要输出 markdown 或其他说明文字。';

const JD_ANALYSIS_USER_TEMPLATE = (jdRaw: string) =>
  `请分析以下岗位描述，输出 JSON：\n` +
  `{\n` +
  `  "summary": "一句话岗位概要",\n` +
  `  "keyCompetencies": ["核心能力1", "核心能力2"],\n` +
  `  "interviewQuestions": [\n` +
  `    {"question": "面试问题", "weight": "high|medium|low", "purpose": "考察目的"}\n` +
  `  ],\n` +
  `  "hiddenRisks": ["隐藏风险1"],\n` +
  `  "cultureFit": ["文化匹配点1"],\n` +
  `  "growthPath": ["成长路径1"]\n` +
  `}\n\nJD 文本：\n${jdRaw}`;

function ruleBasedJDAnalysis(jd: JDDocument): JDAnalysis {
  const responsibilities = jd.responsibilities.slice(0, 5);
  const hardMust = jd.hardRequirements.filter((r) => r.priority === 'must').map((r) => r.description);
  const skills = jd.skills.filter((s) => s.required).map((s) => `${s.name}（${s.level}）`);

  const summary =
    jd.title && jd.title !== '未命名职位'
      ? `招聘 ${jd.title}${jd.level ? `（${jd.level}）` : ''}，要求候选人具备 ${skills.slice(0, 3).join('、')} 等核心技能。`
      : `该岗位希望候选人具备 ${skills.slice(0, 3).join('、')} 等能力，并承担 ${responsibilities[0] ?? '相关职责'}。`;

  const interviewQuestions: JDAnalysis['interviewQuestions'] = [
    ...hardMust.slice(0, 3).map((desc) => ({
      question: `请结合过往经历，谈谈您如何满足「${desc}」这一要求？`,
      weight: 'high' as const,
      purpose: '验证硬性要求是否真实匹配',
    })),
    ...responsibilities.slice(0, 3).map((resp) => ({
      question: `在「${resp}」方面，您有哪些可复用的方法论或成功案例？`,
      weight: 'medium' as const,
      purpose: '评估职责胜任力与经验深度',
    })),
    {
      question: '您对这个岗位的团队氛围和工作节奏有什么期待？',
      weight: 'low' as const,
      purpose: '初步判断文化匹配度',
    },
  ];

  return {
    summary,
    keyCompetencies: [...new Set([...hardMust.slice(0, 4), ...skills.slice(0, 4), ...responsibilities.slice(0, 3)])],
    interviewQuestions,
    hiddenRisks: [
      'JD 中「必须项」较多时，简历需逐条对应，否则容易在初筛被过滤',
      ...jd.hardRequirements
        .filter((r) => r.category === '经验' && r.priority === 'must')
        .map((r) => `硬性经验要求「${r.description}」，若明显不符建议谨慎投递`),
    ],
    cultureFit: jd.team?.culture?.length
      ? jd.team.culture
      : ['建议面试中主动了解团队技术栈、汇报线与迭代节奏'],
    growthPath: [
      '深入核心业务域，积累端到端项目 ownership',
      '向技术专家或团队负责人方向发展',
    ],
  };
}

function parseJDAnalysis(content: string): JDAnalysis | null {
  if (!content || content.trim().length === 0) return null;
  let body = content.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = (fence[1] ?? '').trim();

  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first < 0 || last < 0 || last < first) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.substring(first, last + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary : '';
  const keyCompetencies = Array.isArray(obj.keyCompetencies)
    ? obj.keyCompetencies.filter((x): x is string => typeof x === 'string')
    : [];
  const hiddenRisks = Array.isArray(obj.hiddenRisks)
    ? obj.hiddenRisks.filter((x): x is string => typeof x === 'string')
    : [];
  const cultureFit = Array.isArray(obj.cultureFit)
    ? obj.cultureFit.filter((x): x is string => typeof x === 'string')
    : [];
  const growthPath = Array.isArray(obj.growthPath)
    ? obj.growthPath.filter((x): x is string => typeof x === 'string')
    : [];

  const interviewQuestions: JDAnalysis['interviewQuestions'] = [];
  if (Array.isArray(obj.interviewQuestions)) {
    for (const item of obj.interviewQuestions) {
      if (!item || typeof item !== 'object') continue;
      const q = item as Record<string, unknown>;
      const question = typeof q.question === 'string' ? q.question : '';
      const purpose = typeof q.purpose === 'string' ? q.purpose : '';
      const weightRaw = q.weight;
      const weight = weightRaw === 'high' || weightRaw === 'medium' || weightRaw === 'low' ? weightRaw : 'medium';
      if (question.length > 0) {
        interviewQuestions.push({ question, weight, purpose });
      }
    }
  }

  return {
    summary,
    keyCompetencies,
    interviewQuestions,
    hiddenRisks,
    cultureFit,
    growthPath,
  };
}

export interface AnalyzeJDOptions {
  llmClient?: LLMClient;
}

/**
 * Analyze a JD document from an expert (HR + hiring manager) perspective.
 * Tries LLM first, falls back to rule-based extraction on any failure.
 */
export async function analyzeJD(
  jd: JDDocument,
  opts: AnalyzeJDOptions = {},
): Promise<JDAnalysis> {
  if (opts.llmClient) {
    try {
      const messages: Message[] = [
        { role: 'system', content: JD_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: JD_ANALYSIS_USER_TEMPLATE(jd.raw) },
      ];
      const res = await opts.llmClient.invoke(messages, { timeoutMs: 30_000 });
      const parsed = parseJDAnalysis(res.content);
      if (parsed && parsed.summary.length > 0) return parsed;
    } catch {
      // fall through to rule-based
    }
  }
  return ruleBasedJDAnalysis(jd);
}
