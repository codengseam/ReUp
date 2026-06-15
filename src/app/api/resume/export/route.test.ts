// src/app/api/resume/export/route.test.ts
// ReUp v2 Phase 5 (F1-F3): API route unit tests for /api/resume/export.
//
// Coverage:
//  1) POST with `{ format: 'md' }` returns 200 text/markdown body
//  2) POST with `{ format: 'pdf' }` returns 200 application/pdf
//  3) POST with `{ format: 'docx' }` returns 200 application/vnd...wordprocessingml.document
//  4) POST with invalid format → 400
//  5) POST with missing body → 400
//
// We call the exported `POST` function directly with a `Request` object.
// (NextRequest extends `Request` so this is type-compatible.)

import { describe, it, expect } from 'vitest';
import { POST } from './route';
import type { ResumeDocument } from '@/lib/resume/types';
import type { StarRewriteResult } from '@/lib/resume/star-rewriter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleResume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张辰', title: '高级后端工程师', yearsOfExperience: 6 },
  experience: [
    {
      company: '蓝芯科技',
      role: '高级后端工程师',
      period: '2023-03 - 至今',
      bullets: ['负责订单中台微服务架构升级'],
    },
  ],
  projects: [
    { name: '订单中台微服务升级', period: '2023-06 - 2023-12', bullets: ['把单体拆成 8 个微服务'] },
  ],
  skills: ['Java', 'Spring Cloud'],
  education: [{ school: '示例大学', degree: '计算机科学 本科', period: '2016-09 - 2020-07' }],
  raw: '张辰 / 高级后端工程师 / 6年',
};

const sampleStar: StarRewriteResult = {
  sections: {
    '我的分析': '亮点在订单中台架构升级。',
    'STAR改写': 'SITUATION: ...',
    '底层心法': 'Use 4-part STAR.',
    '建议': 'Add metrics.',
  },
  confidence: 0.42,
};

/** Build a Request that carries the given JSON body. */
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/resume/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a Request with no body at all. */
function emptyRequest(): Request {
  return new Request('http://localhost/api/resume/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/resume/export', () => {
  it('returns 200 text/markdown for format="md"', async () => {
    const res = await POST(jsonRequest({ format: 'md', resume: sampleResume, starResult: sampleStar }) as never);
    expect(res.status).toBe(200);
    const ct = res.headers.get('Content-Type') ?? '';
    expect(ct).toMatch(/text\/markdown/);
    const body = await res.text();
    expect(body).toContain('# 张辰');
    // Content-Disposition should be set
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/resume-.*\.md/);
  });

  it('returns 200 application/pdf for format="pdf"', async () => {
    const res = await POST(jsonRequest({ format: 'pdf', resume: sampleResume, starResult: sampleStar }) as never);
    expect(res.status).toBe(200);
    const ct = res.headers.get('Content-Type') ?? '';
    expect(ct).toMatch(/application\/pdf/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/resume-.*\.pdf/);
  });

  it('returns 200 with DOCX mime for format="docx"', async () => {
    const res = await POST(jsonRequest({ format: 'docx', resume: sampleResume, starResult: sampleStar }) as never);
    expect(res.status).toBe(200);
    const ct = res.headers.get('Content-Type') ?? '';
    expect(ct).toMatch(/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString('binary')).toBe('PK');
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/resume-.*\.docx/);
  });

  it('returns 200 when starResult is omitted (resume-only export)', async () => {
    const res = await POST(jsonRequest({ format: 'md', resume: sampleResume }) as never);
    expect(res.status).toBe(200);
    const body = await res.text();
    // The STAR section heading should NOT be present
    expect(body).not.toContain('## STAR 改写结果');
  });

  it('returns 400 for an invalid format', async () => {
    const res = await POST(jsonRequest({ format: 'xlsx', resume: sampleResume }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when format is missing', async () => {
    const res = await POST(jsonRequest({ resume: sampleResume }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when resume is missing', async () => {
    const res = await POST(jsonRequest({ format: 'md' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing or invalid JSON', async () => {
    const res = await POST(emptyRequest() as never);
    expect(res.status).toBe(400);
  });
});
