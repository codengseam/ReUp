// src/lib/resume/parser-pdf.ts
// ReUp v2 Phase 3 P0 (A3): PDF resume parser.
//
// Wraps the `pdf-parse` library (pure Node, no cloud, no native
// binaries — meets spec §7.A constraint #4). All credit for the
// PDF text extraction goes to the `pdf-parse` authors; this file
// is a thin adapter that:
//   1. Pre-configures the bundled pdfjs v1.10.100 (`workerSrc` and
//      `disableWorker`). Without these, even a successful PDF read
//      throws `No PDFJS.workerSrc specified` in jsdom and other
//      non-browser environments.
//   2. Converts the Node `Buffer` to a `Uint8Array` (the bundled
//      pdfjs v1.10.100 in pdf-parse@1.1.4 throws `bad XRef entry`
//      on raw `Buffer` instances for many PDF revisions).
//   3. Delegates to `parseTextResume` (sibling A2 module) for the
//      actual structured-field extraction.
//   4. Stamps `meta.source = 'pdf'` and preserves the raw extracted
//      text in `raw` for downstream consumers.

// pdf-parse ships no .d.ts and there is no @types/pdf-parse on npm.
// @ts-expect-error -- untyped module on purpose
import pdfParseImport from 'pdf-parse';
import { parseTextResume } from './parser-text';
import type { ResumeDocument } from './types';

// Lazily-loaded pdfjs module so we can pre-configure `workerSrc`.
// `pdf-parse` internally does `require('./pdf.js/v1.10.100/...')`.
// The bundled pdfjs reads its config from `globalThis.PDFJS`, so we
// must seed that object before the first call. The local `PDFJS`
// reference is also configured so the same module object stays in
// sync.
const pdfParse = pdfParseImport as unknown as (
  input: Uint8Array,
  options?: Record<string, unknown>
) => Promise<{
  numpages: number;
  numrender: number;
  info: unknown;
  metadata: unknown;
  text: string;
  version: string;
}>;
let pdfjsConfigured = false;
function configurePdfjsOnce(): void {
  if (pdfjsConfigured) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    g.PDFJS = g.PDFJS ?? {};
    g.PDFJS.disableWorker = true;
    // The fake worker still needs a `workerSrc` string. The check in
    // pdfjs v1.10.100 is `if (getDefaultSetting('workerSrc'))` — a
    // truthy check — so an empty string is NOT enough. Any non-empty
    // placeholder is fine because `disableWorker` keeps everything
    // in-process and the path is never fetched.
    g.PDFJS.workerSrc = g.PDFJS.workerSrc || 'pdf.js/worker-stub.js';

    // Also load the bundled pdfjs module so its own `PDFJS` export
    // (which pdf-parse uses) stays consistent with the global.
    const pdfjsPath = 'pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFJS = require(pdfjsPath) as {
      disableWorker?: boolean;
      workerSrc?: string;
      version?: string;
    };
    PDFJS.disableWorker = true;
    PDFJS.workerSrc = PDFJS.workerSrc || g.PDFJS.workerSrc;
    pdfjsConfigured = true;
  } catch {
    // If the path is wrong (newer pdf-parse), the call below will
    // surface a clear error. We intentionally do not throw here.
  }
}

/**
 * Parse a PDF resume buffer into a structured `ResumeDocument`.
 *
 * The input is the raw bytes of a PDF file. Throws if `pdf-parse`
 * cannot extract text (e.g. corrupt or encrypted PDF). Empty pages
 * are tolerated — they produce a document with empty arrays.
 */
export async function parsePdfResume(pdfBuffer: Buffer): Promise<ResumeDocument> {
  if (!Buffer.isBuffer(pdfBuffer)) {
    throw new TypeError(
      `parsePdfResume: expected Buffer, got ${typeof pdfBuffer}`
    );
  }

  configurePdfjsOnce();

  // pdf-parse@1.1.4 ships pdfjs v1.10.100, which fails on raw Node
  // `Buffer` with `bad XRef entry` for most modern PDFs. Wrapping
  // in a `Uint8Array` view works around the bug. (Verified manually
  // — the same buffer fails as Buffer, succeeds as Uint8Array.)
  const data = await pdfParse(new Uint8Array(pdfBuffer));
  const text = data.text ?? '';

  const doc = parseTextResume(text, 'pdf');
  // parseTextResume already stamps source, but we set it again here
  // defensively in case the delegate ever changes its default.
  doc.meta = { ...doc.meta, source: 'pdf' };
  doc.raw = text;
  return doc;
}
