// src/lib/resume/parser.ts
// ReUp v2 Phase 3 P0 (A6): resume parser dispatcher.
//
// Routes by `source` to the right underlying parser. PDF and Word
// parsers (A3 / A4) live in parallel sub-agents and are imported
// lazily; until they exist, the dispatcher throws a clear "not yet
// implemented" error so callers fail loud rather than silently swallow.

import type { ResumeDocument, ResumeSource } from './types';
import { parseTextResume } from './parser-text';
import { parseMdResume } from './parser-md';

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

  if (source === 'text') {
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
    throw new Error(
      'PDF parser not yet implemented in this build; use A3 sub-agent output (see spec §7.A A3).'
    );
  }

  if (source === 'word') {
    throw new Error(
      'Word parser not yet implemented in this build; use A4 sub-agent output (see spec §7.A A4).'
    );
  }

  // Exhaustiveness — should be unreachable.
  const _exhaustive: never = source;
  throw new Error(`parseResume: unknown source '${String(_exhaustive)}'`);
}
