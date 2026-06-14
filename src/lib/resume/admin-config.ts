// ReUp v2 admin-tab: server-only runtime config loader for 6 resume.* keys.
// 5s module-level memo; falls back to defaults on fetch failure.
// (server-only: this module is consumed only by server-side resume modules)
import { STAR_SECTIONS, type StarSection } from './star-rewriter';

const CACHE_TTL_MS = 5_000;
const CONFIG_API = '/api/admin/config';

export interface ResumeRuntimeConfig {
  topK: number;
  confidenceChars: number;
  fewShotIds: string[];
  sectionOrder: StarSection[];
}

const DEFAULTS: ResumeRuntimeConfig = {
  topK: 20,
  confidenceChars: 2000,
  fewShotIds: ['example-1'],
  sectionOrder: [...STAR_SECTIONS],
};

interface CacheEntry<T> { value: T; expires: number; }
const cache = new Map<string, CacheEntry<unknown>>();

async function fetchKey<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  try {
    const res = await fetch(`${CONFIG_API}?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!res.ok) {
      cache.set(key, { value: null, expires: now + CACHE_TTL_MS });
      return null;
    }
    const data = await res.json() as Record<string, unknown>;
    cache.set(key, { value: data, expires: now + CACHE_TTL_MS });
    return data as T;
  } catch {
    cache.set(key, { value: null, expires: now + CACHE_TTL_MS });
    return null;
  }
}

function mergeConfig(raw: Partial<ResumeRuntimeConfig> | null): ResumeRuntimeConfig {
  return {
    topK: raw?.topK ?? DEFAULTS.topK,
    confidenceChars: raw?.confidenceChars ?? DEFAULTS.confidenceChars,
    fewShotIds: raw?.fewShotIds ?? DEFAULTS.fewShotIds,
    sectionOrder: raw?.sectionOrder ?? DEFAULTS.sectionOrder,
  };
}

export async function getResumeRuntimeConfig(): Promise<ResumeRuntimeConfig> {
  const raw = await fetchKey<Partial<ResumeRuntimeConfig>>('resume.config');
  return mergeConfig(raw);
}

export async function getResumePrompt(kind: 'star' | 'ats' | 'match'): Promise<string | null> {
  const key = `resume.${kind}Prompt` as const;
  const data = await fetchKey<{ customPrompt?: string }>(key);
  return data?.customPrompt ?? null;
}

export async function isForcedLocalMode(): Promise<boolean> {
  const data = await fetchKey<{ forcedLocal?: boolean }>('resume.privacy');
  return data?.forcedLocal === true;
}

export function clearResumeConfigCache(): void {
  cache.clear();
}
