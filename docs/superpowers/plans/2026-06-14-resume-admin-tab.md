# Admin 简历 Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "简历" top-level tab to `/admin` with 4 cards: 隐私策略 / 提示词 / 评测集 / 配置. Edit-then-reload-free runtime injection of prompts, privacy override, eval, and 4 config knobs.

**Architecture:** Reuse existing `/api/admin/config` storage with 6 new `resume.*` keys. Add `src/lib/resume/admin-config.ts` as a 5s-memoed read layer (`server-only`). UI mirrors the existing `PromptTab` debounce+toast pattern. `eval-runner.ts` extracts benchmark logic from `ats.benchmark.test.ts` and is shared by the new `POST /api/admin/resume/eval` route.

**Tech Stack:** Next.js 16 App Router · React 19 · TS 5 strict · Radix/shadcn · Vitest 4 · pnpm 9

**Spec:** [docs/superpowers/specs/2026-06-14-resume-admin-tab-design.md](file:///Users/dev/Downloads/reup/docs/superpowers/specs/2026-06-14-resume-admin-tab-design.md) (commit f754e3a)

---

## File Structure

**New (10 source + 5 test):**
- `src/lib/resume/admin-config.ts` — 5s memoed read of 6 `resume.*` config keys
- `src/lib/resume/eval-runner.ts` — extracts benchmark logic, callable from API + tests
- `src/app/api/admin/resume/eval/route.ts` — POST endpoint
- `src/app/admin/_components/resume-tab.tsx` — 4-card orchestrator
- `src/app/admin/_components/resume/_PrivacyCard.tsx`
- `src/app/admin/_components/resume/_PromptsCard.tsx`
- `src/app/admin/_components/resume/_EvalCard.tsx`
- `src/app/admin/_components/resume/_ConfigCard.tsx`
- `+ 5 test files co-located (`*.test.ts` / `*.test.tsx`)

**Modified (8):**
- `src/app/admin/page.tsx` — add `resume` tab
- `src/app/admin/_lib/types.ts` — `TabKey` += `'resume'`
- `src/lib/resume/privacy.ts` — async + 3-layer priority
- `src/lib/resume/prompts/star.ts` — `systemOverride` param
- `src/lib/resume/ats.ts` — `topK` + `systemOverride` params
- `src/lib/resume/matcher.ts` — `systemOverride` param
- `src/lib/resume/star-rewriter.ts` — `confidenceChars` from config
- `src/lib/resume/iteration.ts` — pass-through
- `src/lib/resume/ats.benchmark.test.ts` — reuse `runEval`

**Dependency graph (→ blocks):**
```
T1 admin-config  ─┬─→ T3 privacy, T4 star, T5 ats, T6 matcher, T7 star-rewriter, T8 iteration
                  └─→ T12 ConfigCard
T2 eval-runner  ─┬─→ T9 eval API
                  └─→ T13 EvalCard
T9 eval API    ──→ T13 EvalCard
T10 orchestrator ─→ T11/T12/T13/T14 cards
T15 page wiring (last, gates verify)
T16 benchmark refactor (parallel to UI)
T17 verify (last)
```

**Batches (max parallelism):**
- **B1** (parallel 2): T1 admin-config, T2 eval-runner
- **B2** (parallel 6): T3-T8 (config consumers)
- **B3** (parallel 2): T9 eval API, T10 orchestrator + page types
- **B4** (parallel 4): T11 PrivacyCard, T12 PromptsCard, T13 EvalCard, T14 ConfigCard
- **B5** (parallel 3): T15 page wiring, T16 benchmark refactor, T17 verify

---

## Task T1: `admin-config.ts` runtime config loader (TDD)

**Files:**
- Create: `src/lib/resume/admin-config.ts`
- Test: `src/lib/resume/admin-config.test.ts`

- [ ] **Step 1: Write failing test (`admin-config.test.ts`)**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getResumeRuntimeConfig, getResumePrompt, isForcedLocalMode, clearResumeConfigCache } from './admin-config';

const CONFIG = '/api/admin/config';

describe('admin-config', () => {
  beforeEach(() => { clearResumeConfigCache(); vi.restoreAllMocks(); });

  it('returns defaults when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const cfg = await getResumeRuntimeConfig();
    expect(cfg.topK).toBe(20);
    expect(cfg.confidenceChars).toBe(2000);
    expect(cfg.fewShotIds).toEqual(['example-1']);
    expect(cfg.sectionOrder).toEqual(['我的分析', 'STAR改写', '底层心法', '建议']);
  });

  it('merges server config with defaults (partial)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === `${CONFIG}?key=resume.config`) {
        return new Response(JSON.stringify({ topK: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }));
    const cfg = await getResumeRuntimeConfig();
    expect(cfg.topK).toBe(30);
    expect(cfg.confidenceChars).toBe(2000); // fallback
  });

  it('caches results within 5s window', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ topK: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await getResumeRuntimeConfig();
    await getResumeRuntimeConfig();
    await getResumeRuntimeConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clearResumeConfigCache forces refetch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ topK: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await getResumeRuntimeConfig();
    clearResumeConfigCache();
    await getResumeRuntimeConfig();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('getResumePrompt returns null when not set', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const p = await getResumePrompt('star');
    expect(p).toBeNull();
  });

  it('getResumePrompt returns string for resume.starPrompt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === `${CONFIG}?key=resume.starPrompt`) {
        return new Response(JSON.stringify({ customPrompt: 'OVERRIDE' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }));
    const p = await getResumePrompt('star');
    expect(p).toBe('OVERRIDE');
  });

  it('isForcedLocalMode reads resume.privacy.forcedLocal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === `${CONFIG}?key=resume.privacy`) {
        return new Response(JSON.stringify({ forcedLocal: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }));
    expect(await isForcedLocalMode()).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure (module not found)**

```bash
pnpm vitest run src/lib/resume/admin-config.test.ts
```

- [ ] **Step 3: Implement `admin-config.ts`**

```ts
// src/lib/resume/admin-config.ts
// ReUp v2 admin-tab: server-only runtime config loader for 6 resume.* keys.
// 5s module-level memo; falls back to defaults on fetch failure.
import 'server-only';
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
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/admin-config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/admin-config.ts src/lib/resume/admin-config.test.ts
git commit -m "feat(resume): admin-config loader with 5s memo (T1)"
```

---

## Task T2: `eval-runner.ts` extracted from `ats.benchmark.test.ts` (TDD)

**Files:**
- Create: `src/lib/resume/eval-runner.ts`
- Test: `src/lib/resume/eval-runner.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/resume/eval-runner.test.ts
import { describe, it, expect } from 'vitest';
import { runEval, loadFixtures } from './eval-runner';

describe('eval-runner', () => {
  it('loadFixtures returns 12 fixtures from data/resume-eval/', async () => {
    const fs = await loadFixtures();
    expect(fs.length).toBe(12);
    expect(fs[0]).toHaveProperty('id');
    expect(fs[0]).toHaveProperty('jd');
    expect(fs[0]).toHaveProperty('resume');
    expect(fs[0]).toHaveProperty('expectedTopKeywords');
    expect(fs[0]).toHaveProperty('expectedMinCoverage');
  });

  it('runEval completes without LLM (TF path) and returns 12 rows + avgCoverage', async () => {
    const { rows, avgCoverage } = await runEval({ topK: 20 });
    expect(rows.length).toBe(12);
    for (const r of rows) {
      expect(r.coveragePct).toBeGreaterThanOrEqual(0);
      expect(r.coveragePct).toBeLessThanOrEqual(100);
      expect(r.id).toBeTruthy();
    }
    expect(avgCoverage).toBeGreaterThanOrEqual(85);
  });

  it('all 12 fixtures pass their expectedMinCoverage', async () => {
    const { rows } = await runEval();
    const fs = await loadFixtures();
    const expectations = new Map(fs.map(f => [f.id, f.expectedMinCoverage]));
    for (const r of rows) {
      const min = expectations.get(r.id);
      if (typeof min === 'number') {
        expect(r.coveragePct).toBeGreaterThanOrEqual(min);
      }
    }
  });
});
```

- [ ] **Step 2: Run, expect failure (module not found)**

```bash
pnpm vitest run src/lib/resume/eval-runner.test.ts
```

- [ ] **Step 3: Read existing benchmark for shape parity**

```bash
sed -n '1,80p' src/lib/resume/ats.benchmark.test.ts
```

- [ ] **Step 4: Implement `eval-runner.ts`**

```ts
// src/lib/resume/eval-runner.ts
// ReUp v2 admin-tab: shared benchmark runner for ATS eval.
// TF (no-LLM) path; reused by /api/admin/resume/eval and ats.benchmark.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractJdKeywordsTf, computeAtsCoverage } from './ats';
import type { ResumeDocument } from './types';

export interface EvalFixture {
  id: string;
  jdTitle: string;
  resume: ResumeDocument;
  jd: string;
  expectedTopKeywords: string[];
  expectedMinCoverage: number;
}

export interface EvalRow {
  id: string;
  jdTitle: string;
  coveragePct: number;
  passed: boolean;
  missingTopK: string[];
}

export async function loadFixtures(): Promise<EvalFixture[]> {
  const dir = join(process.cwd(), 'data', 'resume-eval');
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as EvalFixture;
    return raw;
  });
}

