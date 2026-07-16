// src/lib/runtime-config.test.ts
// TDD tests for runtime-config.ts:
// - loadRuntimeConfig / saveRuntimeConfig (file IO + lock)
// - maskRuntimeConfig (security: never leak raw key)
// - getDashScopeApiKey / getZhipuApiKey (env-var first, runtime-config fallback)
// - getModelCandidates (built-in registry + expiration-aware rotation)

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const realCwd = process.cwd();
let tmp: string;

let loadRuntimeConfig: typeof import('./runtime-config').loadRuntimeConfig;
let saveRuntimeConfig: typeof import('./runtime-config').saveRuntimeConfig;
let maskRuntimeConfig: typeof import('./runtime-config').maskRuntimeConfig;
let resolveMasked: typeof import('./runtime-config').resolveMasked;
let getDashScopeApiKey: typeof import('./runtime-config').getDashScopeApiKey;
let getZhipuApiKey: typeof import('./runtime-config').getZhipuApiKey;
let getApiKeyForProvider: typeof import('./runtime-config').getApiKeyForProvider;
let getModelCandidates: typeof import('./runtime-config').getModelCandidates;
let getDefaultModelCandidates: typeof import('./runtime-config').getDefaultModelCandidates;
let getValidModelIdsSorted: typeof import('./runtime-config').getValidModelIdsSorted;
let isModelExpired: typeof import('./runtime-config').isModelExpired;
let BUILTIN_MODEL_REGISTRY: typeof import('./runtime-config').BUILTIN_MODEL_REGISTRY;
let DEFAULT_DASHSCOPE_BASE_URL: typeof import('./runtime-config').DEFAULT_DASHSCOPE_BASE_URL;
let DEFAULT_ZHIPU_BASE_URL: typeof import('./runtime-config').DEFAULT_ZHIPU_BASE_URL;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'reup-runtime-config-'));
  process.chdir(tmp);
  vi.resetModules();
  const mod = await import('./runtime-config');
  loadRuntimeConfig = mod.loadRuntimeConfig;
  saveRuntimeConfig = mod.saveRuntimeConfig;
  maskRuntimeConfig = mod.maskRuntimeConfig;
  resolveMasked = mod.resolveMasked;
  getDashScopeApiKey = mod.getDashScopeApiKey;
  getZhipuApiKey = mod.getZhipuApiKey;
  getApiKeyForProvider = mod.getApiKeyForProvider;
  getModelCandidates = mod.getModelCandidates;
  getDefaultModelCandidates = mod.getDefaultModelCandidates;
  getValidModelIdsSorted = mod.getValidModelIdsSorted;
  isModelExpired = mod.isModelExpired;
  BUILTIN_MODEL_REGISTRY = mod.BUILTIN_MODEL_REGISTRY;
  DEFAULT_DASHSCOPE_BASE_URL = mod.DEFAULT_DASHSCOPE_BASE_URL;
  DEFAULT_ZHIPU_BASE_URL = mod.DEFAULT_ZHIPU_BASE_URL;
});

