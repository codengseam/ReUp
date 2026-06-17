// src/features/resume/rewriter/contextual-rewriter.ts
// Phase 2 (Task 2.1): Contextual STAR rewrite engine.
//
// Takes match analysis results + diagnostic issues and produces targeted
// STAR rewrites per section. Streams output via onChunk callback.
// Tracks before/after changes for diff display.

import type { ResumeDocument, MatchReport } from '../types';
import type { LLMClient, Message } from '@/server/llm/llm-client';
import { runDiagnostics } from '../diagnostics';
import type { DiagnosticResult } from '../diagnostics';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TargetSection = 'experience' | 'projects' | 'skills';

export interface RewriteRequest {
  resume: ResumeDocument;
  matchReport?: MatchReport;
  targetSections: TargetSection[];
}

export interface RewriteChange {
  section: string;
  before: string;
  after: string;
  reason: string;
}

export interface RewriteResult {
  original: ResumeDocument;
  rewritten: ResumeDocument;
  changes: RewriteChange[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function renderSectionText(resume: ResumeDocument, section: TargetSection): string {
  if (section === 'skills') {
    return resume.skills.length > 0 ? resume.skills.join(', ') : '（无技能列表）';
  }
  const entries = section === 'experience' ? resume.experience : resume.projects;
  if (entries.length === 0) return '（无内容）';
  return entries
    .map((e) => {
      if ('company' in e) {
        return `[${e.company} - ${e.role} (${e.period})]\n${e.bullets.map((b) => `  - ${b}`).join('\n')}`;
      }
      return `[${e.name}${e.period ? ` (${e.period})` : ''}]\n${e.bullets.map((b) => `  - ${b}`).join('\n')}`;
    })
    .join('\n\n');
}

function renderDiagnosticsBlock(diag: DiagnosticResult): string {
  if (diag.issues.length === 0) return '（简历无诊断问题）';
  const lines: string[] = ['## 简历诊断问题'];
  for (const issue of diag.issues) {
    const sev = issue.severity === 'error' ? '严重' : issue.severity === 'warning' ? '注意' : '提示';
    lines.push(`- [${sev}] ${issue.message}${issue.suggestion ? `（建议：${issue.suggestion}）` : ''}`);
  }
  return lines.join('\n');
}

function renderMatchGapsBlock(matchReport?: MatchReport): string {
  if (!matchReport) return '（未提供 JD 匹配报告，请基于通用 STAR 法则优化）';
  const lines: string[] = ['## JD 匹配差距'];
  if (matchReport.gaps.length === 0) {
    lines.push('（无显著差距）');
  } else {
    for (const gap of matchReport.gaps) {
      const sev = gap.severity === 'high' ? '高' : gap.severity === 'medium' ? '中' : '低';
      lines.push(`- [${sev}优先级] ${gap.dimension}`);
    }
  }
  if (matchReport.priorities.length > 0) {
    lines.push('\n## 优化优先级');
    for (const p of matchReport.priorities) {
      lines.push(`${p.rank}. ${p.action}（预期影响：${p.expectedImpact}）`);
    }
  }
  return lines.join('\n');
}

const STAR_GUIDELINES = [
  '## STAR 法则改写指南',
  '- **Situation**: 简明描述背景/上下文（1-2句）',
  '- **Task**: 明确你的任务/目标（1句）',
  '- **Action**: 详细描述你采取的行动，使用强力动词（如：主导、设计、优化、重构）',
  '- **Result**: 量化成果（如：提升30%、减少50%延迟、覆盖100W+用户），没有数字则估算合理范围',
  '',
  '## 强制规则',
  '- 每一条原始 bullet 必须拆为 STAR 四段',
  '- 模糊动词（参与/协助/写过一些/还可以）必须替换为可量化动作',
  '- 数字必须可验证，未提供数字时使用合理估算',
  '- 保持原始事实和候选人信息不变，仅做表达优化',
  '- 输出纯文本，不要用 markdown 代码块包裹',
].join('\n');

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  resume: ResumeDocument,
  matchReport: MatchReport | undefined,
  diagnostics: DiagnosticResult,
): string {
  const parts: string[] = [
    '你是资深职业顾问 + HR 总监，专注简历优化。',
    '你的任务：基于 JD 匹配差距和诊断问题，用 STAR 法则重写候选人的简历指定段落。',
    '',
    STAR_GUIDELINES,
    '',
    '## 候选人背景',
    `姓名：${resume.basic.name ?? '（未填）'}`,
    `职位：${resume.basic.title ?? '（未填）'}`,
    `经验：${resume.basic.yearsOfExperience ?? '（未填）'} 年`,
    `技能：${resume.skills.length > 0 ? resume.skills.join(', ') : '（未填）'}`,
    '',
    renderDiagnosticsBlock(diagnostics),
    '',
    renderMatchGapsBlock(matchReport),
  ];

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Section user prompt
// ---------------------------------------------------------------------------

function buildSectionUserPrompt(
  resume: ResumeDocument,
  section: TargetSection,
  currentText: string,
): string {
  const sectionLabel = section === 'experience' ? '工作经历' : section === 'projects' ? '项目经历' : '技能列表';

  return [
    `请重写以下【${sectionLabel}】部分，用 STAR 法则逐条改写。`,
    '',
    '输出格式要求：',
    '1. 每条 bullet 输出为四段：*Situation* / *Task* / *Action* / *Result*',
    '2. 保留原始信息（公司、角色、时间、事实），只优化表达',
    '3. 为 Result 补充量化数据（如简历未提供，用合理估算）',
    '4. 不要输出任何标头或介绍，直接输出改写后的内容',
    '5. 不要用 markdown 代码块包裹',
    '',
    '## 当前内容',
    '```',
    currentText,
    '```',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Parse rewritten section back into ResumeDocument
// ---------------------------------------------------------------------------

function parseRewrittenSection(
  rewritten: ResumeDocument,
  section: TargetSection,
  text: string,
): void {
  if (section === 'skills') {
    const skills = text
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('*') && !s.startsWith('-'));
    rewritten.skills = skills;
    return;
  }

  const entries = section === 'experience' ? rewritten.experience : rewritten.projects;
  if (entries.length === 0) return;

  // Parse the LLM output back: split by entry headers [Company - Role (Period)]
  // or [Project Name (Period)], then extract STAR bullets
  const entryHeaderRe = /\[([^\]]+)\]/g;
  const blocks: { header: string; body: string }[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = entryHeaderRe.exec(text)) !== null) {
    if (blocks.length > 0) {
      blocks[blocks.length - 1]!.body = text.substring(lastIdx, match.index).trim();
    }
    blocks.push({ header: match[1]!, body: '' });
    lastIdx = match.index + match[0].length;
  }
  if (blocks.length > 0) {
    blocks[blocks.length - 1]!.body = text.substring(lastIdx).trim();
  }

  // If we couldn't parse headers, treat the entire text as a single block
  if (blocks.length === 0 && text.trim().length > 0) {
    blocks.push({ header: '', body: text.trim() });
  }

  for (let i = 0; i < entries.length && i < blocks.length; i++) {
    const entry = entries[i]!;
    const block = blocks[i]!;

    // Split body into STAR bullets (lines starting with *Situation*, *Task*, etc.)
    const starBullets = block.body
      .split(/\n(?=\*Situation\*|\*Task\*|\*Action\*|\*Result\*)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (starBullets.length > 0) {
      entry.bullets = starBullets;
    }
  }
}

// ---------------------------------------------------------------------------
// Streaming entry
// ---------------------------------------------------------------------------

export async function* rewriteResumeStream(
  request: RewriteRequest,
  llmClient: LLMClient,
  onChunk?: (chunk: string) => void,
): AsyncIterable<{ section: TargetSection; delta: string; done: boolean }> {
  const { resume, matchReport, targetSections } = request;
  const diagnostics = runDiagnostics(resume);
  const system = buildSystemPrompt(resume, matchReport, diagnostics);

  for (const section of targetSections) {
    const currentText = renderSectionText(resume, section);
    if (currentText === '（无内容）' || currentText === '（无技能列表）') {
      const placeholder = '（暂无内容，跳过改写）';
      const chunk = { section, delta: placeholder, done: false };
      onChunk?.(placeholder);
      yield chunk;
      const done = { section, delta: '', done: true };
      onChunk?.('');
      yield done;
      continue;
    }

    const user = buildSectionUserPrompt(resume, section, currentText);
    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const stream = llmClient.stream(messages, { timeoutMs: 90_000 });

    for await (const chunk of stream) {
      const delta = chunk.content;
      if (delta.length === 0) continue;
      const out = { section, delta, done: false };
      onChunk?.(delta);
      yield out;
    }

    const doneOut = { section, delta: '', done: true };
    onChunk?.('');
    yield doneOut;
  }
}

// ---------------------------------------------------------------------------
// Non-streaming wrapper
// ---------------------------------------------------------------------------

export async function rewriteResume(
  request: RewriteRequest,
  llmClient: LLMClient,
  onChunk?: (chunk: string) => void,
): Promise<RewriteResult> {
  const rewritten = deepClone(request.resume);
  const changes: RewriteChange[] = [];

  const sections: Record<TargetSection, string> = {
    experience: '',
    projects: '',
    skills: '',
  };

  for await (const chunk of rewriteResumeStream(request, llmClient, onChunk)) {
    if (chunk.done) continue;
    sections[chunk.section] += chunk.delta;
  }

  for (const section of request.targetSections) {
    const before = renderSectionText(request.resume, section);
    const after = sections[section];

    if (after.length > 0 && after !== '（暂无内容，跳过改写）') {
      parseRewrittenSection(rewritten, section, after);

      const reason =
        section === 'experience'
          ? '基于匹配差距和诊断问题，用 STAR 法则重写工作经历'
          : section === 'projects'
            ? '基于匹配差距和诊断问题，用 STAR 法则重写项目经历'
            : '基于 JD 需求优化技能列表';

      changes.push({
        section: section === 'experience' ? '工作经历' : section === 'projects' ? '项目经历' : '技能列表',
        before,
        after,
        reason,
      });
    }
  }

  return { original: request.resume, rewritten, changes };
}