export async function runEval(opts: { topK?: number } = {}): Promise<{ rows: EvalRow[]; avgCoverage: number }> {
  const topK = opts.topK ?? 20;
  const fixtures = await loadFixtures();
  const rows: EvalRow[] = [];
  for (const f of fixtures) {
    const kws = extractJdKeywordsTf(f.jd, { topK });
    const coverage = computeAtsCoverage(f.resume, kws);
    rows.push({
      id: f.id,
      jdTitle: f.jdTitle,
      coveragePct: coverage.coverage.percentage,
      passed: coverage.coverage.percentage >= f.expectedMinCoverage,
      missingTopK: coverage.missing.map(m => m.term).slice(0, 3),
    });
  }
  const avgCoverage = rows.reduce((s, r) => s + r.coveragePct, 0) / rows.length;
  return { rows, avgCoverage };
}
```

- [ ] **Step 5: Verify `extractJdKeywordsTf` and `computeAtsCoverage` are exported from `ats.ts`**

```bash
grep -n "export" src/lib/resume/ats.ts | head -20
```

If `extractJdKeywordsTf` is private, expose it. The TF helper inside `extractJdKeywords` is private; refactor it to a top-level `extractJdKeywordsTf(jd, { topK }): JdKeyword[]` and have the LLM `extractJdKeywords` call it as fallback. Then re-export from `ats.ts`.

- [ ] **Step 6: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/eval-runner.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/resume/eval-runner.ts src/lib/resume/eval-runner.test.ts src/lib/resume/ats.ts
git commit -m "feat(resume): eval-runner extracted for shared benchmark (T2)"
```

