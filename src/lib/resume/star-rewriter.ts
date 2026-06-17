// src/lib/resume/star-rewriter.ts
// Phase 3 P0 — B3 STAR 改写 engine (streaming)
//
// 设计要点:
// - 4 段独立流式输出: 我的分析 / STAR改写 / 底层心法 / 建议
// - 复用 B2 的 buildStarRewritePrompt(system+user), user 段追加 section 提示
//   "请先输出【<section>】部分。" 让 LLM 单次只输出一段
// - 输出过滤: 丢弃【下一节】+ 后续段标头 (跨段泄漏), 允许在 LLM 多输出时自动截断
// - 自身段标头【<current>】一并剥离, UI 拿到的是纯文本
// - 简历空 (experience + projects 都为空) → 直接吐 4 段占位 "（暂无内容）", 不调 LLM
// - Confidence = min(1, 累计字符数 / 2000), 0 字符 = 0
// - mock LLMClient 方式: vi.spyOn 替换 .stream() 为 async generator
//
// 不修改 llm-client / types / parser-text / prompts/star。

import { LLMClient, type Message } from '@/lib/llm-client';
import { buildStarRewritePrompt } from './prompts/star';
import type { ResumeDocument } from './types';
import { getResumePrompt } from './admin-config';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type StarSection = '我的分析' | 'STAR改写' | '底层心法' | '建议';

export interface StarChunk {
  section: StarSection;
  /** 文本增量 (去标头/去【下一节】后) */
  delta: string;
  /** 该段最后一个 chunk: true */
  done: boolean;
}

export interface StarRewriteResult {
  sections: Record<StarSection, string>;
  citations?: Array<{ id: string; text: string; source?: string }>;
  /** 0-1, 公式: min(1, 4 段累计字符数 / 2000) */
  confidence: number;
}

export interface StarRewriteOptions {
  /** 默认: new LLMClient() (从 process.env.DASHSCOPE_API_KEY 等读取) */
  llmClient?: LLMClient;
  /** AbortController, 透传到每次 llmClient.stream() 调用 */
  signal?: AbortSignal;
  /** 每个 StarChunk (含 done) 同步触发一次 */
  onChunk?: (chunk: StarChunk) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STAR_SECTIONS: ReadonlyArray<StarSection> = [
  '我的分析',
  'STAR改写',
  '底层心法',
  '建议',
];

const PLACEHOLDER = '（暂无内容）';

/** Confidence 公式分母: 累计字符达到该值时 confidence 达到 1.0 */
const CONFIDENCE_CHARS_CEILING = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmptyResume(resume: ResumeDocument): boolean {
  return resume.experience.length === 0 && resume.projects.length === 0;
}

/**
 * 找最早出现的 "跨段泄漏" 标头 (【下一节】 / 当前段之后的【段名】).
 * 返回其在 delta 中的索引; 未找到返回 -1.
 */
function findLeakIndex(delta: string, currentSection: StarSection): number {
  const idx = STAR_SECTIONS.indexOf(currentSection);
  let earliest = -1;
  const markers: string[] = ['【下一节】'];
  for (let j = idx + 1; j < STAR_SECTIONS.length; j++) {
    const later = STAR_SECTIONS[j];
    if (later) markers.push(`【${later}】`);
  }
  for (const m of markers) {
    const i = delta.indexOf(m);
    if (i >= 0 && (earliest === -1 || i < earliest)) {
      earliest = i;
    }
  }
  return earliest;
}

/** 剥离当前段自身的标头, 例如【我的分析】 */
function stripOwnMarker(delta: string, currentSection: StarSection): string {
  return delta.split(`【${currentSection}】`).join('');
}

// ---------------------------------------------------------------------------
// Streaming entry
// ---------------------------------------------------------------------------

/**
 * 段级流式 STAR 改写. 顺序输出 4 段, 每段内:
 *   - 多次 yield { section, delta, done: false }
 *   - 最后一次 yield { section, delta: '', done: true }
 * LLM 多输出的【下一节】/ 后续段标头会被丢弃 (包含标头之后的内容, 避免污染).
 */
export async function* rewriteResumeStream(
  resume: ResumeDocument,
  opts: StarRewriteOptions = {},
): AsyncIterable<StarChunk> {
  const client = opts.llmClient ?? new LLMClient();

  // Fast path: 空简历 → 4 段占位, 不调 LLM
  if (isEmptyResume(resume)) {
    for (const section of STAR_SECTIONS) {
      const content: StarChunk = { section, delta: PLACEHOLDER, done: false };
      opts.onChunk?.(content);
      yield content;
      const done: StarChunk = { section, delta: '', done: true };
      opts.onChunk?.(done);
      yield done;
    }
    return;
  }

  const { system: defaultSystem, user } = buildStarRewritePrompt(resume);
  // Phase 6 (C6): read the admin-overridable STAR system prompt. When present
  // and non-empty, replace the default wholesale so admins can retune the
  // prompt without code changes.
  const customSystem = await getResumePrompt('star');
  const system = customSystem && customSystem.trim().length > 0 ? customSystem : defaultSystem;

  for (const section of STAR_SECTIONS) {
    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: `${user}\n\n请先输出【${section}】部分。` },
    ];

    const stream = client.stream(messages, { signal: opts.signal, timeoutMs: 90_000 });

    let stopped = false;

    // 异常向上抛 (abort / 401 / 429 / 5xx 等)
    for await (const chunk of stream) {
      if (stopped) continue; // 丢弃【下一节】之后的内容
      const raw = chunk.content;
      if (raw.length === 0) continue;

      const leakIdx = findLeakIndex(raw, section);
      if (leakIdx >= 0) {
        stopped = true;
        const before = raw.substring(0, leakIdx);
        const cleaned = stripOwnMarker(before, section);
        if (cleaned.length > 0) {
          const out: StarChunk = { section, delta: cleaned, done: false };
          opts.onChunk?.(out);
          yield out;
        }
        continue;
      }

      const cleaned = stripOwnMarker(raw, section);
      if (cleaned.length > 0) {
        const out: StarChunk = { section, delta: cleaned, done: false };
        opts.onChunk?.(out);
        yield out;
      }
    }

    const done: StarChunk = { section, delta: '', done: true };
    opts.onChunk?.(done);
    yield done;
  }
}

// ---------------------------------------------------------------------------
// Non-streaming wrapper
// ---------------------------------------------------------------------------

/**
 * 把 rewriteResumeStream 的所有 chunk 聚合成 StarRewriteResult.
 * 失败时 (LLM 抛错 / abort) 直接 reject, 透传原 Error.
 */
export async function rewriteResume(
  resume: ResumeDocument,
  opts: StarRewriteOptions = {},
): Promise<StarRewriteResult> {
  const sections: Record<StarSection, string> = {
    我的分析: '',
    STAR改写: '',
    底层心法: '',
    建议: '',
  };
  let totalChars = 0;

  for await (const chunk of rewriteResumeStream(resume, opts)) {
    if (chunk.done) continue;
    sections[chunk.section] += chunk.delta;
    totalChars += chunk.delta.length;
  }

  const confidence = Math.min(1, totalChars / CONFIDENCE_CHARS_CEILING);

  return {
    sections,
    confidence,
  };
}
