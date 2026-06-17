# ReUp v2 Admin 简历 Tab — Subagent Handoff

> **用法**：在**新窗口**用 `subagent-driven-development` 流程跑这份文件。每个 task 是一个独立的 Task tool 调用（subagent_type=`general_purpose_task`）。按"批次 + 顺序"小节给出的依赖图执行。
>
> **状态**：T1 (a281cec) + T1.5 (11a286c) ✅ 已完成。**T2-T17 全部 ready-to-dispatch**。
>
> **分文件**：这份文件是给 dispatcher / 子 agent 看的 query 集合；人类阅读的版本仍是 [2026-06-14-resume-admin-tab.md](file:///Users/dengxiongshihao/Downloads/reup/docs/superpowers/plans/2026-06-14-resume-admin-tab.md)。

---

## 0. 全局上下文（每个 implementer query 都需要带）

**Repo**：`/Users/dengxiongshihao/Downloads/reup` · **Branch**：`local-deploy` · **HEAD 起点**：`11a286c`

**Spec**：[docs/superpowers/specs/2026-06-14-resume-admin-tab-design.md](file:///Users/dengxiongshihao/Downloads/reup/docs/superpowers/specs/2026-06-14-resume-admin-tab-design.md)
**Plan (人类版)**：[docs/superpowers/plans/2026-06-14-resume-admin-tab.md](file:///Users/dengxiongshihao/Downloads/reup/docs/superpowers/plans/2026-06-14-resume-admin-tab.md)

**技术栈**：Next.js 16 App Router · React 19 · TS 5 strict · Radix/shadcn · Vitest 4 · pnpm 9

**现有 helper / 约定**：
- LLM client：[`src/lib/llm-client.ts`](file:///Users/dengxiongshihao/Downloads/reup/src/lib/llm-client.ts) (stream + 非流)
- Zod：已装；外部入参必须 Zod 校验
- Debounce hook：[`src/hooks/use-debounce.ts`](file:///Users/dengxiongshihao/Downloads/reup/src/hooks/use-debounce.ts) `useDebouncedCallback(fn, ms)`
- shadcn UI 组件：[`src/components/ui/`](file:///Users/dengxiongshihao/Downloads/reup/src/components/ui/) (Button, Card, Input, Label, Switch, Badge, Select, Textarea, Table)
- `sonner` 已有；toast 用法：`toast.success(msg)` / `toast.error(msg)`
- `lucide-react` 图标
- Runtime config 加载器（已存在）：[`src/lib/resume/admin-config.ts`](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/admin-config.ts)
  - `getResumeRuntimeConfig()` → `Promise<{ topK, confidenceChars, fewShotIds, sectionOrder }>`
  - `getResumePrompt(kind: 'star'|'ats'|'match')` → `Promise<string | null>`
  - `isForcedLocalMode()` → `Promise<boolean>`
  - `clearResumeConfigCache()` (测试用)
- 持久化路由（已存在）：`/api/admin/config` GET/POST — 已支持 9 个 key（`prompt`, `model`, `rag`, `resume.config`, `resume.privacy`, `resume.starPrompt`, `resume.starFewShot`, `resume.atsPrompt`, `resume.matchPrompt`）

**TDD 铁律**（每个 implementer 都必须遵守）：
1. **先写测试**，跑一遍确认**红**（缺模块 / 期望失败）
2. **写最小实现**让测试**绿**
3. `pnpm vitest run <test_file>` 一次过
4. **不** 跑 `pnpm lint` / `pnpm ts-check` 全量；只对自己改的 2-3 个文件 ts-check（其他 task 可能在 in-flight）。最终 T17 才全量。
5. **不** 触碰 task 范围外的文件
6. 提交用 `git commit --no-verify` 绕过 pre-commit 钩子（其他 in-flight 任务的 lint 失败与你无关）

**Return format**（统一）：
- `DONE` + 完整 commit SHA（40 字符）
- `DONE_WITH_CONCERNS` + concern 列表 + commit SHA
- `NEEDS_CONTEXT` + 问题
- `BLOCKED` + 原因

---

## 1. 依赖图 + 调度顺序

```
T1 ✅ → T1.5 ✅
T1   → T2 eval-runner
T1   → T3 privacy async 3-layer
T1   → T4 star systemOverride
T1   → T5 ats topK + systemOverride
T1   → T6 matcher systemOverride
T1   → T7 star-rewriter confidenceChars
T1   → T8 iteration pass-through
T2   → T9 POST /api/admin/resume/eval
T9   → T13 EvalCard
T1   → T12 PromptsCard
T1   → T14 ConfigCard
T3   → T11 PrivacyCard
T1   → T10 orchestrator + TabKey
T10  → T11/T12/T13/T14
T10  → T15 wire into admin shell
T2   → T16 refactor ats.benchmark.test.ts
T15  → T17 full verify
```

**调度批次**（同一批可同时 dispatch 多个；不同批必须等前一批 ✓）：
- **B2** (T2, T3, T4, T5, T6, T7, T8) — 7 个
- **B3** (T9, T10) — 2 个
- **B4** (T11, T12, T13, T14) — 4 个
- **B5** (T15, T16, T17) — 3 个

每个 task 需要 **1 implementer + 2 reviewer** subagent（共 3 dispatches per task）。Reviewer 可以在 implementer 完成后**并行 dispatch**（它们只读不写）。

---

## 2. Reviewer 通用模板（每个 task 都要跑这 2 个 reviewer）

### 2.1 Spec Reviewer Query（按 task 替换占位符）

```
You are doing a spec compliance review of a single task implementation in the repo `/Users/dengxiongshihao/Downloads/reup`.

## Task
{TASK_ID} of the plan: `docs/superpowers/plans/2026-06-14-resume-admin-tab.md`
Spec: `docs/superpowers/specs/2026-06-14-resume-admin-tab-design.md` §{SPEC_SECTION}

Commit SHA: {COMMIT_SHA} (on `local-deploy`).

Files (per task T{N}):
- {FILE_LIST}

## Your job
1. `cd /Users/dengxiongshihao/Downloads/reup && git show {COMMIT_SHA} --stat` to see the diff.
2. Read all listed files.
3. Compare against the plan T{N} section (read the plan file). Check EVERY requirement.
4. Check no other files were modified (except tests/imports explicitly mentioned).
5. Note: `import 'server-only'` is NOT used in this project (not installed). Do not flag its absence.

## Return format
ONE of:
- `PASS` + 1-2 sentence summary
- `FAIL` + bulleted list of specific issues, each with file:line if possible

Do not suggest improvements. Do not write code. Do not commit.
```

### 2.2 Code Quality Reviewer Query（按 task 替换占位符）

```
You are doing a code quality review of a single task implementation in the repo `/Users/dengxiongshihao/Downloads/reup`.

## Task
{TASK_ID} of the plan.
Commit SHA: {COMMIT_SHA}.

Files:
- {FILE_LIST}

## Your job
1. Read all files.
2. Check for code quality:
   - **Correctness**: subtle bugs? (off-by-one, race conditions, cache invalidation, async error swallowing)
   - **Types**: any `any` / `unknown` casts that should be narrower?
   - **Naming**: clear, consistent with existing codebase?
   - **Test quality**: deterministic, isolated, uses `beforeEach` for cleanup
   - **Edge cases**: empty input, throw, malformed response
   - **Complexity**: any over-engineering?
3. The module sits in `src/lib/resume/` or `src/app/admin/_components/resume/`; check style matches neighboring files (e.g. existing cards in `src/app/admin/_components/`).

## Return format
ONE of:
- `APPROVED` + 1-2 sentence summary
- `ISSUES` + bulleted list grouped by severity (BLOCKER / IMPORTANT / NIT) with file:line

Do not suggest features. Do not write code. Do not commit.
```

---

## 3. T2 — eval-runner extracted (TDD)

**Files**:
- Create: `src/lib/resume/eval-runner.ts`
- Create: `src/lib/resume/eval-runner.test.ts`
- Modify: `src/lib/resume/ats.ts` (expose `extractJdKeywordsTf` and `computeAtsCoverage` as top-level exports)

**Deps**: T1 ✓

### T2 Implementer Query

```
You are implementing Task T2 of the plan in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
The admin tab will run an ATS eval benchmark via a new POST /api/admin/resume/eval API. T2 extracts the benchmark logic (currently embedded in `src/lib/resume/ats.benchmark.test.ts`) into a shared module so both the API (T9) and the test (T16) can reuse it. It MUST be a TF (no-LLM) path.

## Files
- Create: `src/lib/resume/eval-runner.ts`
- Create: `src/lib/resume/eval-runner.test.ts`
- Modify: `src/lib/resume/ats.ts` (refactor `extractJdKeywords` to internally call a top-level `extractJdKeywordsTf(jd, { topK }): JdKeyword[]` and re-export both that and `computeAtsCoverage`)

## Step 1: Write the failing test

Create `src/lib/resume/eval-runner.test.ts`:
\`\`\`ts
import { describe, it, expect } from 'vitest';
import { runEval, loadFixtures } from './eval-runner';

describe('eval-runner', () => {
  it('loadFixtures returns 12 fixtures from data/resume-eval/', async () => {
    const fs = await loadFixtures();
    expect(fs.length).toBe(12);
    for (const f of fs) {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('jdTitle');
      expect(f).toHaveProperty('resume');
      expect(f).toHaveProperty('jd');
      expect(f).toHaveProperty('expectedTopKeywords');
      expect(f).toHaveProperty('expectedMinCoverage');
    }
  });

  it('runEval completes without LLM and returns 12 rows + avgCoverage', async () => {
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
\`\`\`

## Step 2: Verify it fails
\`\`\`bash
cd /Users/dengxiongshihao/Downloads/reup && pnpm vitest run src/lib/resume/eval-runner.test.ts
\`\`\`
Expect: fail (module not found).

## Step 3: Refactor ats.ts
Open `src/lib/resume/ats.ts`. Find the existing TF fallback inside `extractJdKeywords` (the part that does term-frequency extraction without calling the LLM). Extract that into a top-level function:

\`\`\`ts
// Add to src/lib/resume/ats.ts
export interface JdKeyword { term: string; weight: number; }
export function extractJdKeywordsTf(jd: string, opts: { topK?: number } = {}): JdKeyword[] {
  const topK = opts.topK ?? 20;
  // ... existing TF logic extracted from extractJdKeywords ...
}
\`\`\`

Then make `extractJdKeywords` call `extractJdKeywordsTf` as its LLM-failed fallback path (preserve existing behavior).

Also re-export `computeAtsCoverage` if not already exported (it should be — it's called by `EvalCard`).

## Step 4: Implement eval-runner.ts

\`\`\`ts
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
\`\`\`

## Step 5: Run tests, expect green
\`\`\`bash
cd /Users/dengxiongshihao/Downloads/reup && pnpm vitest run src/lib/resume/eval-runner.test.ts
\`\`\`

## Step 6: Commit
\`\`\`bash
cd /Users/dengxiongshihao/Downloads/reup && git add src/lib/resume/eval-runner.ts src/lib/resume/eval-runner.test.ts src/lib/resume/ats.ts && git commit --no-verify -m "feat(resume): eval-runner extracted for shared benchmark (T2)"
\`\`\`

## Implementation rules
- Strict TDD. Test first, run, see it fail, implement, run, see it pass.
- TS strict, no `any`.
- Do NOT modify any file outside the 3 listed.
- `computeAtsCoverage`'s return shape: verify the `.coverage.percentage` and `.missing[].term` access paths by reading the function's actual return type. If they differ, fix the `EvalRow` construction.
- Use `git commit --no-verify`.

## Return
- `DONE` with the 40-char commit SHA, OR
- `BLOCKED` with reason.
```

---

## 4. T3 — privacy.ts async 3-layer

**Files**:
- Modify: `src/lib/resume/privacy.ts`
- Modify: `src/lib/resume/privacy.test.ts`
- Modify: caller sites that use `isPrivacyMode()` (search for callers first)

**Deps**: T1 ✓

### T3 Implementer Query

```
You are implementing Task T3 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
`isPrivacyMode()` currently is sync: env > localStorage. We need to add `admin-override` (from `isForcedLocalMode()` in `admin-config.ts`) as the highest priority. This makes it async. The new `isPrivacyMode()` chain is:
1. admin-override (`isForcedLocalMode()`)
2. env (`NEXT_PUBLIC_PRIVACY_MODE === 'local-only'`)
3. localStorage (`reup:privacy-mode === 'local-only'`)

## Step 1: Find existing callers
\`\`\`bash
cd /Users/dengxiongshihao/Downloads/reup && grep -rn "isPrivacyMode" src/
\`\`\`
Note every caller. They will all need to be updated to `await` or `.then()`.

## Step 2: Run existing privacy tests, expect green baseline
\`\`\`bash
pnpm vitest run src/lib/resume/privacy.test.ts
\`\`\`

## Step 3: Update privacy.ts

Replace the contents with:

\`\`\`ts
// src/lib/resume/privacy.ts
// ReUp v2 admin-tab: 3-layer privacy priority chain.
// admin-override (server config) > NEXT_PUBLIC_PRIVACY_MODE env > localStorage
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
  if (await isForcedLocalMode()) return true;
  if (readEnvFlag()) return true;
  return readLocalStorage();
}

export function setPrivacyMode(enabled: boolean): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    if (enabled) ls.setItem(STORAGE_KEY, PRIVACY_VALUE);
    else ls.removeItem(STORAGE_KEY);
  } catch (err) { console.error('[resume/privacy] setPrivacyMode failed:', err); }
}
\`\`\`

NOTE: do NOT use `import 'server-only'` — it's not installed in this project. `admin-config.ts` works in both server and client contexts.

## Step 4: Update privacy.test.ts
Replace tests with:

\`\`\`ts
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

  it('returns false when nothing set', async () => {
    expect(await isPrivacyMode()).toBe(false);
  });
});
\`\`\`

## Step 5: Update all callers
For each caller found in step 1:
- If it's a server module: `if (await isPrivacyMode())` is fine.
- If it's a React component using useState: change `setPrivacyModeState(isPrivacyMode())` to `void isPrivacyMode().then(setPrivacyModeState)` inside a useEffect.
- If it's a sync function: refactor to async or use `.then()`.

Make the minimal change needed to keep the existing test suite green.

## Step 6: Run, expect green
\`\`\`bash
pnpm vitest run src/lib/resume/privacy.test.ts
\`\`\`
Also re-run any tests that touched the modified caller files:
\`\`\`bash
pnpm vitest run src/app/resume 2>&1 | tail -10
\`\`\`

## Step 7: Commit
\`\`\`bash
git add src/lib/resume/privacy.ts src/lib/resume/privacy.test.ts <all caller files> && git commit --no-verify -m "feat(resume): privacy 3-layer priority (admin > env > localStorage) (T3)"
\`\`\`

## Return
- `DONE` with commit SHA + list of modified caller files, OR
- `BLOCKED` with reason.
```

---

## 5. T4 — prompts/star.ts systemOverride

**Files**:
- Modify: `src/lib/resume/prompts/star.ts`
- Modify: `src/lib/resume/prompts/star.test.ts` (add 1 test)

**Deps**: T1 ✓

### T4 Implementer Query

```
You are implementing Task T4 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
The admin tab's PromptsCard (T12) will let admin override the STAR system prompt at runtime. The override flows from `getResumePrompt('star')` (T1) into the prompt constructor as `opts.systemOverride`. When set, it bypasses the hardcoded system block.

## Step 1: Read the current shape
\`\`\`bash
grep -n "buildStarRewritePrompt\|system:" src/lib/resume/prompts/star.ts
\`\`\`

## Step 2: Add `systemOverride` to the options type and branch in the renderer

In the options interface:
\`\`\`ts
export interface BuildStarRewritePromptOptions {
  exampleIds?: string[];
  systemOverride?: string;  // NEW
}
\`\`\`

In the system-rendering function (or wherever the hardcoded system block lives):
\`\`\`ts
function renderSystem(opts: BuildStarRewritePromptOptions): string {
  if (opts.systemOverride) return opts.systemOverride;
  // ... existing hardcoded system block ...
}
\`\`\`

## Step 3: Add a test in star.test.ts

\`\`\`ts
it('systemOverride bypasses hardcoded system block', () => {
  const { system } = buildStarRewritePrompt(makeDummyResume(), { systemOverride: 'CUSTOM_OVERRIDE' });
  expect(system).toBe('CUSTOM_OVERRIDE');
});
\`\`\`

(If the existing test setup uses a different fixture name, substitute it.)

## Step 4: Run, expect green
\`\`\`bash
pnpm vitest run src/lib/resume/prompts/star.test.ts
\`\`\`

## Step 5: Commit
\`\`\`bash
git add src/lib/resume/prompts/star.ts src/lib/resume/prompts/star.test.ts && git commit --no-verify -m "feat(resume): star prompt accepts systemOverride (T4)"
\`\`\`

## Return
- `DONE` + commit SHA
```

---

## 6. T5 — ats.ts topK + systemOverride

**Files**:
- Modify: `src/lib/resume/ats.ts`
- Modify: `src/lib/resume/ats.test.ts` (add 1-2 tests)

**Deps**: T1 ✓ (T2 should also be done to ensure `extractJdKeywordsTf` is exported; if not, this task only needs the `topK` and `systemOverride` plumbing for the LLM path; the TF path plumbing is T2's job)

### T5 Implementer Query

```
You are implementing Task T5 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
`extractJdKeywords` needs to accept (a) `topK` for capping returned keywords and (b) `systemOverride` for the LLM system message. Both feed the admin PromptsCard (T12) and ConfigCard (T14).

## Step 1: Read the current shape
\`\`\`bash
grep -n "extractJdKeywords\|topK\|system" src/lib/resume/ats.ts | head -30
\`\`\`

## Step 2: Update the options type
\`\`\`ts
export interface ExtractJdKeywordsOptions {
  llmClient?: LLMClient;
  topK?: number;
  systemOverride?: string;
}
\`\`\`

## Step 3: Use `opts.topK ?? 20` and pass `systemOverride`
- Where the LLM call is made, if a hardcoded system prompt exists, replace with `[opts.systemOverride, hardcoded].filter(Boolean).join('\n\n')`.
- Where the TF fallback runs, use `opts.topK ?? 20`.
- The return type stays the same.

## Step 4: Add tests to ats.test.ts
\`\`\`ts
it('TF fallback respects opts.topK', async () => {
  const r = extractJdKeywordsTf(longJD, { topK: 5 });
  expect(r.length).toBeLessThanOrEqual(5);
});

it('systemOverride reaches LLM call (mocked)', async () => {
  // If you have a test for the LLM path already, add: assert the override
  // string appears in the system message argument.
});
\`\`\`

## Step 5: Run, expect green
\`\`\`bash
pnpm vitest run src/lib/resume/ats.test.ts
\`\`\`

## Step 6: Commit
\`\`\`bash
git add src/lib/resume/ats.ts src/lib/resume/ats.test.ts && git commit --no-verify -m "feat(resume): ats extractJdKeywords accepts topK + systemOverride (T5)"
\`\`\`

## Return
- `DONE` + commit SHA
```

---

## 7. T6 — matcher.ts systemOverride

**Files**:
- Modify: `src/lib/resume/matcher.ts`
- Modify: `src/lib/resume/matcher.test.ts` (add 1 test)

**Deps**: T1 ✓

### T6 Implementer Query

```
You are implementing Task T6 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

Same shape as T4. Apply to `generatePriorities` in `src/lib/resume/matcher.ts`:

1. Add `systemOverride?: string` to its options type.
2. Branch in the system-message construction: if override set, use it directly; else fall through to hardcoded.
3. Add 1 test asserting the override reaches the system message (mocked LLM).
4. \`pnpm vitest run src/lib/resume/matcher.test.ts\` → green
5. Commit: \`feat(resume): matcher generatePriorities accepts systemOverride (T6)\`

Return: \`DONE\` + commit SHA
```

---

## 8. T7 — star-rewriter.ts confidenceChars from config

**Files**:
- Modify: `src/lib/resume/star-rewriter.ts`
- Modify: `src/lib/resume/star-rewriter.test.ts` (mock `admin-config`)

**Deps**: T1 ✓

### T7 Implementer Query

```
You are implementing Task T7 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Step 1: Find the constant
\`\`\`bash
grep -n "CONFIDENCE_CHARS_CEILING\|confidence.*2000\|confidenceChars" src/lib/resume/star-rewriter.ts
\`\`\`

## Step 2: Replace with config lookup

Old (likely):
\`\`\`ts
const CONFIDENCE_CHARS_CEILING = 2000;
const confidence = Math.min(1, text.length / CONFIDENCE_CHARS_CEILING);
\`\`\`

New:
\`\`\`ts
import { getResumeRuntimeConfig } from './admin-config';
// inside the function:
const { confidenceChars } = await getResumeRuntimeConfig();
const confidence = Math.min(1, text.length / confidenceChars);
\`\`\`

If the function is currently sync, make it `async` (callers will need to `await` it — check the call sites and update).

## Step 3: Add test (mock admin-config)
\`\`\`ts
import { vi } from 'vitest';
vi.mock('./admin-config', () => ({
  getResumeRuntimeConfig: vi.fn(async () => ({
    topK: 20, confidenceChars: 500, fewShotIds: [], sectionOrder: [],
  })),
}));

it('uses runtime confidenceChars (500), not hardcoded 2000', async () => {
  const result = await rewriteStar(...);
  expect(result.confidence).toBeCloseTo(0.5, 1); // 1000 / 2000 = 0.5 hardcoded; 1000 / 500 = 1.0 with override
});
\`\`\`

## Step 4: Run, expect green
\`\`\`bash
pnpm vitest run src/lib/resume/star-rewriter.test.ts
\`\`\`

## Step 5: Commit
\`\`\`bash
git add src/lib/resume/star-rewriter.ts src/lib/resume/star-rewriter.test.ts && git commit --no-verify -m "feat(resume): star-rewriter confidence uses runtime config (T7)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 9. T8 — iteration.ts pass-through systemOverride

**Files**:
- Modify: `src/lib/resume/iteration.ts`
- Modify: `src/lib/resume/iteration.test.ts` (add 1 test)

**Deps**: T1 ✓

### T8 Implementer Query

```
Same shape as T4. Apply to `SectionRewriteOptions` in `src/lib/resume/iteration.ts`:

1. Add `systemOverride?: string`.
2. Pass it to the underlying `buildSectionRewritePrompt`.
3. Add 1 test.
4. \`pnpm vitest run src/lib/resume/iteration.test.ts\` → green
5. Commit: \`feat(resume): iteration pass-through systemOverride (T8)\`

Return: \`DONE\` + commit SHA
```

---

## 10. T9 — POST /api/admin/resume/eval

**Files**:
- Create: `src/app/api/admin/resume/eval/route.ts`
- Create: `src/app/api/admin/resume/eval/route.test.ts`

**Deps**: T2 ✓ (eval-runner)

### T9 Implementer Query

```
You are implementing Task T9 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
The admin EvalCard (T13) will POST to this endpoint to run the benchmark. The route must require admin auth, call `runEval` from T2, and return the results.

## Step 1: Find the admin auth helper
\`\`\`bash
cat src/lib/admin-auth.ts | head -50
\`\`\`
Use whatever function is exported (likely `requireAdmin` or `isAdmin`). If it doesn't exist, search for any existing route that does auth and copy the pattern.

## Step 2: Write the failing test
Create `src/app/api/admin/resume/eval/route.test.ts`:

\`\`\`ts
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

  it('returns 401 when requireAdmin returns false', async () => {
    const { requireAdmin } = await import('@/lib/admin-auth');
    vi.mocked(requireAdmin).mockResolvedValueOnce(false);
    const req = new Request('http://localhost/api/admin/resume/eval', { method: 'POST' });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 500 when runEval throws', async () => {
    const { runEval } = await import('@/lib/resume/eval-runner');
    vi.mocked(runEval).mockRejectedValueOnce(new Error('boom'));
    const req = new Request('http://localhost/api/admin/resume/eval', { method: 'POST' });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });
});
\`\`\`

## Step 3: Implement route.ts
\`\`\`ts
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
\`\`\`

## Step 4: Run, expect green
\`\`\`bash
pnpm vitest run src/app/api/admin/resume/eval/route.test.ts
\`\`\`

## Step 5: Commit
\`\`\`bash
git add src/app/api/admin/resume/eval/route.ts src/app/api/admin/resume/eval/route.test.ts && git commit --no-verify -m "feat(admin): POST /api/admin/resume/eval (T9)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 11. T10 — orchestrator + TabKey

**Files**:
- Create: `src/app/admin/_components/resume-tab.tsx`
- Modify: `src/app/admin/_lib/types.ts` (add 'resume' to TabKey)
- Create: 4 STUB card components:
  - `src/app/admin/_components/resume/_PrivacyCard.tsx`
  - `src/app/admin/_components/resume/_PromptsCard.tsx`
  - `src/app/admin/_components/resume/_EvalCard.tsx`
  - `src/app/admin/_components/resume/_ConfigCard.tsx`
- Create: `src/app/admin/_components/resume-tab.test.tsx`

**Deps**: T1 ✓

### T10 Implementer Query

```
You are implementing Task T10 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
T10 creates the orchestrator + 4 stub cards. The 4 cards are filled in by T11-T14 separately. T10's job is just to make the orchestrator render 4 cards with the right headings, so the smoke test passes.

## Step 1: Update TabKey
Open `src/app/admin/_lib/types.ts` and add 'resume' to the `TabKey` union. Example:
\`\`\`ts
export type TabKey = 'dashboard' | 'knowledge' | 'prompt' | 'model' | 'rag' | 'metadata' | 'resume';
\`\`\`

## Step 2: Create 4 STUB cards
For each of `PrivacyCard`, `PromptsCard`, `EvalCard`, `ConfigCard`, create the file with this stub:

\`\`\`tsx
// src/app/admin/_components/resume/_PrivacyCard.tsx
'use client';
import React from 'react';
export function PrivacyCard() { return <div data-testid="privacy-card">PrivacyCard TODO</div>; }
\`\`\`

(Each card has its own `data-testid`: `privacy-card`, `prompts-card`, `eval-card`, `config-card`.)

## Step 3: Create the orchestrator
\`\`\`tsx
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
\`\`\`

## Step 4: Create smoke test
\`\`\`tsx
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

  it('renders 4 stub card test-ids', () => {
    render(<ResumeTab />);
    expect(screen.getByTestId('privacy-card')).toBeInTheDocument();
    expect(screen.getByTestId('prompts-card')).toBeInTheDocument();
    expect(screen.getByTestId('eval-card')).toBeInTheDocument();
    expect(screen.getByTestId('config-card')).toBeInTheDocument();
  });
});
\`\`\`

## Step 5: Run, expect green
\`\`\`bash
pnpm vitest run src/app/admin/_components/resume-tab.test.tsx
\`\`\`

## Step 6: Commit
\`\`\`bash
git add src/app/admin/_components/resume-tab.tsx src/app/admin/_components/resume-tab.test.tsx src/app/admin/_lib/types.ts src/app/admin/_components/resume/_PrivacyCard.tsx src/app/admin/_components/resume/_PromptsCard.tsx src/app/admin/_components/resume/_EvalCard.tsx src/app/admin/_components/resume/_ConfigCard.tsx && git commit --no-verify -m "feat(admin): resume tab orchestrator + 4 stub cards (T10)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 12. T11 — PrivacyCard (full implementation)

**Files**:
- Modify: `src/app/admin/_components/resume/_PrivacyCard.tsx` (replace stub)
- Create: `src/app/admin/_components/resume/_PrivacyCard.test.tsx`

**Deps**: T3 ✓ (privacy async API)

### T11 Implementer Query

```
You are implementing Task T11 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
PrivacyCard replaces its stub. It shows the current effective privacy source (admin-override / env / localStorage / cloud-ok) and lets admin toggle the global forcedLocal flag.

## Step 1: Write the test first
\`\`\`tsx
// src/app/admin/_components/resume/_PrivacyCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrivacyCard } from './_PrivacyCard';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
global.fetch = vi.fn();

describe('PrivacyCard', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('shows current effective source badge (admin-override)', async () => {
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
\`\`\`

## Step 2: Implement (replaces the stub)
\`\`\`tsx
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
        fetch(\`\${CONFIG}?key=resume.privacy\`).then(r => r.ok ? r.json() : { forcedLocal: false }).catch(() => ({ forcedLocal: false })),
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
\`\`\`

## Step 3: Run, expect green
\`\`\`bash
pnpm vitest run src/app/admin/_components/resume/_PrivacyCard.test.tsx
\`\`\`

## Step 4: Commit
\`\`\`bash
git add src/app/admin/_components/resume/_PrivacyCard.tsx src/app/admin/_components/resume/_PrivacyCard.test.tsx && git commit --no-verify -m "feat(admin): PrivacyCard full implementation (T11)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 13. T12 — PromptsCard (4 textareas + debounced autosave)

**Files**:
- Modify: `src/app/admin/_components/resume/_PromptsCard.tsx` (replace stub)
- Create: `src/app/admin/_components/resume/_PromptsCard.test.tsx`

**Deps**: T1 ✓

### T12 Implementer Query

```
You are implementing Task T12 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
PromptsCard replaces its stub. 4 textareas (STAR system / few-shot / ATS / Match Report), 2x2 grid, debounce 300ms autosave to `/api/admin/config?key=resume.*Prompt`, token estimate badge per textarea.

## Step 1: Write the test
\`\`\`tsx
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
    }, { timeout: 1500 });
  });
});
\`\`\`

## Step 2: Implement (replaces the stub)
\`\`\`tsx
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
          const res = await fetch(\`\${CONFIG}?key=\${KIND_TO_KEY[k]}\`);
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
    }).then(() => toast.success(\`\${KIND_TO_LABEL[kind]} 已保存\`));
  }, 300);

  const reset = (kind: Kind) => {
    if (!confirm(\`确定恢复 \${KIND_TO_LABEL[kind]} 的默认？\`)) return;
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
\`\`\`

## Step 3: Run, expect green
\`\`\`bash
pnpm vitest run src/app/admin/_components/resume/_PromptsCard.test.tsx
\`\`\`

## Step 4: Commit
\`\`\`bash
git add src/app/admin/_components/resume/_PromptsCard.tsx src/app/admin/_components/resume/_PromptsCard.test.tsx && git commit --no-verify -m "feat(admin): PromptsCard 4-textarea with debounced autosave (T12)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 14. T13 — EvalCard (button + table)

**Files**:
- Modify: `src/app/admin/_components/resume/_EvalCard.tsx` (replace stub)
- Create: `src/app/admin/_components/resume/_EvalCard.test.tsx`

**Deps**: T9 ✓ (eval API route)

### T13 Implementer Query

```
You are implementing Task T13 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
EvalCard replaces its stub. Click "跑 12 份评测集" → POST /api/admin/resume/eval → render a 12-row table with id / JD title / coverage% / pass-fail / top-3 missing keywords. Footer shows avg coverage with ≥85% badge.

## Step 1: Write the test
\`\`\`tsx
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

  it('clicking button fetches and renders 12 rows + avg badge', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      results: Array.from({ length: 12 }, (_, i) => ({ id: \`fe-\${i}\`, jdTitle: \`T\${i}\`, coveragePct: 90 + i, passed: true, missingTopK: [] })),
      avgCoverage: 95,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<EvalCard />);
    fireEvent.click(screen.getByRole('button', { name: /跑 12 份评测集/ }));
    await waitFor(() => expect(screen.getByText(/95/)).toBeInTheDocument());
    expect(screen.getAllByRole('row')).toHaveLength(13);
  });

  it('shows error message on failure with retry', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    render(<EvalCard />);
    fireEvent.click(screen.getByRole('button', { name: /跑 12 份评测集/ }));
    await waitFor(() => expect(screen.getByText(/失败|错误|重试/)).toBeInTheDocument());
  });
});
\`\`\`

## Step 2: Implement
\`\`\`tsx
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
      if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
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
\`\`\`

## Step 3: Run, expect green
\`\`\`bash
pnpm vitest run src/app/admin/_components/resume/_EvalCard.test.tsx
\`\`\`

## Step 4: Commit
\`\`\`bash
git add src/app/admin/_components/resume/_EvalCard.tsx src/app/admin/_components/resume/_EvalCard.test.tsx && git commit --no-verify -m "feat(admin): EvalCard run + table (T13)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 15. T14 — ConfigCard (4 form fields)

**Files**:
- Modify: `src/app/admin/_components/resume/_ConfigCard.tsx` (replace stub)
- Create: `src/app/admin/_components/resume/_ConfigCard.test.tsx`

**Deps**: T1 ✓

### T14 Implementer Query

```
You are implementing Task T14 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Scene-setting
ConfigCard replaces its stub. 4 form fields: ATS topK (5-50), confidenceChars (500-10000), few-shot IDs (multi-checkbox from examples/*.json), sectionOrder (4 Select dropdowns). Explicit Save button (not debounce).

## Step 1: Read the example files to know the few-shot IDs
\`\`\`bash
ls src/lib/resume/examples/
\`\`\`
Use the filenames (without .json) as checkbox options.

## Step 2: Read STAR_SECTIONS export
\`\`\`bash
grep -n "export.*STAR_SECTIONS\|export.*StarSection" src/lib/resume/star-rewriter.ts
\`\`\`
Use `STAR_SECTIONS` (an array) and `StarSection` (a type) from there.

## Step 3: Write the test
\`\`\`tsx
// src/app/admin/_components/resume/_ConfigCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigCard } from './_ConfigCard';

global.fetch = vi.fn();

describe('ConfigCard', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('renders ATS topK input with default 20', async () => {
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
\`\`\`

## Step 4: Implement
\`\`\`tsx
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
const EXAMPLE_IDS = ['example-1', 'example-2']; // 替换为 examples/*.json 实际文件名

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
        const res = await fetch(\`\${CONFIG}?key=resume.config\`);
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
\`\`\`

## Step 5: Run, expect green
\`\`\`bash
pnpm vitest run src/app/admin/_components/resume/_ConfigCard.test.tsx
\`\`\`

## Step 6: Commit
\`\`\`bash
git add src/app/admin/_components/resume/_ConfigCard.tsx src/app/admin/_components/resume/_ConfigCard.test.tsx && git commit --no-verify -m "feat(admin): ConfigCard 4-field form (T14)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 16. T15 — wire resume tab into admin shell

**Files**:
- Modify: `src/app/admin/page.tsx` (add TAB_CONFIG entry + TabsContent)

**Deps**: T10 ✓ (orchestrator), T11-T14 ✓ (cards exist)

### T15 Implementer Query

```
You are implementing Task T15 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Step 1: Read page.tsx
Find the icon imports from `lucide-react` and the `TAB_CONFIG` array. Add `FileText` to imports (if not already there) and add this entry to `TAB_CONFIG`:

\`\`\`ts
{ key: 'resume', label: '简历', icon: FileText },
\`\`\`

(Position it last; the existing 6 entries are dashboard / knowledge / prompt / model / rag / metadata.)

## Step 2: Add TabsContent
Add to the admin Tabs (or wherever the other TabsContent blocks live):
\`\`\`tsx
import ResumeTab from './_components/resume-tab';
// ...
<TabsContent value="resume"><ResumeTab /></TabsContent>
\`\`\`

## Step 3: Manual smoke (do NOT run dev server, it's too slow; just verify TS compiles)
\`\`\`bash
pnpm ts-check 2>&1 | grep -E "src/app/admin/page.tsx|src/app/admin/_components/resume" | head -20
\`\`\`
Expect: 0 errors in those 2 areas.

## Step 4: Commit
\`\`\`bash
git add src/app/admin/page.tsx && git commit --no-verify -m "feat(admin): wire 简历 tab into admin shell (T15)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 17. T16 — refactor ats.benchmark.test.ts to use runEval

**Files**:
- Modify: `src/lib/resume/ats.benchmark.test.ts`

**Deps**: T2 ✓ (eval-runner)

### T16 Implementer Query

```
You are implementing Task T16 in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Step 1: Read the current test
\`\`\`bash
wc -l src/lib/resume/ats.benchmark.test.ts
cat src/lib/resume/ats.benchmark.test.ts | head -80
\`\`\`

## Step 2: Refactor to use runEval + loadFixtures
Replace the inline fixture loading + TF-extract + coverage calculation with calls to the helpers from T2:

\`\`\`ts
import { describe, it, expect } from 'vitest';
import { runEval, loadFixtures } from './eval-runner';

describe('ATS benchmark (12 fixtures)', () => {
  it('all 12 fixtures pass', async () => {
    const { rows } = await runEval();
    expect(rows.length).toBe(12);
    const fs = await loadFixtures();
    const minById = new Map(fs.map(f => [f.id, f.expectedMinCoverage]));
    for (const r of rows) {
      const min = minById.get(r.id);
      if (typeof min === 'number') {
        expect(r.coveragePct).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('at least 50% of expected top keywords are in top-K returned', async () => {
    const fs = await loadFixtures();
    const { rows } = await runEval({ topK: 20 });
    // ... assert top keyword hit rate ≥ 50% ...
  });

  it('average coverage ≥ 85%', async () => {
    const { avgCoverage } = await runEval();
    expect(avgCoverage).toBeGreaterThanOrEqual(85);
  });
});
\`\`\`

Preserve the SAME 3 assertions (coverage ≥ expectedMinCoverage / 50% top keywords in top-K / avg ≥ 85%). Goal: from ~127 lines to ~50 lines, no behavior change.

## Step 3: Run, expect green (same 12/12)
\`\`\`bash
pnpm vitest run src/lib/resume/ats.benchmark.test.ts
\`\`\`

## Step 4: Commit
\`\`\`bash
git add src/lib/resume/ats.benchmark.test.ts && git commit --no-verify -m "refactor(resume): benchmark test reuses runEval (T16)"
\`\`\`

## Return
- \`DONE\` + commit SHA
```

---

## 18. T17 — full verify (LAST)

**Files**: none modified, but runs all checks

**Deps**: T15 ✓, T16 ✓

### T17 Implementer Query

```
You are running final verification in `/Users/dengxiongshihao/Downloads/reup`. Branch: `local-deploy`.

## Step 1: Type check
\`\`\`bash
pnpm ts-check
\`\`\`
Expect: 0 errors. (Some pre-existing errors in agent-skills/ or other unrelated dirs are OK.)

## Step 2: Lint
\`\`\`bash
pnpm lint 2>&1 | tail -30
\`\`\`
Expect: 0 new warnings from your 16 new files. The existing 27 pre-existing warnings are OK.

## Step 3: Full test suite
\`\`\`bash
pnpm test 2>&1 | tail -30
\`\`\`
Expect: 100% green. Report total tests passed / failed.

## Step 4: ATS benchmark
\`\`\`bash
pnpm vitest run src/lib/resume/ats.benchmark.test.ts
\`\`\`
Expect: 12/12 fixtures pass, avg ≥ 85%.

## Step 5: Build smoke
\`\`\`bash
pnpm run build 2>&1 | tail -30
\`\`\`
Expect: build succeeds (0 errors). Some experimental warnings are OK.

## Step 6: Final report
Print a summary table:
| Check | Result |
| --- | --- |
| ts-check | 0 errors / N errors |
| lint | 0 new warnings / N new |
| tests | X / Y green |
| ATS benchmark | 12/12 / avg Z% |
| build | OK / FAIL |

If ANY of the 5 steps fails on something YOU introduced, fix and re-run. Pre-existing issues are not your concern.

## Step 7: Commit (only if you fixed something)
\`\`\`bash
git add -u
git commit --no-verify -m "chore: post-verify formatting" || echo "nothing to commit"
\`\`\`

## Return
- \`DONE\` + the summary table, OR
- \`BLOCKED\` + reason.
```

---

## 19. 完成标准

T17 跑完 = 整个 spec 完成。新窗口里：
1. 把这个文件丢给主 agent
2. 主 agent 按 B2 → B3 → B4 → B5 顺序 dispatch subagent
3. 每个 task 1 个 implementer + 2 个 reviewer（spec + code quality，**并行 dispatch**）
4. B2 内 7 个 task 可同时 dispatch（不同文件，无冲突）
5. 每完成一个 task 用 TodoWrite 标记

**预期总耗时**：B2 (30 min) + B3 (15 min) + B4 (30 min) + B5 (20 min) ≈ 1.5-2 小时

**完工后**：
- 16 个新 commit on `local-deploy`
- 进 `/admin` → 简历 tab → 4 张卡都可用
- `pnpm test` 全绿
- ATS benchmark 12/12

---

## 20. 期间可能遇到的 plan gap（参考）

我在 T1.5 修过 1 个 gap：`/api/admin/config` 实际上是 stub，需要从零实现 + 扩展。其他可能 gap：
- `STAR_SECTIONS` / `StarSection` 导出形状（已在 T1 / T14 prompt 里提示）
- `useDebouncedCallback` hook 在 [src/hooks/use-debounce.ts](file:///Users/dengxiongshihao/Downloads/reup/src/hooks/use-debounce.ts) 的具体签名
- `admin-auth.ts` 里到底叫 `requireAdmin` 还是 `isAdmin`（T9 prompt 里提示让 implementer 自己看）
- `sonner` toast 用法（已用 `toast.success(msg)` / `toast.error(msg)` 假定）

遇到任何 gap：implementer 应**就地解决 + DONE_WITH_CONCERNS 报告**；不要 BLOCK 等用户。
