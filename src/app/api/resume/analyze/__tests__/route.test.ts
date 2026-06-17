// src/app/api/resume/analyze/__tests__/route.test.ts
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(form: FormData): Request {
  return new Request('http://localhost:8080/api/resume/analyze', {
    method: 'POST',
    body: form,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/resume/analyze', () => {
  beforeAll(() => {
    process.env.DASHSCOPE_API_KEY = 'test-key';
  });

  it('returns 400 when no resumeFile is provided', async () => {
    const fd = new FormData();
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_resume_file');
  });

  it('analyzes a text resume without JD and returns diagnostics', async () => {
    const resumeText = '张辰\n高级测试开发工程师\nPython Pytest MySQL Linux\n字节跳动 业务负责人 2022-至今\n搭建接口自动化体系';
    const fd = new FormData();
    fd.append(
      'resumeFile',
      new File([resumeText], 'resume.txt', { type: 'text/plain' }),
    );
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.diagnostics).toBeDefined();
    expect(body.diagnostics.summary).toBeDefined();
    expect(body.ats).toBeNull();
    expect(body.match).toBeNull();
    expect(body.elapsed).toBeTypeOf('number');
    expect(res.headers.get('x-trace-id')).toBeTruthy();
  });

  it('analyzes a text resume with JD text and returns ATS + match', async () => {
    const resumeText = '张辰\n高级测试开发工程师\nPython Pytest MySQL Linux\n字节跳动 业务负责人 2022-至今\n搭建接口自动化体系';
    const jdText = '招聘高级测试开发工程师。熟悉 Python、Pytest、MySQL、接口自动化。有 Kubernetes 经验者优先。';
    const fd = new FormData();
    fd.append(
      'resumeFile',
      new File([resumeText], 'resume.txt', { type: 'text/plain' }),
    );
    fd.append('jdText', jdText);
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.diagnostics).toBeDefined();
    expect(body.ats).not.toBeNull();
    expect(body.match).not.toBeNull();
    expect(body.ats.coverage).toBeDefined();
    expect(body.ats.jdKeywords.length).toBeGreaterThan(0);
    expect(body.match.priorities.length).toBe(3);
    expect(body.elapsed).toBeTypeOf('number');
  });

  it('returns 400 when file is too large', async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const fd = new FormData();
    fd.append('resumeFile', new File([big], 'big.txt', { type: 'text/plain' }));
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('file_too_large');
  });

  it('returns 422 when parse fails', async () => {
    const fd = new FormData();
    fd.append(
      'resumeFile',
      new File([], 'empty.txt', { type: 'text/plain' }),
    );
    const res = await POST(makeRequest(fd) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('analysis_failed');
  });
});