---

## Task T3: `privacy.ts` async + 3-layer priority

**Files:**
- Modify: `src/lib/resume/privacy.ts`
- Modify callers (4 sites): `src/app/resume/page.tsx` and any other `isPrivacyMode()` user

- [ ] **Step 1: Run existing privacy tests, expect green baseline**

```bash
pnpm vitest run src/lib/resume/privacy.test.ts
```

- [ ] **Step 2: Update `privacy.ts`**

Replace file contents:

```ts
// src/lib/resume/privacy.ts
// ReUp v2 admin-tab: 3-layer privacy priority chain.
// admin-override (server config) > NEXT_PUBLIC_PRIVACY_MODE env > localStorage
import 'server-only';
import { isForcedLocalMode } from './admin-config';

export const STORAGE_KEY = 'reup:privacy-mode';
export const PRIVACY_VALUE = 'local-only';

export type PrivacyMode = 'local-only' | 'cloud-ok';

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  const ls: unknown = (globalThis as { localStorage?: Storage }).localStorage;
  if (typeof ls === 'undefined' || ls === null) return null;
  return ls as Storage;
}

function readEnvFlag(): boolean {
  const v = process.env.NEXT_PUBLIC_PRIVACY_MODE;
  return v === PRIVACY_VALUE;
}

function readLocalStorage(): boolean {
  const ls = getStorage();
  if (!ls) return false;
  try { return ls.getItem(STORAGE_KEY) === PRIVACY_VALUE; } catch { return false; }
}

export async function isPrivacyMode(): Promise<boolean> {
  if (await isForcedLocalMode()) return true;   // admin override
  if (readEnvFlag()) return true;                // env
  return readLocalStorage();                     // user toggle
}

export function setPrivacyMode(enabled: boolean): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    if (enabled) ls.setItem(STORAGE_KEY, PRIVACY_VALUE);
    else ls.removeItem(STORAGE_KEY);
  } catch (err) { console.error('[resume/privacy] setPrivacyMode failed:', err); }
}
```

- [ ] **Step 3: Update `privacy.test.ts` to mock `admin-config` and assert 3-layer priority**

```ts
// Update tests in src/lib/resume/privacy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./admin-config', () => ({
  isForcedLocalMode: vi.fn(async () => false),
}));

import { isPrivacyMode, setPrivacyMode, PRIVACY_VALUE, STORAGE_KEY } from './privacy';
import { isForcedLocalMode } from './admin-config';

describe('privacy 3-layer', () => {
  beforeEach(() => {
    localStorage.clear();
    delete process.env.NEXT_PUBLIC_PRIVACY_MODE;
    vi.mocked(isForcedLocalMode).mockResolvedValue(false);
  });

  it('admin override wins over env and localStorage', async () => {
    process.env.NEXT_PUBLIC_PRIVACY_MODE = PRIVACY_VALUE;
    setPrivacyMode(false);
    vi.mocked(isForcedLocalMode).mockResolvedValue(true);
    expect(await isPrivacyMode()).toBe(true);
  });

  it('env wins over localStorage when no admin override', async () => {
    process.env.NEXT_PUBLIC_PRIVACY_MODE = PRIVACY_VALUE;
    setPrivacyMode(false);
    expect(await isPrivacyMode()).toBe(true);
  });

  it('localStorage used when env unset and no admin override', async () => {
    setPrivacyMode(true);
    expect(await isPrivacyMode()).toBe(true);
  });
});
```

- [ ] **Step 4: Update caller `src/app/resume/page.tsx` L82 area**

Find the useEffect with `isPrivacyMode()`:

```ts
// Old
setPrivacyModeState(isPrivacyMode());

// New
import('server-only').catch(() => {}); // no-op marker; remove if awkward
void isPrivacyMode().then(setPrivacyModeState);
```

