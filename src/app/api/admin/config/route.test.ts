// src/app/api/admin/config/route.test.ts
// ReUp v2 Phase 1.5 — admin config API read/write tests.
//
// Strategy: each test runs against the real `src/lib/server-config` module
// but pointed at a fresh temp directory (via `process.chdir` into a
// `mkdtempSync` location). This exercises the actual file IO + lock + Zod
// validation paths without clobbering any real `data/server-config.json`.
//
// `server-config.ts` resolves `CONFIG_DIR` at module-load time, so we
// `chdir` first, then `vi.resetModules()` and dynamically import the
// route handler to force a fresh module evaluation under the tmp dir.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ---------------- Temp dir lifecycle ----------------

const realCwd = process.cwd();
let tmp: string;
let GET: typeof import('./route').GET;
let POST: typeof import('./route').POST;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'reup-admin-config-'));
  process.chdir(tmp);
  // Force re-import of ./route → ./server-config under the new cwd.
  vi.resetModules();
  ({ GET, POST } = await import('./route'));
});

afterAll(() => {
  process.chdir(realCwd);
  if (tmp && existsSync(tmp)) {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function configFile(): string {
  return join(tmp, 'data', 'server-config.json');
}

function readPersisted(): Record<string, unknown> {
  return JSON.parse(readFileSync(configFile(), 'utf-8')) as Record<string, unknown>;
}

// ---------------- Request builders ----------------

function getRequest(key: string | null): Request {
  const url = key === null
    ? 'http://localhost/api/admin/config'
    : `http://localhost/api/admin/config?key=${encodeURIComponent(key)}`;
  return new Request(url, { method: 'GET' });
}

function postJson(body: unknown): Request {
  return new Request('http://localhost/api/admin/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postRaw(text: string): Request {
  return new Request('http://localhost/api/admin/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });
}

// =====================================================================
// GET
// =====================================================================

describe('GET /api/admin/config', () => {
  it('returns 400 missing_key when ?key= is absent', async () => {
    const res = await GET(getRequest(null) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_key');
  });

  it('returns 400 unknown_key (with validKeys hint) for unsupported key', async () => {
    const res = await GET(getRequest('banana') as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unknown_key');
    expect(body.validKeys).toEqual(expect.arrayContaining(['prompt', 'model', 'rag']));
  });

  it('returns 200 with customPrompt when prompt is persisted', async () => {
    // Seed: write a customPrompt via a real POST round-trip first.
    const seed = await POST(postJson({
      key: 'prompt',
      value: { customPrompt: 'You are a helpful assistant.' },
    }) as never);
    expect(seed.status).toBe(200);

    const res = await GET(getRequest('prompt') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customPrompt).toBe('You are a helpful assistant.');
  });

  it('returns 200 with customPrompt: null when config has no prompt', async () => {
    // Fresh file (override previous test's state by writing empty object).
    const fs = await import('fs/promises');
    await fs.mkdir(join(tmp, 'data'), { recursive: true });
    await fs.writeFile(configFile(), '{}', 'utf-8');

    const res = await GET(getRequest('prompt') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customPrompt).toBeNull();
  });

  it('returns 200 with defaultModelId + customModels for key=model', async () => {
    // Seed
    await POST(postJson({
      key: 'model',
      value: {
        defaultModelId: 'qwen-plus',
        customModels: [{ id: 'x', name: 'X', providerType: 'openai', endpoint: 'e', apiKey: 'k', modelId: 'm' }],
      },
    }) as never);

    const res = await GET(getRequest('model') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultModelId).toBe('qwen-plus');
    expect(Array.isArray(body.customModels)).toBe(true);
    expect(body.customModels).toHaveLength(1);
  });

  it('returns 200 with ragParams (or null) for key=rag', async () => {
    const res = await GET(getRequest('rag') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    // The field MUST exist on the response (its value may be null).
    expect('ragParams' in body).toBe(true);
  });
});

// =====================================================================
// POST
// =====================================================================

describe('POST /api/admin/config', () => {
  it('returns 400 bad_json when the body is not valid JSON', async () => {
    const res = await POST(postRaw('{not json') as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_json');
  });

  it('returns 400 bad_request when key is missing', async () => {
    const res = await POST(postJson({ value: { customPrompt: 'hi' } }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('returns 400 bad_request when value is missing', async () => {
    const res = await POST(postJson({ key: 'prompt' }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('returns 400 bad_request when body is not an object', async () => {
    const res = await POST(postRaw('null') as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('persists customPrompt for key=prompt and is readable on the next GET', async () => {
    const value = 'Phase 1.5 seeded prompt — ' + Math.random().toString(36).slice(2);
    const post = await POST(postJson({ key: 'prompt', value: { customPrompt: value } }) as never);
    expect(post.status).toBe(200);
    const postBody = await post.json();
    expect(postBody.ok).toBe(true);
    expect(postBody.key).toBe('prompt');
    expect(typeof postBody.persistedAt).toBe('string');

    // Verify persistence on disk
    const persisted = readPersisted();
    expect(persisted.prompt).toBe(value);
    expect(typeof persisted.updatedAt).toBe('string');

    // Verify it round-trips through GET
    const get = await GET(getRequest('prompt') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.customPrompt).toBe(value);
  });

  it('merges ragParams (does not wholesale-replace other keys) for key=rag', async () => {
    // Seed an unrelated key
    await POST(postJson({ key: 'prompt', value: { customPrompt: 'keep me' } }) as never);

    const post = await POST(postJson({
      key: 'rag',
      value: { ragParams: { topK: 7, minScore: 0.5, maxChars: 4000, semanticWeight: 0.8, hydeEnabled: true, rerankEnabled: false, cacheTTL: 15 } },
    }) as never);
    expect(post.status).toBe(200);
    const postBody = await post.json();
    expect(postBody.ok).toBe(true);
    expect(postBody.key).toBe('rag');

    const persisted = readPersisted();
    // Other keys preserved (merge, not replace)
    expect(persisted.prompt).toBe('keep me');
    // ragParams written through
    const rag = persisted.ragParams as Record<string, unknown>;
    expect(rag.topK).toBe(7);
  });

  it('writes defaultModelId + customModels for key=model', async () => {
    const post = await POST(postJson({
      key: 'model',
      value: {
        defaultModelId: 'gpt-4o-mini',
        customModels: [
          { id: 'cm1', name: 'Custom One', providerType: 'openai', endpoint: 'https://x', apiKey: 'k1', modelId: 'm1' },
        ],
      },
    }) as never);
    expect(post.status).toBe(200);

    const persisted = readPersisted();
    expect(persisted.defaultModelId).toBe('gpt-4o-mini');
    const customModels = persisted.customModels as Array<{ id: string }>;
    expect(customModels).toHaveLength(1);
    expect(customModels[0].id).toBe('cm1');
  });

  it('returns 400 unknown_key for an unsupported key', async () => {
    const res = await POST(postJson({ key: 'banana', value: {} }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unknown_key');
  });
});
