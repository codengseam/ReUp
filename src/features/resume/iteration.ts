// src/lib/resume/iteration.ts
// Phase 5 — E1 single-section re-rewrite engine.
//
// 设计要点:
// - 复用 star-rewriter 的 StarChunk / StarSection 类型, 与原 4 段流式输出兼容.
// - 1 次 LLM 调用, prompt 来自 buildSectionRewritePrompt.
// - 与原 rewriteResumeStream 的关键差异:
//   * 不存在 "空 resume → 占位" 的 fast-path; 用户既然触发单段重写, 一定有 currentText
//     (空 resume + 真实 user input 也应让 LLM 尝试).
//   * 泄漏检测只关心 4 段中 "本段之后的标头" + "【下一节】", 不再区分跨段.
import { LLMClient, type Message } from '@/server/llm/llm-client';
import { buildSectionRewritePrompt } from './star';
import { STAR_SECTIONS, type StarSection, type StarChunk } from './star-rewriter';
import type { ResumeDocument } from './types';

// Re-export so consumers (tests, UI) can import StarChunk from a single module
// without reaching into star-rewriter directly.
export type { StarChunk, StarSection };
export { STAR_SECTIONS };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SectionRewriteOptions {
  llmClient?: LLMClient;
  signal?: AbortSignal;
  onChunk?: (chunk: StarChunk) => void;
}

export interface SectionRewriteResult {
  section: StarSection;
  text: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_CHARS_CEILING = 2000;

// ---------------------------------------------------------------------------
// Helpers (leak detection reused from star-rewriter logic)
// ---------------------------------------------------------------------------

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

function stripOwnMarker(delta: string, currentSection: StarSection): string {
  return delta.split(`【${currentSection}】`).join('');
}

// ---------------------------------------------------------------------------
// Streaming entry
// ---------------------------------------------------------------------------

/**
 * Stream-rewrite a single section. The LLM is asked to emit ONLY the target
 * section. The stream yields `StarChunk` items with `section = target`. If the
 * LLM accidentally emits a later section's marker or "【下一节】", the
 * corresponding content is truncated (consistent with star-rewriter behavior).
 */
export async function* rewriteResumeSectionStream(
  resume: ResumeDocument,
  section: StarSection,
  currentText: string,
  opts: SectionRewriteOptions = {},
): AsyncIterable<StarChunk> {
  const client = opts.llmClient ?? new LLMClient();
  const { system, user } = buildSectionRewritePrompt(resume, section, currentText);

  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const stream = client.stream(messages, { signal: opts.signal });

  let stopped = false;
  for await (const chunk of stream) {
    if (stopped) continue;
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

// ---------------------------------------------------------------------------
// Non-streaming wrapper
// ---------------------------------------------------------------------------

/**
 * Aggregate `rewriteResumeSectionStream` into a `SectionRewriteResult`.
 * Throws if the LLM call fails (errors propagate unchanged).
 */
export async function rewriteResumeSection(
  resume: ResumeDocument,
  section: StarSection,
  currentText: string,
  opts: SectionRewriteOptions = {},
): Promise<SectionRewriteResult> {
  let text = '';
  for await (const chunk of rewriteResumeSectionStream(resume, section, currentText, opts)) {
    if (chunk.done) continue;
    text += chunk.delta;
  }
  const confidence = Math.min(1, text.length / CONFIDENCE_CHARS_CEILING);
  return { section, text, confidence };
}
