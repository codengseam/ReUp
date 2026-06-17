# Resume Parser Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the implemented A3 (PDF) and A4 (Word) parsers into the upload flow via a new `/api/resume/parse` server route, removing the misleading "PDF 解析器尚未接入" placeholder.

**Architecture:** Add a Node-runtime API route that accepts `multipart/form-data` (file + source), validates, calls the existing `parseResume` dispatcher (server-side). Update the dispatcher to actually delegate `pdf`/`word` to the new parsers. Update the client upload page to send `pdf`/`word` files through the API while keeping `text`/`md` on the client. No browser bundle changes (server route is the only new path; client never imports `pdf-parse`/`mammoth`).

**Tech Stack:** Next.js 16 App Router, Node runtime route, `pdf-parse@1.1.1` (already installed), `mammoth@1.11.0` (already installed), Vitest 4, TDD red-green-refactor, 1 final commit.

**Source spec:** `docs/superpowers/specs/2026-06-14-resume-parser-integration-design.md` (commit `738b853`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/api/resume/parse/route.ts` | CREATE | Node-only POST endpoint; FormData → Buffer → `parseResume` → JSON |
| `src/app/api/resume/parse/route.test.ts` | CREATE | Endpoint tests (200 PDF, 200 DOCX, 400 missing/invalid/MIME/size, 422 parse fail) |
| `src/lib/resume/parser.ts` | MODIFY | Dispatcher: actually call `parsePdfResume` / `parseWordResume` instead of throwing |
| `src/lib/resume/parser.test.ts` | MODIFY | Delete 2 tests asserting `not yet implemented`; add 2 spy tests asserting delegation |
| `src/app/resume/page.tsx` | MODIFY | Delete 175-180 placeholder throw; add FormData fetch for pdf/word |

5 files (2 new, 3 modified). Single linear track — no parallelism needed (shared types + shared route contract).

---

## Task 1: Server route — TDD (test first, then impl)

**Files:**
- Create: `src/app/api/resume/parse/route.test.ts`
- Create: `src/app/api/resume/parse/route.ts`

- [ ] **Step 1.1: Write the failing route test**

Create `src/app/api/resume/parse/route.test.ts` with this content (verbatim):

```ts
// src/app/api/resume/parse/route.test.ts
// ReUp v2 — integration test for the /api/resume/parse endpoint.
// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import PDFDocumentImport from 'pdfkit';
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

function renderPdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const end = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
    end.then(resolve, reject);
  });
}

