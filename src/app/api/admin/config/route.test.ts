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

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

// =====================================================================
// resume.* keys (Phase 3+ — ReUp v2 resume advisor runtime config)
// =====================================================================

/**
 * Reset the on-disk config to an empty object so each resume.* test
 * starts from a clean state (avoids bleed-through from earlier tests
 * or sibling cases).
 */
async function resetConfigFile(): Promise<void> {
  const fs = await import('fs/promises');
  await fs.mkdir(join(tmp, 'data'), { recursive: true });
  await fs.writeFile(configFile(), '{}', 'utf-8');
}

describe('GET /api/admin/config — resume.* keys (defaults)', () => {
  beforeEach(async () => { await resetConfigFile(); });

  it('returns 200 with empty object for key=resume.config when nothing is persisted', async () => {
    const res = await GET(getRequest('resume.config') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it('returns 200 with empty object for key=resume.privacy when nothing is persisted', async () => {
    const res = await GET(getRequest('resume.privacy') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it('returns 200 with { customPrompt: null } for key=resume.starPrompt when nothing is persisted', async () => {
    const res = await GET(getRequest('resume.starPrompt') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ customPrompt: null });
  });

  it('returns 400 unknown_key for key=resume.unknown (not in catalogue)', async () => {
    const res = await GET(getRequest('resume.unknown') as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unknown_key');
    // validKeys should advertise all 9 keys (3 original + 6 resume.*)
    expect(body.validKeys).toEqual(expect.arrayContaining([
      'prompt', 'model', 'rag',
      'resume.config', 'resume.privacy',
      'resume.starPrompt', 'resume.starFewShot',
      'resume.atsPrompt', 'resume.matchPrompt',
    ]));
  });
});

describe('POST /api/admin/config — resume.* keys (round-trip + isolation)', () => {
  beforeEach(async () => { await resetConfigFile(); });

  it('persists resume.config and round-trips through GET', async () => {
    const value = {
      topK: 30,
      confidenceChars: 2500,
      fewShotIds: ['example-1', 'example-2'],
      sectionOrder: ['A', 'B', 'C', 'D'],
    };
    const post = await POST(postJson({ key: 'resume.config', value }) as never);
    expect(post.status).toBe(200);
    const postBody = await post.json();
    expect(postBody.ok).toBe(true);
    expect(postBody.key).toBe('resume.config');
    expect(typeof postBody.persistedAt).toBe('string');

    // Verify on-disk shape
    const persisted = readPersisted();
    const resume = persisted.resume as Record<string, unknown>;
    const cfg = resume.config as Record<string, unknown>;
    expect(cfg.topK).toBe(30);
    expect(cfg.confidenceChars).toBe(2500);
    expect(cfg.fewShotIds).toEqual(['example-1', 'example-2']);
    expect(cfg.sectionOrder).toEqual(['A', 'B', 'C', 'D']);

    // Verify GET round-trip
    const get = await GET(getRequest('resume.config') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.topK).toBe(30);
    expect(getBody.confidenceChars).toBe(2500);
    expect(getBody.fewShotIds).toEqual(['example-1', 'example-2']);
    expect(getBody.sectionOrder).toEqual(['A', 'B', 'C', 'D']);
  });

  it('persists resume.privacy.forcedLocal and round-trips through GET', async () => {
    const post = await POST(postJson({
      key: 'resume.privacy',
      value: { forcedLocal: true },
    }) as never);
    expect(post.status).toBe(200);

    const persisted = readPersisted();
    const resume = persisted.resume as Record<string, unknown>;
    const privacy = resume.privacy as Record<string, unknown>;
    expect(privacy.forcedLocal).toBe(true);

    const get = await GET(getRequest('resume.privacy') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.forcedLocal).toBe(true);
  });

  it('persists resume.starPrompt customPrompt and round-trips through GET', async () => {
    const post = await POST(postJson({
      key: 'resume.starPrompt',
      value: { customPrompt: 'OVERRIDE' },
    }) as never);
    expect(post.status).toBe(200);

    const persisted = readPersisted();
    const resume = persisted.resume as Record<string, unknown>;
    expect(resume.starPrompt).toBe('OVERRIDE');

    const get = await GET(getRequest('resume.starPrompt') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.customPrompt).toBe('OVERRIDE');
  });

  it('persists resume.atsPrompt and round-trips through GET', async () => {
    const post = await POST(postJson({
      key: 'resume.atsPrompt',
      value: { customPrompt: 'A' },
    }) as never);
    expect(post.status).toBe(200);

    const get = await GET(getRequest('resume.atsPrompt') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.customPrompt).toBe('A');
  });

  it('persists resume.matchPrompt and round-trips through GET', async () => {
    const post = await POST(postJson({
      key: 'resume.matchPrompt',
      value: { customPrompt: 'M' },
    }) as never);
    expect(post.status).toBe(200);

    const get = await GET(getRequest('resume.matchPrompt') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.customPrompt).toBe('M');
  });

  it('persists resume.starFewShot and round-trips through GET', async () => {
    const post = await POST(postJson({
      key: 'resume.starFewShot',
      value: { customPrompt: 'few-shot text' },
    }) as never);
    expect(post.status).toBe(200);

    const get = await GET(getRequest('resume.starFewShot') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.customPrompt).toBe('few-shot text');
  });

  it('POST resume.config without value → 400 bad_request', async () => {
    const res = await POST(postJson({ key: 'resume.config' }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('POST resume.starPrompt with value: {} (missing customPrompt) → 400', async () => {
    const res = await POST(postJson({
      key: 'resume.starPrompt',
      value: {},
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('POST resume.privacy with non-boolean forcedLocal → 400', async () => {
    const res = await POST(postJson({
      key: 'resume.privacy',
      value: { forcedLocal: 'yes' },
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('POST resume.config with wrong field types (Zod rejection) → 400', async () => {
    const res = await POST(postJson({
      key: 'resume.config',
      value: { topK: 'not-a-number' },
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('isolation: persisting resume.config does not clobber resume.privacy', async () => {
    // Seed: set resume.privacy first
    const seed = await POST(postJson({
      key: 'resume.privacy',
      value: { forcedLocal: true },
    }) as never);
    expect(seed.status).toBe(200);

    // Now write resume.config
    const post = await POST(postJson({
      key: 'resume.config',
      value: { topK: 42 },
    }) as never);
    expect(post.status).toBe(200);

    // resume.privacy must still be readable with its original value
    const get = await GET(getRequest('resume.privacy') as never);
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.forcedLocal).toBe(true);

    // And resume.config is now persisted alongside it
    const getCfg = await GET(getRequest('resume.config') as never);
    expect(getCfg.status).toBe(200);
    const cfgBody = await getCfg.json();
    expect(cfgBody.topK).toBe(42);
  });
});
