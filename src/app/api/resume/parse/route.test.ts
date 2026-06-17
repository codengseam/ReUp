// src/app/api/resume/parse/route.test.ts
// ReUp v2 — integration test for the /api/resume/parse endpoint.
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import PDFDocumentImport from 'pdfkit';
import { crc32 } from 'node:zlib';
import { POST } from './route';

// Minimal structural type for pdfkit (avoids needing pdfkit.d.ts import in test).
type PdfDoc = {
  on(event: 'data', cb: (chunk: Buffer) => void): unknown;
  on(event: 'end', cb: () => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  text(content: string): unknown;
  end(): unknown;
};
const PDFDocument = PDFDocumentImport as unknown as new () => PdfDoc;

function renderPdf(text: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const end = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
    end.then((b) => resolve(new Uint8Array(b)), reject);
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Hand-craft a minimal valid DOCX (OOXML zip) containing a single
 * paragraph with the given plain text. Mirrors the helper in
 * parser-word.test.ts so route tests don't depend on the parser tests.
 */
function buildMinimalDocx(text: string): Uint8Array {
  const para = `  <w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  const documentXml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
  ];

  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const crc = crc32(f.data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(f.data.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(f.data.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + f.data.length;
  }
  const centralStart = offset;
  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...local, ...central, eocd]);
}

// Wrap FormData in a NextRequest-compatible Request.
function makeRequest(form: FormData): Request {
  return new Request('http://localhost:8080/api/resume/parse', {
    method: 'POST',
    body: form,
  });
}

describe('POST /api/resume/parse', () => {
  it('parses a valid PDF upload and returns 200 + doc with source=pdf', async () => {
    const pdf = await renderPdf('## Skills\n- TypeScript');
    const fd = new FormData();
    fd.append(
      'file',
      new File([pdf as BlobPart], 'resume.pdf', { type: 'application/pdf' })
    );
    fd.append('source', 'pdf');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.doc.meta.source).toBe('pdf');
  });

  it('parses a valid DOCX upload and returns 200 + doc with source=word', async () => {
    const docx = buildMinimalDocx('Hello world');
    const fd = new FormData();
    fd.append(
      'file',
      new File([docx as BlobPart], 'resume.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    );
    fd.append('source', 'word');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.doc.meta.source).toBe('word');
  });

  it('returns 400 missing_file when no file is appended', async () => {
    const fd = new FormData();
    fd.append('source', 'pdf');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_file');
  });

  it('returns 400 missing_source when no source is appended', async () => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([0x78])], 'a.pdf', { type: 'application/pdf' }));
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_source');
  });

  it('returns 400 invalid_source when source is not pdf/word', async () => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([0x78])], 'a.pdf', { type: 'application/pdf' }));
    fd.append('source', 'text');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_source');
  });

  it('returns 400 invalid_mime when MIME does not match source', async () => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([0x78])], 'a.txt', { type: 'text/plain' }));
    fd.append('source', 'pdf');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_mime');
  });

  it('returns 400 file_too_large when file exceeds 10MB', async () => {
    const big = new Uint8Array(11 * 1024 * 1024); // 11MB of zeros
    const fd = new FormData();
    fd.append('file', new File([big], 'big.pdf', { type: 'application/pdf' }));
    fd.append('source', 'pdf');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('file_too_large');
  });

  it('returns 422 parse_failed (with truncated message) on garbage PDF', async () => {
    const garbage = new TextEncoder().encode('not a real pdf');
    const fd = new FormData();
    fd.append('file', new File([garbage], 'bad.pdf', { type: 'application/pdf' }));
    fd.append('source', 'pdf');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('parse_failed');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeLessThanOrEqual(201); // 200 + ellipsis
  });
});