afterAll(() => {
  process.chdir(realCwd);
  if (tmp && existsSync(tmp)) {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function configFile(): string {
  return join(tmp, 'data', '.runtime-config.json');
}

function readPersisted(): Record<string, unknown> {
  return JSON.parse(readFileSync(configFile(), 'utf-8')) as Record<string, unknown>;
}

beforeEach(() => {
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.ZHIPU_API_KEY;
  // 重置文件到空状态，避免测试间污染
  try {
    rmSync(configFile(), { force: true });
  } catch { /* ignore */ }
});

// =====================================================================
// loadRuntimeConfig / saveRuntimeConfig
// =====================================================================

describe('loadRuntimeConfig / saveRuntimeConfig', () => {
  it('returns empty config when file does not exist', async () => {
    const cfg = await loadRuntimeConfig();
    expect(cfg).toEqual({});
  });

  it('persists a partial via saveRuntimeConfig and reads it back', async () => {
    const saved = await saveRuntimeConfig({
      apiKeys: {
        dashscope: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'sk-test-dash' },
      },
    });
    expect(saved.apiKeys?.dashscope?.apiKey).toBe('sk-test-dash');
    expect(saved.updatedAt).toBeTruthy();

    const onDisk = readPersisted();
    expect(onDisk.apiKeys).toEqual({
      dashscope: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'sk-test-dash' },
    });
  });

  it('merges new partial with existing config (does not clobber other providers)', async () => {
    await saveRuntimeConfig({
      apiKeys: { dashscope: { endpoint: 'ep1', apiKey: 'k1' } },
    });
    await saveRuntimeConfig({
      apiKeys: { zhipu: { endpoint: 'ep2', apiKey: 'k2' } },
    });
    const cfg = await loadRuntimeConfig();
    expect(cfg.apiKeys?.dashscope?.apiKey).toBe('k1');
    expect(cfg.apiKeys?.zhipu?.apiKey).toBe('k2');
  });
});

// =====================================================================
// maskRuntimeConfig — security
// =====================================================================

describe('maskRuntimeConfig', () => {
  it('replaces every apiKey with the MASK sentinel', () => {
    const cfg = {
      apiKeys: {
        dashscope: { endpoint: 'ep1', apiKey: 'sk-supersecret-12345' },
        zhipu: { endpoint: 'ep2', apiKey: 'real-zhipu-key' },
      },
      updatedAt: '2026-06-15T00:00:00Z',
    };
    const masked = maskRuntimeConfig(cfg);
    expect(masked.apiKeys?.dashscope?.apiKey).toBe('***MASKED***');
    expect(masked.apiKeys?.zhipu?.apiKey).toBe('***MASKED***');
    expect(masked.updatedAt).toBe('2026-06-15T00:00:00Z');
  });

  it('returns empty apiKey (not MASK) when the original is empty string', () => {
    const cfg = { apiKeys: { dashscope: { endpoint: 'ep', apiKey: '' } } };
    const masked = maskRuntimeConfig(cfg);
    expect(masked.apiKeys?.dashscope?.apiKey).toBe('');
  });

  it('does not include any raw key in the response when apiKeys is undefined', () => {
    const masked = maskRuntimeConfig({});
    expect(masked.apiKeys).toBeUndefined();
  });

  it('resolveMasked() returns empty string for the MASK sentinel', () => {
    expect(resolveMasked('***MASKED***')).toBe('');
    expect(resolveMasked('sk-real-key')).toBe('sk-real-key');
  });
});

// =====================================================================
// env-var vs runtime-config precedence
// =====================================================================

describe('env-var vs runtime-config key resolution', () => {
  it('getDashScopeApiKey returns env value when set', () => {
    process.env.DASHSCOPE_API_KEY = 'sk-env-key';
    expect(getDashScopeApiKey()).toBe('sk-env-key');
  });

  it('getDashScopeApiKey returns undefined when env unset and no file', () => {
    expect(getDashScopeApiKey()).toBeUndefined();
  });

  it('getDashScopeApiKey trims whitespace from env', () => {
    process.env.DASHSCOPE_API_KEY = '  sk-spaced  ';
    expect(getDashScopeApiKey()).toBe('sk-spaced');
  });

  it('getZhipuApiKey returns env value when set', () => {
    process.env.ZHIPU_API_KEY = 'zhipu-env';
    expect(getZhipuApiKey()).toBe('zhipu-env');
  });

  it('getApiKeyForProvider prefers env over runtime-config', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-env';
    await saveRuntimeConfig({
      apiKeys: { dashscope: { endpoint: 'ep', apiKey: 'sk-file' } },
    });
    expect(await getApiKeyForProvider('dashscope')).toBe('sk-env');
  });

  it('getApiKeyForProvider falls back to runtime-config when env unset', async () => {
    await saveRuntimeConfig({
      apiKeys: { dashscope: { endpoint: 'ep', apiKey: 'sk-file-fb' } },
    });
    expect(await getApiKeyForProvider('dashscope')).toBe('sk-file-fb');
  });

  it('getApiKeyForProvider returns undefined when neither env nor file has the key', async () => {
    expect(await getApiKeyForProvider('zhipu')).toBeUndefined();
  });
});

// =====================================================================
// BUILTIN_MODEL_REGISTRY — 免费模型清单（全部 dashscope，按 expiresAt 升序）
// =====================================================================