Note: `page.tsx` is `'use client'`. The new `isPrivacyMode` is async; calling from a client component is fine because the underlying `fetch('/api/admin/config')` works both server and client. Remove the `import 'server-only'` line in `privacy.ts` if it breaks client bundle — keep `admin-config.ts` server-only but allow `privacy.ts` to be called from both. (Refinement: drop `import 'server-only'` from `privacy.ts` since it's used in client components; `admin-config` retains the marker.)

- [ ] **Step 5: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/privacy.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/resume/privacy.ts src/lib/resume/privacy.test.ts src/app/resume/page.tsx
git commit -m "feat(resume): privacy 3-layer priority (admin > env > localStorage) (T3)"
```

---

## Task T4: `prompts/star.ts` accept `systemOverride`

**Files:**
- Modify: `src/lib/resume/prompts/star.ts`

- [ ] **Step 1: Locate `buildStarRewritePrompt` signature**

```bash
grep -n "buildStarRewritePrompt" src/lib/resume/prompts/star.ts
```

- [ ] **Step 2: Add `systemOverride?: string` to `BuildStarRewritePromptOptions`**

```ts
export interface BuildStarRewritePromptOptions {
  exampleIds?: string[];
  systemOverride?: string;   // NEW: bypass hardcoded system block
}
```

- [ ] **Step 3: In `renderSystem` (or equivalent), branch on `opts.systemOverride`**

Find where the system prompt is built and replace it with:

```ts
function renderSystem(opts: BuildStarRewritePromptOptions): string {
  if (opts.systemOverride) return opts.systemOverride;
  // ... existing hardcoded system block unchanged ...
}
```

- [ ] **Step 4: Update test to assert override branch**

Add to `src/lib/resume/prompts/star.test.ts`:

```ts
it('systemOverride bypasses hardcoded system block', () => {
  const { system } = buildStarRewritePrompt(makeDummyResume(), { systemOverride: 'CUSTOM' });
  expect(system).toBe('CUSTOM');
});
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/prompts/star.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/resume/prompts/star.ts src/lib/resume/prompts/star.test.ts
git commit -m "feat(resume): star prompt accepts systemOverride (T4)"
```

---

## Task T5: `ats.ts` `topK` + `systemOverride`

**Files:**
- Modify: `src/lib/resume/ats.ts`

- [ ] **Step 1: Add params to `extractJdKeywords`**

```ts
export interface ExtractJdKeywordsOptions {
  llmClient?: LLMClient;
  topK?: number;
  systemOverride?: string;   // NEW
}
```

- [ ] **Step 2: Use `opts.topK ?? 20` and pass `systemOverride` to LLM messages**

Find the LLM call inside `extractJdKeywords`; if a hardcoded system prompt exists, replace with `[opts.systemOverride, hardcoded].filter(Boolean).join('\n\n')`. For TF fallback, use `opts.topK`.

- [ ] **Step 3: Update test for override + topK**

Add to `ats.test.ts`:

```ts
it('TF fallback uses opts.topK', async () => {
  const r = extractJdKeywordsTf(longJD, { topK: 5 });
  expect(r.length).toBeLessThanOrEqual(5);
});
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/ats.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/ats.ts src/lib/resume/ats.test.ts
git commit -m "feat(resume): ats extractJdKeywords accepts topK + systemOverride (T5)"
```

---

## Task T6: `matcher.ts` `systemOverride`

**Files:**
- Modify: `src/lib/resume/matcher.ts`

- [ ] **Step 1: Add `systemOverride` to `generatePriorities` options**

- [ ] **Step 2: Pass through to LLM system message**

- [ ] **Step 3: Update `matcher.test.ts` to assert override branch**

- [ ] **Step 4: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/matcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/matcher.ts src/lib/resume/matcher.test.ts
git commit -m "feat(resume): matcher generatePriorities accepts systemOverride (T6)"
```

---

## Task T7: `star-rewriter.ts` `confidenceChars` from config

**Files:**
- Modify: `src/lib/resume/star-rewriter.ts`

- [ ] **Step 1: Locate `CONFIDENCE_CHARS_CEILING` constant**

```bash
grep -n "CONFIDENCE_CHARS_CEILING\|confidence.*2000" src/lib/resume/star-rewriter.ts
```

- [ ] **Step 2: Replace constant with config lookup**

```ts
// Old
const CONFIDENCE_CHARS_CEILING = 2000;
const confidence = Math.min(1, text.length / CONFIDENCE_CHARS_CEILING);

// New
import { getResumeRuntimeConfig } from './admin-config';
// inside the function:
const { confidenceChars } = await getResumeRuntimeConfig();
const confidence = Math.min(1, text.length / confidenceChars);
```

- [ ] **Step 3: Update test to mock `admin-config` and assert custom ceiling**

- [ ] **Step 4: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/star-rewriter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/star-rewriter.ts src/lib/resume/star-rewriter.test.ts
git commit -m "feat(resume): star-rewriter confidence uses runtime config (T7)"
```

---

## Task T8: `iteration.ts` pass-through `systemOverride`

**Files:**
- Modify: `src/lib/resume/iteration.ts`

- [ ] **Step 1: Add `systemOverride?` to `SectionRewriteOptions`**

- [ ] **Step 2: Pass to `buildSectionRewritePrompt`**

- [ ] **Step 3: Update test**

- [ ] **Step 4: Run, expect pass**

```bash
pnpm vitest run src/lib/resume/iteration.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/iteration.ts src/lib/resume/iteration.test.ts
git commit -m "feat(resume): iteration pass-through systemOverride (T8)"
```

---

## Task T9: `POST /api/admin/resume/eval` route

**Files:**
- Create: `src/app/api/admin/resume/eval/route.ts`
- Test: `src/app/api/admin/resume/eval/route.test.ts` (use vitest + mocked fetch)

- [ ] **Step 1: Write failing test (mocked `runEval`)**

```ts
// src/app/api/admin/resume/eval/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/resume/eval-runner', () => ({
  runEval: vi.fn(async () => ({ rows: [{ id: 'fe-01', jdTitle: 'T', coveragePct: 90, passed: true, missingTopK: [] }], avgCoverage: 90 })),
}));
vi.mock('@/lib/admin-auth', () => ({ requireAdmin: vi.fn(async () => true) }));

import { POST } from './route';

