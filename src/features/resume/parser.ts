// src/lib/resume/parser.ts
// ReUp v2 Phase 3 P0 (A6): resume parser dispatcher.
//
// Routes by `source` to the right underlying parser. PDF and Word
// parsers (A3 / A4) live in sibling files; text and md are
// imported statically. Callers running in the browser must NOT
// pass 'pdf' / 'word' — those need a Node runtime. Use
// `parseResume(buffer, 'pdf' | 'word')` from server routes only.

import type { ResumeDocument, ResumeSource } from './types';
import { parseTextResume } from './parser-text';
import { parseMdResume } from './parser-md';
import { parsePdfResume } from './parser-pdf';
import { parseWordResume } from './parser-word';

export interface ParseResumeOptions {
  /** Optional MIME type hint (e.g. for future PDF/Word dispatch). */
  mimeType?: string;
}

function requireNonEmpty(input: string | Buffer, source: ResumeSource): asserts input is string | Buffer {
  if (typeof input === 'string') {
    if (input.length === 0) {
      throw new Error(`parseResume: input for source '${source}' is empty; expected a non-empty string`);
    }
  } else if (Buffer.isBuffer(input)) {
    if (input.length === 0) {
      throw new Error(`parseResume: input buffer for source '${source}' is empty`);
    }
  } else {
    throw new Error(`parseResume: input must be a string or Buffer for source '${source}'`);
  }
}

/**
 * Parse a resume into a normalised `ResumeDocument`.
 *
 * @param input  The raw resume payload (string for text/md, Buffer for pdf/word).
 * @param source The resume source type. Drives which parser runs.
 * @param opts   Optional hints (e.g. mimeType) used by future parsers.
 */
export async function parseResume(
  input: string | Buffer,
  source: ResumeSource,
  opts: ParseResumeOptions = {}
): Promise<ResumeDocument> {
  requireNonEmpty(input, source);
  // Future: PDF/Word dispatchers can read `opts.mimeType`; not used yet.
  void opts;

  if (source === 'text' || source === 'pdf+llm') {
    if (typeof input !== 'string') {
      throw new Error("parseResume: 'text' source requires a string input");
    }
    return parseTextResume(input, 'text');
  }

  if (source === 'md') {
    if (typeof input !== 'string') {
      throw new Error("parseResume: 'md' source requires a string input");
    }
    return parseMdResume(input);
  }

  if (source === 'pdf') {
    if (typeof input === 'string' || !Buffer.isBuffer(input)) {
      throw new TypeError("parseResume: 'pdf' source requires a Buffer input");
    }
    return parsePdfResume(input);
  }

  if (source === 'word') {
    if (typeof input === 'string' || !Buffer.isBuffer(input)) {
      throw new TypeError("parseResume: 'word' source requires a Buffer input");
    }
    return parseWordResume(input);
  }

  // Exhaustiveness — should be unreachable.
  const _exhaustive: never = source;
  throw new Error(`parseResume: unknown source '${String(_exhaustive)}'`);
}
