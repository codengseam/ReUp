// src/server/__tests__/runtime-config.test.ts
// src/server/runtime-config.ts is now a re-export shim (export * from '@/lib/runtime-config').
// This test verifies the shim re-exports all expected symbols; the full test suite lives in
// src/lib/runtime-config.test.ts.

import { describe, it, expect } from 'vitest';
import * as shim from '../runtime-config';

describe('server/runtime-config shim', () => {
  it('re-exports all expected symbols from lib/runtime-config', () => {
    expect(typeof shim.loadRuntimeConfig).toBe('function');
    expect(typeof shim.saveRuntimeConfig).toBe('function');
    expect(typeof shim.maskRuntimeConfig).toBe('function');
    expect(typeof shim.resolveMasked).toBe('function');
    expect(typeof shim.getDashScopeApiKey).toBe('function');
    expect(typeof shim.getZhipuApiKey).toBe('function');
    expect(typeof shim.getApiKeyForProvider).toBe('function');
    expect(typeof shim.getModelCandidates).toBe('function');
    expect(typeof shim.getDefaultModelCandidates).toBe('function');
    expect(typeof shim.getValidModelIdsSorted).toBe('function');
    expect(typeof shim.isModelExpired).toBe('function');
    expect(shim.BUILTIN_MODEL_REGISTRY).toBeDefined();
    expect(Object.keys(shim.BUILTIN_MODEL_REGISTRY)).toHaveLength(18);
    expect(typeof shim.DEFAULT_DASHSCOPE_BASE_URL).toBe('string');
    expect(typeof shim.DEFAULT_ZHIPU_BASE_URL).toBe('string');
  });
});
