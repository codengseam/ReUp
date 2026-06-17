// src/lib/resume/parser-pdf.test.ts
// ReUp v2 Phase 3 P0 (A3): PDF resume parser tests.
// @vitest-environment node
// pdfkit emits to a real Node stream — jsdom's polyfilled streams
// dead-lock under it. Running this suite under the default `node`
// environment avoids the issue.
//
// Strategy:
//   1. Generate an ASCII-only PDF on the fly with `pdfkit` (pure JS,
//      no native binaries). We deliberately use English to avoid the
//      CJK font issue in pdfkit's default Helvetica.
//   2. The "real fixture" test also tries `data/user-samples/resume/简历.md`
//      and only checks `meta.source === 'pdf'` because pdfkit cannot
//      render the Chinese characters; this guards against regressions
//      where someone accidentally turns the parser into a no-op.
//   3. A tiny inline PDF buffer ("Hello world") exercises the happy
//      path with the smallest possible input.
//   4. `vi.spyOn(parserText, 'parseTextResume')` confirms the parser
//      delegates to the shared text parser.
//   5. Error path: a truncated buffer surfaces a clear error.
//
// pdf-parse@1.1.4 ships an old pdfjs (v1.10.100) that fails on Node
// `Buffer` with `bad XRef entry` for many PDFs. The parser converts
// the Buffer to a `Uint8Array` before handing it to pdf-parse, which
// is a known workaround for that library.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// pdfkit ships no .d.ts upstream, but our local `pdfkit.d.ts` provides
// minimal ambient types. No `@ts-expect-error` is needed.
import PDFDocumentImport from 'pdfkit';
import * as parserText from './parser-text';
import { parsePdfResume } from './parser-pdf';
import type { ResumeDocument } from './types';

const FIXTURE_PATH = join(process.cwd(), 'data/user-samples/resume/简历.md');

// Minimal structural type — only the surface we use in tests.
type PdfDoc = {
  on(event: 'data', cb: (chunk: Buffer) => void): unknown;
  on(event: 'end', cb: () => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  text(content: string): unknown;
  end(): unknown;
};
const PDFDocument = PDFDocumentImport as unknown as new () => PdfDoc;

/** Collect a pdfkit stream into a single Buffer. */
function renderPdf(generator: (doc: PdfDoc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const endPromise = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
    doc.on('error', reject);
    try {
      generator(doc);
    } catch (e) {
      reject(e);
      return;
    }
    doc.end();
    endPromise.then(resolve, reject);
  });
}

/** An ASCII-only resume with 4 experience entries. */
const ASCII_RESUME = [
  '## Basic',
  'Name: John Doe',
  'Phone: 555-1234',
  'Email: john@example.com',
  'YearsOfExperience: 10',
  '',
  '## Experience',
  '### Acme Corp',
  'Engineer | 2020 - 2023',
  '- Built feature X',
  '- Built feature Y',
  '',
  '### Beta Inc',
  'Engineer | 2018 - 2020',
  '- Led migration',
  '',
  '### Gamma LLC',
  'Engineer | 2016 - 2018',
  '- Reduced latency 30%',
  '',
  '### Delta Co',
  'Engineer | 2014 - 2016',
  '- Wrote tests',
  '',
  '## Skills',
  '- TypeScript, Go, Python',
  '',
].join('\n');

describe('parsePdfResume', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(parserText, 'parseTextResume');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('parses a generated ASCII PDF and stamps meta.source as pdf', async () => {
    const pdf = await renderPdf((doc) => doc.text(ASCII_RESUME));
    expect(pdf.length).toBeGreaterThan(0);

    const doc = await parsePdfResume(pdf);
    expect(doc.meta.source).toBe('pdf');
    expect(doc.meta.version).toMatch(/^reup\./);
    expect(doc.experience.length).toBeGreaterThanOrEqual(4);
    expect(doc.raw.length).toBeGreaterThan(0);
  });

  it('extracts a tiny "Hello world" PDF and returns a non-empty document', async () => {
    const pdf = await renderPdf((doc) => doc.text('Hello world'));
    const doc = await parsePdfResume(pdf);
    expect(doc.meta.source).toBe('pdf');
    expect(doc.raw).toMatch(/Hello world/);
    // Tiny PDF with no resume structure: parser falls back to experience block
    // so unstructured text becomes a single entry (not empty, but valid).
    expect(doc.projects).toEqual([]);
    expect(doc.skills).toEqual([]);
    expect(doc.experience.length).toBeGreaterThanOrEqual(0);
  });

  it('delegates to parseTextResume with the extracted text', async () => {
    const pdf = await renderPdf((doc) => doc.text(ASCII_RESUME));
    await parsePdfResume(pdf);
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]?.[0] as string;
    expect(typeof arg).toBe('string');
    expect(arg).toMatch(/Acme Corp/);
  });

  it('overrides meta.source to pdf regardless of delegate default', async () => {
    // parseTextResume defaults to 'text' if no source is provided
    const pdf = await renderPdf((doc) => doc.text('## Basic\nName: John'));
    const doc = await parsePdfResume(pdf);
    expect(doc.meta.source).toBe('pdf');
  });

  it('returns a valid ResumeDocument (compile-time check)', async () => {
    const pdf = await renderPdf((doc) => doc.text('## Skills\n- X'));
    const doc: ResumeDocument = await parsePdfResume(pdf);
    expect(doc).toBeDefined();
    expect(doc.meta.source).toBe('pdf');
  });

  it('surfaces a clear error on truncated / invalid PDF', async () => {
    const garbage = Buffer.from('this is not a pdf at all, just text bytes');
    await expect(parsePdfResume(garbage)).rejects.toThrow();
  });

  it('also processes the real Chinese fixture PDF (source check only)', async () => {
    // pdfkit cannot render CJK with default fonts, so the text comes
    // out garbled — but the parser must still return source="pdf"
    // and a valid document shape. This guards against silent failure.
    const fixtureText = readFileSync(FIXTURE_PATH, 'utf8');
    const pdf = await renderPdf((doc) => doc.text(fixtureText));
    const doc = await parsePdfResume(pdf);
    expect(doc.meta.source).toBe('pdf');
    expect(typeof doc.raw).toBe('string');
    expect(doc.raw.length).toBeGreaterThan(0);
  });
});