describe('POST /api/admin/resume/eval', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns rows + avgCoverage on 200', async () => {
    const req = new Request('http://localhost/api/admin/resume/eval', { method: 'POST' });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; results: unknown[]; avgCoverage: number };
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.avgCoverage).toBe(90);
  });
});
```

- [ ] **Step 2: Implement route**

```ts
// src/app/api/admin/resume/eval/route.ts
import { NextRequest } from 'next/server';
import { runEval } from '@/lib/resume/eval-runner';
import { requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest): Promise<Response> {
  if (!(await requireAdmin())) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const { rows, avgCoverage } = await runEval();
    return new Response(JSON.stringify({ ok: true, results: rows, avgCoverage }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eval failed';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
```

- [ ] **Step 3: Run, expect pass**

```bash
pnpm vitest run src/app/api/admin/resume/eval/route.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/resume/eval/route.ts src/app/api/admin/resume/eval/route.test.ts
git commit -m "feat(admin): POST /api/admin/resume/eval (T9)"
```

---

## Task T10: `resume-tab.tsx` orchestrator + `TabKey` update

**Files:**
- Create: `src/app/admin/_components/resume-tab.tsx` (placeholder 4-card layout)
- Modify: `src/app/admin/_lib/types.ts` (add `'resume'` to `TabKey`)
- Test: `src/app/admin/_components/resume-tab.test.tsx` (smoke renders 4 cards)

- [ ] **Step 1: Update `TabKey`**

```ts
// src/app/admin/_lib/types.ts
export type TabKey = 'dashboard' | 'knowledge' | 'prompt' | 'model' | 'rag' | 'metadata' | 'resume';
```

- [ ] **Step 2: Write smoke test**

```tsx
// src/app/admin/_components/resume-tab.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResumeTab from './resume-tab';

describe('ResumeTab smoke', () => {
  it('renders 4 section headings', () => {
    render(<ResumeTab />);
    expect(screen.getByText('隐私策略')).toBeInTheDocument();
    expect(screen.getByText('提示词')).toBeInTheDocument();
    expect(screen.getByText('ATS 评测集')).toBeInTheDocument();
    expect(screen.getByText('运行时配置')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement orchestrator with placeholder children**

```tsx
// src/app/admin/_components/resume-tab.tsx
'use client';
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { PrivacyCard } from './resume/_PrivacyCard';
import { PromptsCard } from './resume/_PromptsCard';
import { EvalCard } from './resume/_EvalCard';
import { ConfigCard } from './resume/_ConfigCard';

export default function ResumeTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>隐私策略</CardTitle>
          <CardDescription>3 层优先级：admin-override &gt; env &gt; localStorage</CardDescription>
        </CardHeader>
        <CardContent><PrivacyCard /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>提示词</CardTitle>
          <CardDescription>覆盖 STAR / ATS / Match Report 使用的 LLM prompt</CardDescription>
        </CardHeader>
        <CardContent><PromptsCard /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ATS 评测集</CardTitle>
          <CardDescription>服务端跑 12 份 fixture（TF 路径，不调 LLM）</CardDescription>
        </CardHeader>
        <CardContent><EvalCard /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>运行时配置</CardTitle>
          <CardDescription>topK / 置信阈值 / few-shot 例子 / 4 段顺序</CardDescription>
        </CardHeader>
        <CardContent><ConfigCard /></CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run smoke (will fail — placeholder children don't exist yet)**

```bash
pnpm vitest run src/app/admin/_components/resume-tab.test.tsx
```

Expected: fail with "Cannot find module './resume/_PrivacyCard'". This is fine; T11-T14 will fill in the children. Skip the test temporarily OR create 4 stub components in this task that just render `<div data-testid="stub">`. **Recommendation: create stubs so the test goes green now.**

- [ ] **Step 5: Create 4 stub card components**

For each of `PrivacyCard`, `PromptsCard`, `EvalCard`, `ConfigCard`, write a stub:

```tsx
// src/app/admin/_components/resume/_PrivacyCard.tsx
'use client';
import React from 'react';
export function PrivacyCard() { return <div data-testid="privacy-card">PrivacyCard TODO</div>; }
```

(Repeat for the other 3, each with its own `data-testid`.)

- [ ] **Step 6: Run, expect pass**

```bash
pnpm vitest run src/app/admin/_components/resume-tab.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/_components/resume-tab.tsx src/app/admin/_components/resume-tab.test.tsx src/app/admin/_components/resume/_PrivacyCard.tsx src/app/admin/_components/resume/_PromptsCard.tsx src/app/admin/_components/resume/_EvalCard.tsx src/app/admin/_components/resume/_ConfigCard.tsx src/app/admin/_lib/types.ts
git commit -m "feat(admin): resume tab orchestrator + 4 stub cards (T10)"
```

---

## Task T11: `PrivacyCard` full implementation (TDD)

**Files:**
- Modify: `src/app/admin/_components/resume/_PrivacyCard.tsx`
- Test: `src/app/admin/_components/resume/_PrivacyCard.test.tsx`

- [ ] **Step 1: Write test (mock `/api/admin/config`)**

```tsx
// src/app/admin/_components/resume/_PrivacyCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrivacyCard } from './_PrivacyCard';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
global.fetch = vi.fn();

describe('PrivacyCard', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('shows current effective source badge', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ forcedLocal: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<PrivacyCard />);
    await waitFor(() => expect(screen.getByText(/admin-override/)).toBeInTheDocument());
  });

  it('Save button POSTs to /api/admin/config with key=resume.privacy', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    render(<PrivacyCard />);
    const btn = await screen.findByRole('button', { name: /保存/ });
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      const post = calls.find(c => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.key).toBe('resume.privacy');
    });
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/app/admin/_components/resume/_PrivacyCard.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type Source = 'admin-override' | 'env' | 'localStorage' | 'cloud-ok';
const CONFIG = '/api/admin/config';

export function PrivacyCard() {
  const [forced, setForced] = useState(false);
  const [source, setSource] = useState<Source>('cloud-ok');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [priv, envFlag] = await Promise.all([
        fetch(`${CONFIG}?key=resume.privacy`).then(r => r.ok ? r.json() : { forcedLocal: false }).catch(() => ({ forcedLocal: false })),
        Promise.resolve(process.env.NEXT_PUBLIC_PRIVACY_MODE === 'local-only'),
      ]);
      const ls = typeof localStorage !== 'undefined' && localStorage.getItem('reup:privacy-mode') === 'local-only';
      setForced(priv.forcedLocal === true);
      if (priv.forcedLocal === true) setSource('admin-override');
      else if (envFlag) setSource('env');
      else if (ls) setSource('localStorage');
      else setSource('cloud-ok');
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(CONFIG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'resume.privacy', value: { forcedLocal: forced } }),
      });
      setSource(forced ? 'admin-override' : 'cloud-ok');
      toast.success('隐私策略已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <div className="text-xs text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={source === 'admin-override' ? 'default' : 'secondary'}>当前生效：{source}</Badge>
      </div>
      <div className="flex items-center justify-between rounded border px-3 py-2">
        <div>
          <div className="text-sm font-medium">强制全局本地模式</div>
          <div className="text-xs text-muted-foreground">开启后所有用户的简历不上传服务端，在浏览器内完成解析/导出。</div>
        </div>
        <Switch checked={forced} onCheckedChange={setForced} />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run, expect pass**

```bash
pnpm vitest run src/app/admin/_components/resume/_PrivacyCard.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/_components/resume/_PrivacyCard.tsx src/app/admin/_components/resume/_PrivacyCard.test.tsx
git commit -m "feat(admin): PrivacyCard full implementation (T11)"
```

---

## Task T12: `PromptsCard` (4 textareas + debounce autosave)

**Files:**
- Modify: `src/app/admin/_components/resume/_PromptsCard.tsx`
- Test: `src/app/admin/_components/resume/_PromptsCard.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/app/admin/_components/resume/_PromptsCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptsCard } from './_PromptsCard';

global.fetch = vi.fn();

describe('PromptsCard', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('renders 4 textareas (star, few-shot, ats, match)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    render(<PromptsCard />);
    expect(await screen.findAllByRole('textbox')).toHaveLength(4);
  });

  it('autosave POSTs to resume.starPrompt after 300ms', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    render(<PromptsCard />);
    const ta = (await screen.findAllByRole('textbox'))[0] as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'NEW STAR PROMPT' } });
    await waitFor(() => {
      const post = vi.mocked(fetch).mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.key).toBe('resume.starPrompt');
      expect(body.value.customPrompt).toBe('NEW STAR PROMPT');
    }, { timeout: 1000 });
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/app/admin/_components/resume/_PromptsCard.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { toast } from 'sonner';

const CONFIG = '/api/admin/config';
type Kind = 'star' | 'starFewShot' | 'ats' | 'match';
const KIND_TO_KEY: Record<Kind, string> = {
  star: 'resume.starPrompt',
  starFewShot: 'resume.starFewShot',
  ats: 'resume.atsPrompt',
  match: 'resume.matchPrompt',
};
const KIND_TO_LABEL: Record<Kind, string> = {
  star: 'STAR System Prompt',
  starFewShot: 'Few-shot 例子 (JSON)',
  ats: 'ATS 关键词抽取 Prompt',
  match: 'Match Report 优先级 Prompt',
};

const KINDS: Kind[] = ['star', 'starFewShot', 'ats', 'match'];

function estimateTokens(s: string): number { return Math.ceil(s.length / 2); }

export function PromptsCard() {
  const [values, setValues] = useState<Record<Kind, string>>({ star: '', starFewShot: '', ats: '', match: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const next: Record<Kind, string> = { star: '', starFewShot: '', ats: '', match: '' };
      for (const k of KINDS) {
        try {
          const res = await fetch(`${CONFIG}?key=${KIND_TO_KEY[k]}`);
          if (res.ok) {
            const data = await res.json() as { customPrompt?: string };
            if (data.customPrompt) next[k] = data.customPrompt;
          }
        } catch { /* ignore */ }
      }
      setValues(next);
      setLoaded(true);
    })();
  }, []);

  const persist = useDebouncedCallback((kind: Kind, value: string) => {
    void fetch(CONFIG, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KIND_TO_KEY[kind], value: { customPrompt: value } }),
    }).then(() => toast.success(`${KIND_TO_LABEL[kind]} 已保存`));
  }, 300);

  const reset = (kind: Kind) => {
    if (!confirm(`确定恢复 ${KIND_TO_LABEL[kind]} 的默认？`)) return;
    setValues(prev => ({ ...prev, [kind]: '' }));
    persist(kind, '');
  };

  if (!loaded) return <div className="text-xs text-muted-foreground">加载中…</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {KINDS.map(kind => (
        <div key={kind} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{KIND_TO_LABEL[kind]}</Label>
            <Badge variant="outline" className="text-[10px]">{estimateTokens(values[kind])} tokens</Badge>
          </div>
          <Textarea
            rows={8}
            value={values[kind]}
            onChange={e => {
              const v = e.target.value;
              setValues(prev => ({ ...prev, [kind]: v }));
              persist(kind, v);
            }}
            placeholder={kind === 'starFewShot' ? '[]' : '留空使用内置默认 prompt'}
          />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => reset(kind)}>恢复默认</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run, expect pass**

```bash
pnpm vitest run src/app/admin/_components/resume/_PromptsCard.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/_components/resume/_PromptsCard.tsx src/app/admin/_components/resume/_PromptsCard.test.tsx
git commit -m "feat(admin): PromptsCard 4-textarea with debounced autosave (T12)"
```

---

## Task T13: `EvalCard` (button + table)

**Files:**
- Modify: `src/app/admin/_components/resume/_EvalCard.tsx`
- Test: `src/app/admin/_components/resume/_EvalCard.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/app/admin/_components/resume/_EvalCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvalCard } from './_EvalCard';

global.fetch = vi.fn();

describe('EvalCard', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('renders initial empty state', () => {
    render(<EvalCard />);
    expect(screen.getByText(/点击上方按钮开始跑分/)).toBeInTheDocument();
  });

  it('clicking button fetches and renders 12 rows', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      results: Array.from({ length: 12 }, (_, i) => ({ id: `fe-${i}`, jdTitle: `T${i}`, coveragePct: 90 + i, passed: true, missingTopK: [] })),
      avgCoverage: 95,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<EvalCard />);
    fireEvent.click(screen.getByRole('button', { name: /跑 12 份评测集/ }));
    await waitFor(() => expect(screen.getByText(/95/)).toBeInTheDocument());
    expect(screen.getAllByRole('row')).toHaveLength(13); // 12 + header
  });

  it('shows error message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    render(<EvalCard />);
    fireEvent.click(screen.getByRole('button', { name: /跑 12 份评测集/ }));
    await waitFor(() => expect(screen.getByText(/失败|错误|重试/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/app/admin/_components/resume/_EvalCard.tsx
'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface Row { id: string; jdTitle: string; coveragePct: number; passed: boolean; missingTopK: string[]; }

export function EvalCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/admin/resume/eval', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ok: boolean; results: Row[]; avgCoverage: number };
      setRows(data.results);
      setAvg(data.avgCoverage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '跑分失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button onClick={run} disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 跑分中…</> : '跑 12 份评测集'}
        </Button>
        {avg !== null && (
          <Badge variant={avg >= 85 ? 'default' : 'destructive'}>平均覆盖率 {avg.toFixed(1)}%{avg >= 85 ? ' ✓' : ' ✗'}</Badge>
        )}
      </div>
      {err && <div className="text-sm text-destructive">跑分失败：{err} <Button variant="link" size="sm" onClick={run}>重试</Button></div>}
      {rows === null && !err && <div className="text-xs text-muted-foreground">点击上方按钮开始跑分</div>}
      {rows && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>JD 标题</TableHead>
              <TableHead>覆盖率</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>Top-3 缺失</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell>{r.jdTitle}</TableCell>
                <TableCell>{r.coveragePct.toFixed(1)}%</TableCell>
                <TableCell>{r.passed ? <Badge>pass</Badge> : <Badge variant="destructive">fail</Badge>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.missingTopK.join(', ') || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run, expect pass**

```bash
pnpm vitest run src/app/admin/_components/resume/_EvalCard.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/_components/resume/_EvalCard.tsx src/app/admin/_components/resume/_EvalCard.test.tsx
git commit -m "feat(admin): EvalCard run + table (T13)"
```

---

## Task T14: `ConfigCard` (4 form fields + save)

**Files:**
- Modify: `src/app/admin/_components/resume/_ConfigCard.tsx`
- Test: `src/app/admin/_components/resume/_ConfigCard.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/app/admin/_components/resume/_ConfigCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigCard } from './_ConfigCard';

global.fetch = vi.fn();

describe('ConfigCard', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('renders 4 inputs with defaults', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    render(<ConfigCard />);
    const topK = await screen.findByLabelText(/topK/);
    expect((topK as HTMLInputElement).value).toBe('20');
  });

  it('Save button POSTs full payload to resume.config', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    render(<ConfigCard />);
    const btn = await screen.findByRole('button', { name: /保存/ });
    fireEvent.click(btn);
    await waitFor(() => {
      const post = vi.mocked(fetch).mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.key).toBe('resume.config');
      expect(body.value.topK).toBe(20);
      expect(body.value.confidenceChars).toBe(2000);
    });
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/app/admin/_components/resume/_ConfigCard.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { STAR_SECTIONS, type StarSection } from '@/lib/resume/star-rewriter';

const CONFIG = '/api/admin/config';
const DEFAULTS = { topK: 20, confidenceChars: 2000, fewShotIds: ['example-1'], sectionOrder: [...STAR_SECTIONS] as StarSection[] };
const EXAMPLE_IDS = ['example-1', 'example-2']; // 来自 examples/*.json 静态列表

export function ConfigCard() {
  const [topK, setTopK] = useState(DEFAULTS.topK);
  const [confidenceChars, setConfidence] = useState(DEFAULTS.confidenceChars);
  const [fewShotIds, setFewShot] = useState<string[]>(DEFAULTS.fewShotIds);
  const [sectionOrder, setOrder] = useState<StarSection[]>(DEFAULTS.sectionOrder);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${CONFIG}?key=resume.config`);
        if (res.ok) {
          const data = await res.json() as { topK?: number; confidenceChars?: number; fewShotIds?: string[]; sectionOrder?: StarSection[] };
          if (data.topK) setTopK(data.topK);
          if (data.confidenceChars) setConfidence(data.confidenceChars);
          if (data.fewShotIds) setFewShot(data.fewShotIds);
          if (data.sectionOrder) setOrder(data.sectionOrder);
        }
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(CONFIG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'resume.config', value: { topK, confidenceChars, fewShotIds, sectionOrder } }),
      });
      toast.success('配置已保存');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const reset = () => {
    if (!confirm('恢复默认？')) return;
    setTopK(DEFAULTS.topK);
    setConfidence(DEFAULTS.confidenceChars);
    setFewShot(DEFAULTS.fewShotIds);
    setOrder(DEFAULTS.sectionOrder);
  };

  if (!loaded) return <div className="text-xs text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cfg-topk">ATS topK</Label>
          <Input id="cfg-topk" type="number" min={5} max={50} value={topK} onChange={e => setTopK(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="cfg-conf">置信阈值（字符）</Label>
          <Input id="cfg-conf" type="number" min={500} max={10000} value={confidenceChars} onChange={e => setConfidence(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <Label>Few-shot 例子 ID</Label>
        <div className="flex gap-3 mt-1">
          {EXAMPLE_IDS.map(id => (
            <label key={id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={fewShotIds.includes(id)}
                onChange={e => setFewShot(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id))}
              />
              {id}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label>4 段顺序</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {sectionOrder.map((sec, idx) => (
            <div key={sec} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
              <Select
                value={sec}
                onValueChange={v => {
                  const next = [...sectionOrder];
                  next[idx] = v as StarSection;
                  setOrder(next);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAR_SECTIONS.filter(s => !sectionOrder.includes(s) || s === sec).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={reset}>恢复默认</Button>
        <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run, expect pass**

```bash
pnpm vitest run src/app/admin/_components/resume/_ConfigCard.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/_components/resume/_ConfigCard.tsx src/app/admin/_components/resume/_ConfigCard.test.tsx
git commit -m "feat(admin): ConfigCard 4-field form (T14)"
```

---

## Task T15: Wire resume tab into admin shell

**Files:**
- Modify: `src/app/admin/page.tsx` (add tab + TabsContent)
- Modify: `src/app/admin/_lib/constants.ts` (add icon import if needed)

- [ ] **Step 1: Add icon import + TAB_CONFIG entry**

In `src/app/admin/page.tsx`, find the icon imports from `lucide-react` and add `FileText`. Then add to `TAB_CONFIG`:

```ts
{ key: 'resume', label: '简历', icon: FileText },
```

- [ ] **Step 2: Add TabsContent**

```tsx
import ResumeTab from './_components/resume-tab';
// ...
<TabsContent value="resume"><ResumeTab /></TabsContent>
```

- [ ] **Step 3: Manual smoke**

```bash
pnpm run dev
```

Open `http://localhost:8080/admin`, log in, click "简历" tab, verify 4 cards render.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): wire 简历 tab into admin shell (T15)"
```

---

## Task T16: Refactor `ats.benchmark.test.ts` to use `runEval`

**Files:**
- Modify: `src/lib/resume/ats.benchmark.test.ts`

- [ ] **Step 1: Read current implementation**

```bash
cat src/lib/resume/ats.benchmark.test.ts
```

- [ ] **Step 2: Replace inline logic with `runEval` + `loadFixtures` calls**

Keep the same 3 assertions (coverage.percentage >= expectedMinCoverage; >=50% top keywords; avg >= 85%) but pull data from `runEval({ topK: 20 })` and `loadFixtures()`. Goal: from ~127 lines to ~50 lines, no behavior change.

- [ ] **Step 3: Run, expect pass (same 12/12)**

```bash
pnpm vitest run src/lib/resume/ats.benchmark.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/resume/ats.benchmark.test.ts
git commit -m "refactor(resume): benchmark test reuses runEval (T16)"
```

---

## Task T17: Full verify

- [ ] **Step 1: Type check**

```bash
pnpm ts-check
```

Expected: 0 errors

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: 0 new warnings

- [ ] **Step 3: Tests (full)**

```bash
pnpm test
```

Expected: all green, including 12/12 ATS eval

- [ ] **Step 4: ATS benchmark**

```bash
pnpm benchmark:ats
```

Expected: 12/12 fixtures pass, avg ≥ 85%

- [ ] **Step 5: Build smoke**

```bash
pnpm run build
```

Expected: 0 errors

- [ ] **Step 6: Commit any leftover (if formatting fixes needed)**

```bash
git add -u
git commit -m "chore: post-verify formatting"
```

---

## Self-Review Notes

- **Spec coverage**: §3.1 (top tab) → T15 · §3.2 (6 config keys) → T1+T11+T12+T14 · §3.3 (admin-config) → T1 · §3.4 (privacy 3-layer) → T3 · §3.5 (runtime inject) → T4-T8 · §3.6 (eval API) → T2+T9 · §3.7 (4 cards UI) → T11-T14 · §3.8 (file list) → all tasks. ✓
- **Placeholders**: none
- **Type consistency**: `ResumeRuntimeConfig`, `EvalRow`, `EvalFixture`, `StarSection` defined in T1/T2 and reused exactly in T7/T9/T13/T14.
- **Parallel safety**: T11-T14 all import from T1's exports; T9 mocks T2's exports; T10 only references `TabKey` from T10 step 1.
