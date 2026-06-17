// src/app/api/admin/runtime-config/route.test.ts
// TDD tests for /api/admin/runtime-config (GET masked / POST replace)
//
// 约定：
// - GET 返回 { apiKeys: { dashscope, zhipu } }，每个 apiKey 字段为 ***MASKED***（不暴露原值）
// - POST 接受 { apiKeys: { dashscope?, zhipu? } }，对每个 provider 做 upsert（masked 不写入）
// - 空字符串视为"清空"
//
// 注意：测试在 tmp 目录中执行（隔离 data/.runtime-config.json）

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const realCwd = process.cwd();
let tmp: string;

let GET: typeof import('./route').GET;
let POST: typeof import('./route').POST;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'reup-admin-runtime-'));
  process.chdir(tmp);
  // dynamic import AFTER chdir so the module picks up the new cwd
  const mod = await import('./route');
  GET = mod.GET;
  POST = mod.POST;
});

afterAll(() => {
  process.chdir(realCwd);
  if (tmp && existsSync(tmp)) {
    rmSync(tmp, { recursive: true, force: true });
  }
});

beforeEach(() => {
  // 清空文件
  try {
    rmSync(join(tmp, 'data', '.runtime-config.json'), { force: true });
  } catch { /* ignore */ }
});

function makeReq(body?: unknown, method: 'GET' | 'POST' = 'GET'): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request('http://localhost/api/admin/runtime-config', init);
}

// =====================================================================
// GET
// =====================================================================

describe('GET /api/admin/runtime-config', () => {
  it('returns empty apiKeys when no file exists', async () => {
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { apiKeys?: Record<string, unknown>; updatedAt?: string };
    expect(json.apiKeys).toEqual({});
    expect(json.updatedAt).toBeUndefined();
  });

  it('masks real keys as ***MASKED***', async () => {
    // Seed a config file
    const seed = {
      apiKeys: {
        dashscope: { endpoint: 'ep1', apiKey: 'sk-real-dash-12345', provider: 'dashscope' },
        zhipu: { endpoint: 'ep2', apiKey: 'real-zhipu-key-67890', provider: 'zhipu' },
      },
      updatedAt: '2026-06-15T00:00:00Z',
    };
    const fs = await import('fs/promises');
    await fs.mkdir(join(tmp, 'data'), { recursive: true });
    await fs.writeFile(join(tmp, 'data', '.runtime-config.json'), JSON.stringify(seed), 'utf-8');

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { apiKeys: Record<string, { apiKey: string; endpoint: string }> };
    expect(json.apiKeys.dashscope!.apiKey).toBe('***MASKED***');
    expect(json.apiKeys.zhipu!.apiKey).toBe('***MASKED***');
    // endpoints are still visible
    expect(json.apiKeys.dashscope!.endpoint).toBe('ep1');
    expect(json.apiKeys.zhipu!.endpoint).toBe('ep2');
  });

  it('NEVER leaks a raw key in the response body', async () => {
    const fs = await import('fs/promises');
    await fs.mkdir(join(tmp, 'data'), { recursive: true });
    await fs.writeFile(
      join(tmp, 'data', '.runtime-config.json'),
      JSON.stringify({
        apiKeys: {
          dashscope: { endpoint: 'ep', apiKey: 'supersecretkey', provider: 'dashscope' },
        },
      }),
      'utf-8'
    );
    const res = await GET(makeReq() as never);
    const text = await res.text();
    expect(text).not.toContain('supersecretkey');
  });
});

// =====================================================================
// POST
// =====================================================================

describe('POST /api/admin/runtime-config', () => {
  it('returns 400 on non-JSON body', async () => {
    const req = new Request('http://localhost/api/admin/runtime-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not an object', async () => {
    const res = await POST(makeReq(['not-an-object'], 'POST') as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when apiKeys is not an object', async () => {
    const res = await POST(makeReq({ apiKeys: 'no' }, 'POST') as never);
    expect(res.status).toBe(400);
  });

  it('writes a new dashscope key on first POST', async () => {
    const res = await POST(
      makeReq({ apiKeys: { dashscope: { endpoint: 'ep', apiKey: 'k-new' } } }, 'POST') as never
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    // Re-GET should now return masked
    const getRes = await GET(makeReq() as never);
    const after = (await getRes.json()) as { apiKeys: { dashscope?: { apiKey: string } } };
    expect(after.apiKeys.dashscope?.apiKey).toBe('***MASKED***');
  });

  it('upserts zhipu without clobbering existing dashscope', async () => {
    // Seed dashscope
    await POST(
      makeReq({ apiKeys: { dashscope: { endpoint: 'ep1', apiKey: 'k1' } } }, 'POST') as never
    );
    // Add zhipu
    await POST(
      makeReq({ apiKeys: { zhipu: { endpoint: 'ep2', apiKey: 'k2' } } }, 'POST') as never
    );

    const res = await GET(makeReq() as never);
    const json = (await res.json()) as { apiKeys: { dashscope?: { apiKey: string }; zhipu?: { apiKey: string } } };
    expect(json.apiKeys.dashscope?.apiKey).toBe('***MASKED***');
    expect(json.apiKeys.zhipu?.apiKey).toBe('***MASKED***');
  });

  it('rejects masked values (refuses to overwrite with ***MASKED***)', async () => {
    // Seed a key first
    await POST(
      makeReq({ apiKeys: { dashscope: { endpoint: 'ep', apiKey: 'k-real' } } }, 'POST') as never
    );
    // Try to overwrite with MASKED — should be rejected as bad_request
    const res = await POST(
      makeReq(
        { apiKeys: { dashscope: { endpoint: 'ep', apiKey: '***MASKED***' } } },
        'POST'
      ) as never
    );
    expect(res.status).toBe(400);
  });

  it('clears a key when empty string is sent', async () => {
    // Seed
    await POST(
      makeReq({ apiKeys: { dashscope: { endpoint: 'ep', apiKey: 'k-real' } } }, 'POST') as never
    );
    // Clear
    const res = await POST(
      makeReq({ apiKeys: { dashscope: { endpoint: 'ep', apiKey: '' } } }, 'POST') as never
    );
    expect(res.status).toBe(200);
    const getRes = await GET(makeReq() as never);
    const json = (await getRes.json()) as { apiKeys: { dashscope?: { apiKey: string } } };
    expect(json.apiKeys.dashscope?.apiKey).toBe('');
  });

  it('preserves untouched providers on partial update', async () => {
    await POST(
      makeReq(
        {
          apiKeys: {
            dashscope: { endpoint: 'ep1', apiKey: 'k1' },
            zhipu: { endpoint: 'ep2', apiKey: 'k2' },
          },
        },
        'POST'
      ) as never
    );
    // Only update dashscope
    await POST(
      makeReq({ apiKeys: { dashscope: { endpoint: 'ep1-new', apiKey: 'k1-new' } } }, 'POST') as never
    );
    const res = await GET(makeReq() as never);
    const json = (await res.json()) as { apiKeys: { dashscope?: { endpoint: string }; zhipu?: { endpoint: string } } };
    expect(json.apiKeys.dashscope?.endpoint).toBe('ep1-new');
    expect(json.apiKeys.zhipu?.endpoint).toBe('ep2');
  });
});
