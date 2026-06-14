// src/lib/resume/parser-word.ts
// ReUp v2 Phase 3 P0 (A4): Word (.docx) resume parser.
//
// Wraps the `mammoth` library (pure JS, no cloud, no native
// binaries — meets spec §7.A constraint #4). All credit for the
// DOCX → text extraction goes to the `mammoth` authors; this file
// is a thin adapter that:
//   1. Calls `mammoth.extractRawText({ buffer })` to get the full
//      plain text with newlines.
//   2. Delegates to `parseTextResume` (sibling A2 module) for the
//      actual structured-field extraction.
//   3. Stamps `meta.source = 'word'` and preserves the raw extracted
//      text in `raw` for downstream consumers.

// mammoth ships its own .d.ts under a different layout — TypeScript
// picks it up automatically.
import mammothImport from 'mammoth';
import { parseTextResume } from './parser-text';
import type { ResumeDocument } from './types';

// mammoth's CJS export is the namespace object, but TS under
// esModuleInterop may also see it as `{ default: ns }` in some
// environments. Normalise.
type MammothNs = {
  extractRawText: (options: { buffer: Buffer }) => Promise<{ value: string; messages: unknown[] }>;
};
const mammoth: MammothNs =
  typeof (mammothImport as unknown as MammothNs).extractRawText === 'function'
    ? (mammothImport as unknown as MammothNs)
    : ((mammothImport as unknown as { default: MammothNs }).default);

/**
 * Parse a Word (.docx) resume buffer into a structured `ResumeDocument`.
 *
 * The input is the raw bytes of a DOCX file. Throws if mammoth cannot
 * read the file (e.g. not a valid ZIP/DOCX, or password-protected).
 * Empty documents produce a `ResumeDocument` with empty arrays.
 */
export async function parseWordResume(docxBuffer: Buffer): Promise<ResumeDocument> {
  if (!Buffer.isBuffer(docxBuffer)) {
    throw new TypeError(
      `parseWordResume: expected Buffer, got ${typeof docxBuffer}`
    );
  }

  const result = await mammoth.extractRawText({ buffer: docxBuffer });
  const text = result.value ?? '';

  const doc = parseTextResume(text, 'word');
  // parseTextResume already stamps source, but set again defensively
  // in case the delegate ever changes its default.
  doc.meta = { ...doc.meta, source: 'word' };
  doc.raw = text;
  return doc;
}