// Minimal valid DOCX (hand-crafted; no external dep) for the word test.
// Same structure as parser-word.test.ts; we duplicate to avoid coupling.
import { crc32 } from 'node:zlib';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function buildMinimalDocx(text: string): Buffer {
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
  // Minimal zip with 3 files, store method (no compression)
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

// Minimal NextRequest-like object that exposes only formData() + .nextUrl.pathname.
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
    fd.append('file', new File([pdf], 'resume.pdf', { type: 'application/pdf' }));
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
    fd.append('file', new File([docx], 'resume.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
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
    fd.append('file', new File([Buffer.from('x')], 'a.pdf', { type: 'application/pdf' }));
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_source');
  });

  it('returns 400 invalid_source when source is not pdf/word', async () => {
    const fd = new FormData();
    fd.append('file', new File([Buffer.from('x')], 'a.pdf', { type: 'application/pdf' }));
    fd.append('source', 'text');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_source');
  });

  it('returns 400 invalid_mime when MIME does not match source', async () => {
    const fd = new FormData();
    fd.append('file', new File([Buffer.from('x')], 'a.txt', { type: 'text/plain' }));
    fd.append('source', 'pdf');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_mime');
  });

  it('returns 400 file_too_large when file exceeds 10MB', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0); // 11MB of zeros
    const fd = new FormData();
    fd.append('file', new File([big], 'big.pdf', { type: 'application/pdf' }));
    fd.append('source', 'pdf');
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('file_too_large');
  });

  it('returns 422 parse_failed (with truncated message) on garbage PDF', async () => {
    const garbage = Buffer.from('not a real pdf');
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
```

- [ ] **Step 1.2: Run the test to confirm it fails (red)**

Run:
```bash
pnpm test src/app/api/resume/parse/route.test.ts
```

Expected: FAIL with `Cannot find module './route'` or `POST is not a function`.

- [ ] **Step 1.3: Write the route implementation**

Create `src/app/api/resume/parse/route.ts` with this content (verbatim):

```ts
// src/app/api/resume/parse/route.ts
// ReUp v2 — server-only endpoint for binary PDF/DOCX resume parsing.
// Node runtime is required: pdf-parse / mammoth need Buffer and
// the bundled pdfjs v1.10.100 is CJS. Browser bundle is excluded
// because this file is only imported via the API route, not by
// any client component.

import { NextResponse, type NextRequest } from 'next/server';
import { parseResume } from '@/lib/resume/parser';
import type { ResumeSource } from '@/lib/resume/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MESSAGE_TRUNC = 200;

const ALLOWED_MIME: Record<'pdf' | 'word', string> = {
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function jsonError(error: string, status: number, extra?: Record<string, string>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('invalid_form', 400);
  }

  const file = form.get('file');
  const source = form.get('source');

  if (!(file instanceof File)) {
    return jsonError('missing_file', 400);
  }
  if (typeof source !== 'string') {
    return jsonError('missing_source', 400);
  }
  if (source !== 'pdf' && source !== 'word') {
    return jsonError('invalid_source', 400);
  }

  const expectedMime = ALLOWED_MIME[source];
  if (file.type !== expectedMime) {
    return jsonError('invalid_mime', 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return jsonError('file_too_large', 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const doc = await parseResume(buffer, source as ResumeSource);
    return NextResponse.json({ ok: true, doc });
  } catch (e) {
    const msg = truncate(e instanceof Error ? e.message : String(e), MESSAGE_TRUNC);
    return jsonError('parse_failed', 422, { message: msg });
  }
}
```

- [ ] **Step 1.4: Run the test to confirm it passes (green)**

Run:
```bash
pnpm test src/app/api/resume/parse/route.test.ts
```

Expected: 8 tests pass.

If failures: read the error carefully. Common issues:
- `parseResume: 'pdf' source requires a Buffer input` → parser.ts not yet fixed; jump to Task 2 first, then re-run.
- `Cannot find module '@/lib/resume/parser'` → check `tsconfig.json` paths.
- PDF parse throws on minimal input → use the same `pdfkit` render path as `parser-pdf.test.ts` already validated.

- [ ] **Step 1.5: Quality gate on server-only changes**

Run:
```bash
pnpm ts-check && pnpm lint
```

Expected: 0 errors. Do NOT proceed if either fails.

---

## Task 2: Dispatcher — TDD (update test, then fix impl)

**Files:**
- Modify: `src/lib/resume/parser.test.ts` (delete 2 tests, add 2 tests)
- Modify: `src/lib/resume/parser.ts` (replace 2 throw branches with real calls)

- [ ] **Step 2.1: Update the dispatcher test (red)**

In `src/lib/resume/parser.test.ts`, do two edits:

1. Add this import at the top (after the existing imports):
```ts
import * as parserPdf from './parser-pdf';
import * as parserWord from './parser-word';
```

2. Replace the two `throws a clear "not yet implemented" error for ...` tests (current lines 29-35) with:
```ts
  it('delegates pdf source to parsePdfResume (Buffer input)', async () => {
    const stub: ResumeDocument = {
      meta: { version: 'reup.v2.phase3', source: 'pdf', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '',
    };
    const spy = vi.spyOn(parserPdf, 'parsePdfResume').mockResolvedValueOnce(stub);
    const buf = Buffer.from('fake');
    const doc = await parseResume(buf, 'pdf');
    expect(spy).toHaveBeenCalledWith(buf);
    expect(doc).toBe(stub);
    spy.mockRestore();
  });

  it('delegates word source to parseWordResume (Buffer input)', async () => {
    const stub: ResumeDocument = {
      meta: { version: 'reup.v2.phase3', source: 'word', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '',
    };
    const spy = vi.spyOn(parserWord, 'parseWordResume').mockResolvedValueOnce(stub);
    const buf = Buffer.from('fake');
    const doc = await parseResume(buf, 'word');
    expect(spy).toHaveBeenCalledWith(buf);
    expect(doc).toBe(stub);
    spy.mockRestore();
  });

  it('rejects string input for pdf source with a clear TypeError', async () => {
    await expect(parseResume('not a buffer', 'pdf')).rejects.toThrow(/pdf.*buffer|Buffer/i);
  });

  it('rejects string input for word source with a clear TypeError', async () => {
    await expect(parseResume('not a buffer', 'word')).rejects.toThrow(/word.*buffer|Buffer/i);
  });
```

3. Add `import { vi } from 'vitest'` to the imports (it's already there in most setups; verify).

4. Add `import type { ResumeDocument } from './types';` to the imports (for the `stub` typing).

- [ ] **Step 2.2: Run the test to confirm it fails (red)**

Run:
```bash
pnpm test src/lib/resume/parser.test.ts
```

Expected: FAIL — the new `delegates pdf source` test fails with `parseResume: 'pdf' source requires a Buffer input` (the existing throw) OR the call signature mismatch. The two `rejects string input` tests will fail because the current code does NOT throw on string input (it throws `not yet implemented` which doesn't match the Buffer regex).

- [ ] **Step 2.3: Fix the dispatcher**

In `src/lib/resume/parser.ts`, do two edits:

1. Add these imports at the top (after the existing imports):
```ts
import { parsePdfResume } from './parser-pdf';
import { parseWordResume } from './parser-word';
```

2. Replace the `if (source === 'pdf')` and `if (source === 'word')` blocks (current lines 62-72) with:
```ts
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
```

- [ ] **Step 2.4: Run the test to confirm it passes (green)**

Run:
```bash
pnpm test src/lib/resume/parser.test.ts
```

Expected: all tests pass, including the original `delegates text source`, `delegates md source`, empty input, createdAt, source, version tests.

- [ ] **Step 2.5: Run the full test suite**

Run:
```bash
pnpm test
```

Expected: all 371+ existing tests + the 8 new route tests + the 4 new dispatcher tests pass.

If a previously-passing test now fails: most likely cause is a test that was asserting the old `not yet implemented` behavior. Verify with `git diff src/lib/resume/parser.test.ts` — only the 2 tests in §29-35 should be replaced.

---

## Task 3: Update upload UI

**Files:**
- Modify: `src/app/resume/page.tsx` (delete placeholder throw, add FormData path)

- [ ] **Step 3.1: Replace the `onSubmit` function body**

In `src/app/resume/page.tsx`, replace the entire `onSubmit` callback (current lines 169-197) with:

```ts
  const onSubmit = useCallback(async () => {
    setNotice('');
    setParseError('');
    setIsParsing(true);
    try {
      const source = toResumeSource(format);
      if (format === 'pdf' || format === 'word') {
        // PDF/Word must go through the server route (browser can't import pdf-parse/mammoth).
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          throw new Error(`请先选择 ${FORMAT_LABELS[format]} 文件后再开始优化`);
        }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('source', format);
        const r = await fetch('/api/resume/parse', { method: 'POST', body: fd });
        const json = (await r.json()) as { ok: boolean; doc?: ResumeDocument; error?: string; message?: string };
        if (!json.ok) {
          const friendly: Record<string, string> = {
            missing_file: '文件未上传，请重新选择。',
            missing_source: '请求参数缺失，请刷新页面重试。',
            invalid_source: '仅支持 PDF / DOCX 格式。',
            invalid_mime: '仅支持 PDF / DOCX 文件，请重新选择。',
            file_too_large: '文件过大（>10MB），请压缩或拆分为单页。',
          };
          if (json.error === 'parse_failed') {
            throw new Error(
              `${format === 'pdf' ? 'PDF' : 'Word'} 解析失败：${json.message ?? '未知错误'}。请用 Markdown/文本重试。`
            );
          }
          throw new Error(friendly[json.error ?? ''] ?? '上传解析失败，请重试。');
        }
        if (!json.doc) throw new Error('服务器未返回解析结果');
        setParsedResume(json.doc);
        saveResume(json.doc);
        clearFileInput();
        return;
      }
      // text / md: client-side parse (existing path).
      if (!pastedText.trim()) {
        throw new Error('请粘贴简历文本后再开始优化');
      }
      const doc = await parseResume(pastedText, source);
      setParsedResume(doc);
      saveResume(doc);
      clearFileInput();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(msg);
      setParsedResume(null);
    } finally {
      setIsParsing(false);
    }
  }, [clearFileInput, format, pastedText]);
```

- [ ] **Step 3.2: Verify the change is the only edit**

Run:
```bash
git diff src/app/resume/page.tsx
```

Expected: only the `onSubmit` function body changes. No other line in the file is modified.

- [ ] **Step 3.3: Type-check + lint**

Run:
```bash
pnpm ts-check && pnpm lint
```

Expected: 0 errors.

---

## Task 4: Browser verification

**Files:** none (manual smoke test)

- [ ] **Step 4.1: Start dev server**

Run:
```bash
pnpm run dev
```

Expected: server starts on `http://localhost:8080`.

- [ ] **Step 4.2: Open the resume page in browser**

Navigate to `http://localhost:8080/resume`.

- [ ] **Step 4.3: Verify text path still works**

- Paste a Chinese resume excerpt into the textarea
- Click "开始优化"
- Expected: `ParsePreview` shows the parsed sections. No "尚未接入" error.

- [ ] **Step 4.4: Generate a fixture PDF**

In a separate terminal:
```bash
node -e "
const PDFDocument = require('pdfkit');
const fs = require('fs');
const doc = new PDFDocument();
const chunks = [];
doc.on('data', c => chunks.push(c));
doc.on('end', () => fs.writeFileSync('/tmp/test-resume.pdf', Buffer.concat(chunks)));
doc.text('## Basic\nName: Test User\n\n## Experience\n### Acme\nEngineer | 2020 - 2023\n- Built feature X');
doc.end();
"
ls -la /tmp/test-resume.pdf
```

- [ ] **Step 4.5: Verify PDF path works**

- Back in the resume page, select "PDF" format
- Drag `/tmp/test-resume.pdf` onto the drop zone
- Click "开始优化"
- Expected: `ParsePreview` shows parsed sections. No "尚未接入" error.

- [ ] **Step 4.6: Verify error UX (corrupt PDF)**

- Drag any `.txt` file (or rename a `.txt` to `.pdf`) onto the drop zone
- Force the format to "PDF"
- Click "开始优化"
- Expected: red error box shows `PDF 解析失败：<底层 message>。请用 Markdown/文本重试。`

- [ ] **Step 4.7: Stop dev server**

Stop the background dev process (Ctrl-C in the terminal where `pnpm run dev` is running).

---

## Task 5: Commit

**Files:** all 5 files from Tasks 1-3 are staged.

- [ ] **Step 5.1: Stage all changes**

Run:
```bash
git add \
  src/app/api/resume/parse/route.ts \
  src/app/api/resume/parse/route.test.ts \
  src/lib/resume/parser.ts \
  src/lib/resume/parser.test.ts \
  src/app/resume/page.tsx
git status --short
```

Expected: 5 files staged (A), 0 unstaged for the resume scope.

- [ ] **Step 5.2: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
fix(resume): wire A3/A4 parsers via /api/resume/parse (A6)

A3 (PDF) and A4 (Word) parsers were implemented but the dispatcher
(parser.ts) still threw "not yet implemented" and the upload page
hard-coded the same placeholder, so users saw a misleading error
when uploading a PDF or Word file.

- New /api/resume/parse route (Node runtime) accepts multipart
  PDF/DOCX, validates size + MIME, calls the dispatcher, returns
  ResumeDocument JSON. Server-side keeps pdf-parse/mammoth out of
  the browser bundle.
- Dispatcher now delegates pdf -> parsePdfResume and
  word -> parseWordResume, with a clear TypeError on string input.
- Upload page routes pdf/word through the new route via FormData
  fetch, with friendly Chinese error mapping; text/md path
  unchanged.
- 8 endpoint tests + 4 dispatcher tests added; 2 obsolete
  "not yet implemented" tests removed.
EOF
)"
```

- [ ] **Step 5.3: Verify commit**

Run:
```bash
git log --oneline -3
```

Expected: new commit on top of `738b853` (the spec commit). Single commit for this change (per M3: <=2 commits per scope).

- [ ] **Step 5.4: Final quality gate**

Run:
```bash
pnpm ts-check && pnpm lint && pnpm test
```

Expected: 0 errors, 0 lint warnings, all tests pass.

If anything is red: STOP. Do not claim completion. Diagnose with `pnpm test <failing-file>`, fix, re-run, then continue.

---

## Self-Review

**Spec coverage** (skimming spec sections):

- §3.1 API route — covered in Task 1.3
- §3.2 dispatcher fix — covered in Task 2.3
- §3.3 UI fix — covered in Task 3.1
- §3.4 error messages (USER_FRIENDLY_MAP) — covered in Task 3.1 inline
- §3.5 dispatcher test update — covered in Task 2.1
- §3.6 route test new file — covered in Task 1.1
- §3.7 privacy mode UX — out of scope for this fix (deferred; spec §13 already accepts the trade-off; can be a follow-up)
- §5 acceptance criteria:
  - ts-check / lint / test pass → Task 5.4
  - browser: PDF upload via /api/resume/parse → Task 4.5
  - browser: corrupt PDF error message → Task 4.6
  - text/md path unchanged → Task 4.3
  - grep `not yet implemented` returns 0 → implicit in Task 2.3
  - grep `尚未接入` returns 0 → implicit in Task 3.1
  - network tab response has `meta.source` → implicit in Task 4.5

**Placeholder scan:** No TBD / TODO / "implement later" / "fill in details" / "similar to Task N" found. All code blocks are complete.

**Type consistency:** `parseResume` signature unchanged; `parsePdfResume(Buffer)` / `parseWordResume(Buffer)` match existing impl; route response shape `{ ok, doc?, error?, message? }` is consistent between route and page; `ResumeSource` type reused.

**Gaps identified:** none for this scope. Privacy mode UX (spec §3.7) is explicitly out of scope and noted.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-resume-parser-integration.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for keeping context clean across 5 files.

2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints. Best for tight feedback loop on a small fix.