describe('BUILTIN_MODEL_REGISTRY', () => {
  it('contains 18 free-tier models sorted by expiresAt ascending', () => {
    const keys = Object.keys(BUILTIN_MODEL_REGISTRY);
    expect(keys).toHaveLength(18);
    // 第一个应是过期最早的 qwen3.6-flash (2026-07-17)
    expect(keys[0]).toBe('qwen3.6-flash');
    // 最后一个是过期最晚的 glm-5.2 (2026-09-15)
    expect(keys[keys.length - 1]).toBe('glm-5.2');
  });

  it('all models use dashscope provider', () => {
    for (const entry of Object.values(BUILTIN_MODEL_REGISTRY)) {
      expect(entry.provider).toBe('dashscope');
    }
  });

  it('every entry has an expiresAt field (YYYY-MM-DD)', () => {
    for (const entry of Object.values(BUILTIN_MODEL_REGISTRY)) {
      expect(entry.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('does not contain old removed models', () => {
    const keys = Object.keys(BUILTIN_MODEL_REGISTRY);
    expect(keys).not.toContain('qwen3.6-plus-2026-04-02');
    expect(keys).not.toContain('qwen3.6-plus');
    expect(keys).not.toContain('GLM-4.7-Flash');
    expect(keys).not.toContain('GLM-4.5-Flash');
    expect(keys).not.toContain('GLM-4-Flash-250414');
    expect(keys).not.toContain('GLM-4-Flash');
  });

  it('default base URLs point to known providers', () => {
    expect(DEFAULT_DASHSCOPE_BASE_URL).toMatch(/dashscope\.aliyuncs\.com/);
    expect(DEFAULT_ZHIPU_BASE_URL).toMatch(/bigmodel\.cn/);
  });
});

// =====================================================================
// isModelExpired / getValidModelIdsSorted — 过期感知
// =====================================================================

describe('isModelExpired', () => {
  it('returns false for undefined expiresAt (never expires)', () => {
    expect(isModelExpired(undefined)).toBe(false);
  });

  it('returns false on the expiry day (end of day not yet reached)', () => {
    expect(isModelExpired('2026-07-17', new Date('2026-07-17T12:00:00'))).toBe(false);
    expect(isModelExpired('2026-07-17', new Date('2026-07-17T23:59:59'))).toBe(false);
  });

  it('returns true after the expiry day', () => {
    expect(isModelExpired('2026-07-17', new Date('2026-07-18T00:00:00'))).toBe(true);
    expect(isModelExpired('2026-07-17', new Date('2026-08-01'))).toBe(true);
  });

  it('returns false for invalid date format', () => {
    expect(isModelExpired('invalid', new Date())).toBe(false);
    expect(isModelExpired('2026/07/17', new Date())).toBe(false);
  });
});

describe('getValidModelIdsSorted', () => {
  it('returns all 18 models when none are expired (now before earliest expiry)', () => {
    const ids = getValidModelIdsSorted(new Date('2026-07-15'));
    expect(ids).toHaveLength(18);
  });

  it('skips expired models and keeps the rest sorted by expiresAt', () => {
    // 2026-07-18: the 3 models expiring 2026-07-17 are gone, 15 remain
    const ids = getValidModelIdsSorted(new Date('2026-07-18'));
    expect(ids).toHaveLength(15);
    expect(ids).not.toContain('qwen3.6-flash');
    expect(ids).not.toContain('qwen3.6-35b-a3b');
    expect(ids).not.toContain('qwen3.6-flash-2026-04-16');
    // first remaining should be qwen3.6-max-preview (2026-07-20)
    expect(ids[0]).toBe('qwen3.6-max-preview');
  });

  it('returns empty array when all models are expired', () => {
    const ids = getValidModelIdsSorted(new Date('2030-01-01'));
    expect(ids).toEqual([]);
  });
});

// =====================================================================
// getModelCandidates — 过期感知轮换
// =====================================================================

describe('getModelCandidates', () => {
  it('returns [primary, ...rest sorted by expiresAt] for a valid primary', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getModelCandidates('glm-5.2');
    expect(cands.length).toBe(18);
    // primary is prepended first
    expect(cands[0].model).toBe('glm-5.2');
    // remaining are sorted by expiresAt ascending (qwen3.6-flash first)
    expect(cands[1].model).toBe('qwen3.6-flash');
    expect(cands[0].baseUrl).toBe(DEFAULT_DASHSCOPE_BASE_URL);
    expect(cands[0].apiKey).toBe('sk-test');
  });

  it('returns all valid models sorted by expiresAt when primary is unknown', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getModelCandidates('unknown-model');
    // unknown primary is not in registry, so all valid models returned in expiresAt order
    expect(cands.length).toBe(18);
    expect(cands[0].model).toBe('qwen3.6-flash');
    expect(cands[cands.length - 1].model).toBe('glm-5.2');
  });

  it('returns [] when API key is missing', async () => {
    const cands = await getModelCandidates('qwen3.6-flash');
    expect(cands).toEqual([]);
  });

  it('all candidates share the same dashscope baseUrl and apiKey', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getModelCandidates('qwen3.6-flash');
    for (const c of cands) {
      expect(c.baseUrl).toBe(DEFAULT_DASHSCOPE_BASE_URL);
      expect(c.apiKey).toBe('sk-test');
    }
  });
});

describe('getDefaultModelCandidates', () => {
  it('returns all valid models sorted by expiresAt ascending (consume soonest first)', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getDefaultModelCandidates();
    expect(cands.length).toBe(18);
    expect(cands[0].model).toBe('qwen3.6-flash');
    expect(cands[1].model).toBe('qwen3.6-35b-a3b');
    expect(cands[cands.length - 1].model).toBe('glm-5.2');
  });

  it('returns [] when API key is missing', async () => {
    const cands = await getDefaultModelCandidates();
    expect(cands).toEqual([]);
  });
});
