// src/lib/resume/parser-md.ts
// ReUp v2 Phase 3 P0 (A5): markdown resume parser.
//
// Strips common markdown noise (bold, italic, code fences, HTML tags,
// HTML entities, line continuations) from the input, then delegates to
// the plain-text parser (`parser-text`) which does the structural split.
//
// Note: `markdown-it` is NOT a dependency of this project. We deliberately
// avoid it here (per spec constraint: no new deps). A small, hand-rolled
// normaliser is sufficient for the resume shapes we target.

import { parseTextResume } from './parser-text';
import type { ResumeDocument } from './types';

/**
 * Normalise a markdown string into a cleaner plain-text form for parsing.
 * The original input is preserved in `doc.raw` — this transform is only
 * used to feed the structural parser.
 *
 * Note: we deliberately do NOT strip `^#+\s+` heading markers, because
 * the text parser relies on `## ` section headers to split the document.
 */
function stripMarkdown(input: string): string {
  return (
    input
      // Fenced code blocks: drop the fence markers but keep inner content
      .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
      .replace(/```/g, '')
      // Inline code → plain text
      .replace(/`([^`]+)`/g, '$1')
      // HTML entities
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(parseInt(dec, 10)))
      // <br /> → newline
      .replace(/<br\s*\/?\s*>/gi, '\n')
      // <url> and <email> link brackets (some resumes use this style)
      .replace(/<\s*(https?:\/\/[^>\s]+)\s*>/g, '$1')
      .replace(/<\s*([\w.+-]+@[\w.-]+\.[\w.-]+)\s*>/g, '$1')
      // Images and links
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Bold / italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
      // Blockquote markers
      .replace(/^>\s*/gm, '')
  );
}

/**
 * Parse a markdown resume into a `ResumeDocument`.
 *
 * Strategy: strip common markdown formatting, then run the same pipeline
 * as `parseTextResume`. The original markdown is preserved in `doc.raw`.
 */
export function parseMdResume(md: string): ResumeDocument {
  const normalised = stripMarkdown(md);
  const doc = parseTextResume(normalised, 'md');
  // Restore the original markdown as `raw` so callers (and the UI) can
  // surface the unmodified source.
  doc.raw = md;
  return doc;
}
