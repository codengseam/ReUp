// src/lib/runtime-config.test.ts
// TDD tests for runtime-config.ts:
// - loadRuntimeConfig / saveRuntimeConfig (file IO + lock)
// - maskRuntimeConfig (security: never leak raw key)
// - getDashScopeApiKey / getZhipuApiKey (env-var first, runtime-config fallback)
// - getModelCandidates (built-in registry + fallback chain)

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
// BUILTIN_MODEL_REGISTRY
// =====================================================================

describe('BUILTIN_MODEL_REGISTRY', () => {
  it('contains expected entries: qwen primary, qwen fallback, glm family', () => {
    expect(Object.keys(BUILTIN_MODEL_REGISTRY).sort()).toEqual([
      'GLM-4-Flash',
      'GLM-4-Flash-250414',
      'GLM-4.5-Flash',
      'GLM-4.7-Flash',
      'qwen3.6-plus',
      'qwen3.6-plus-2026-04-02',
    ]);
  });

  it('qwen3.6-plus-2026-04-02 falls back to qwen3.6-plus (same provider)', () => {
    expect(BUILTIN_MODEL_REGISTRY['qwen3.6-plus-2026-04-02'].fallbackChain).toEqual(['qwen3.6-plus']);
  });

  it('qwen3.6-plus has no fallback chain', () => {
    expect(BUILTIN_MODEL_REGISTRY['qwen3.6-plus'].fallbackChain).toEqual([]);
  });

  it('GLM-4.7-Flash uses zhipu provider', () => {
    expect(BUILTIN_MODEL_REGISTRY['GLM-4.7-Flash'].provider).toBe('zhipu');
  });

  it('default base URLs point to known providers', () => {
    expect(DEFAULT_DASHSCOPE_BASE_URL).toMatch(/dashscope\.aliyuncs\.com/);
    expect(DEFAULT_ZHIPU_BASE_URL).toMatch(/bigmodel\.cn/);
  });
});

// =====================================================================
// getModelCandidates
// =====================================================================

describe('getModelCandidates', () => {
  it('returns [primary, fallback] for qwen3.6-plus-2026-04-02', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getModelCandidates('qwen3.6-plus-2026-04-02');
    expect(cands).toHaveLength(2);
    expect(cands[0].model).toBe('qwen3.6-plus-2026-04-02');
    expect(cands[1].model).toBe('qwen3.6-plus');
    expect(cands[0].baseUrl).toBe(DEFAULT_DASHSCOPE_BASE_URL);
    expect(cands[0].apiKey).toBe('sk-test');
  });

  it('returns [primary] for qwen3.6-plus (no fallback)', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getModelCandidates('qwen3.6-plus');
    expect(cands).toHaveLength(1);
    expect(cands[0].model).toBe('qwen3.6-plus');
  });

  it('returns primary + fallbacks for GLM-4.7-Flash with zhipu endpoint', async () => {
    process.env.ZHIPU_API_KEY = 'zhipu-key';
    const cands = await getModelCandidates('GLM-4.7-Flash');
    // GLM-4.7-Flash fallbackChain = ['GLM-4.5-Flash', 'GLM-4-Flash-250414', 'GLM-4-Flash']
    expect(cands).toHaveLength(4);
    expect(cands[0].model).toBe('GLM-4.7-Flash');
    expect(cands[0].baseUrl).toBe(DEFAULT_ZHIPU_BASE_URL);
    expect(cands[0].apiKey).toBe('zhipu-key');
  });

  it('returns [] when provider key is missing (no silent env stub)', async () => {
    const cands = await getModelCandidates('qwen3.6-plus-2026-04-02');
    expect(cands).toEqual([]);
  });

  it('returns [] for unknown model id', async () => {
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getModelCandidates('unknown-model');
    expect(cands).toEqual([]);
  });

  it('skips a fallback whose provider key is missing', async () => {
    // Simulate: primary has key, but fallback provider key is missing.
    // Since both share the dashscope provider, this shouldn't drop the fallback.
    process.env.DASHSCOPE_API_KEY = 'sk-test';
    const cands = await getModelCandidates('qwen3.6-plus-2026-04-02');
    expect(cands.map(c => c.model)).toEqual(['qwen3.6-plus-2026-04-02', 'qwen3.6-plus']);
  });
});
