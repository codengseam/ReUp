# ReUp v2 — Admin 简历 Tab

**Date**: 2026-06-14
**Status**: Draft (user approved go-ahead; ready for plan)
**Branch**: `local-deploy`
**Supersedes (in part)**: 补齐 spec §11 "管理后台" 中关于简历模块的空白

---

## 1. 背景

`spec §11` 列出管理后台 6 个 tab（dashboard / knowledge / prompt / model / rag / metadata），但简历模块（§7-§10）落地的所有 prompt / config / 评测集 / 隐私策略**没有任何 admin 入口**。症状：

| 现状 | 影响 |
|---|---|
| 4 类 prompt（STAR system / few-shot / ATS / Match Report）硬编码在 [prompts/star.ts](file:///Users/dev/Downloads/reup/src/lib/resume/prompts/star.ts) / [ats.ts](file:///Users/dev/Downloads/reup/src/lib/resume/ats.ts) / [matcher.ts](file:///Users/dev/Downloads/reup/src/lib/resume/matcher.ts) | 改 prompt 需改代码 + 重新部署 |
| 12 份 ATS 评测集 + 跑分逻辑只在 [ats.benchmark.test.ts](file:///Users/dev/Downloads/reup/src/lib/resume/ats.benchmark.test.ts) | 跑分需 `pnpm test`，无 UI 触发；改 fixture 需改文件 |
| 隐私模式只有 env + localStorage | 运营方无"强制全局本地模式"开关 |
| 4 个运行时旋钮（ATS topK / 置信阈值 / few-shot 例子 / 段顺序）散落硬编码 | 无集中调参入口 |

## 2. 关键约束

1. **复用现有 admin config 存储** `/api/admin/config?key=<name>`（同 `prompt` / `knowledge` 路径），不引入新存储
2. **运行时注入，不重启服务**：prompt / config 改动即时生效；5 秒模块级 memo 避免每请求打 config store
3. **隐私三层优先级链**：`admin-override > NEXT_PUBLIC_PRIVACY_MODE > localStorage`；override 由服务端 config 提供
4. **不破坏现有 25+ 测试**（含 12 份 ATS 评测）
5. **TS strict，无 any**；Zod 校验所有外部入参

## 3. 设计

### 3.1 新增顶层 tab"简历"（方案 A 架构）

[src/app/admin/page.tsx](file:///Users/dev/Downloads/reup/src/app/admin/page.tsx) 的 `TAB_CONFIG` 追加：

```ts
{ key: 'resume', label: '简历', icon: FileText },
```

`TabKey` 联合类型同步追加 `'resume'`（[_lib/types.ts](file:///Users/dev/Downloads/reup/src/app/admin/_lib/types.ts)）。

### 3.2 6 个 config key（复用 `/api/admin/config`）

| key | 形态 | 默认（fallback）| 读取方 |
|---|---|---|---|
| `resume.starPrompt` | `string` | 现有 [prompts/star.ts](file:///Users/dev/Downloads/reup/src/lib/resume/prompts/star.ts) 硬编码 system | star-rewriter + iteration |
| `resume.starFewShot` | `string` (JSON) | 现有 `examples/example-1.json` + `example-2.json` | prompts/star |
| `resume.atsPrompt` | `string` | 现有 [ats.ts](file:///Users/dev/Downloads/reup/src/lib/resume/ats.ts) 内置 LLM prompt | ats.extractJdKeywords |
| `resume.matchPrompt` | `string` | 现有 [matcher.ts](file:///Users/dev/Downloads/reup/src/lib/resume/matcher.ts) generatePriorities prompt | matcher.generatePriorities |
| `resume.config` | `{ topK: number, confidenceChars: number, fewShotIds: string[], sectionOrder: StarSection[] }` | `{ topK: 20, confidenceChars: 2000, fewShotIds: ['example-1'], sectionOrder: STAR_SECTIONS }` | star-rewriter + ats + UI |
| `resume.privacy` | `{ forcedLocal: boolean }` | `{ forcedLocal: false }` | privacy.isPrivacyMode |

### 3.3 新增 `src/lib/resume/admin-config.ts`（运行时注入层）

```ts
// 5s 模块级 memo
const CACHE_TTL_MS = 5_000;

export interface ResumeRuntimeConfig {
  topK: number;
  confidenceChars: number;
  fewShotIds: string[];
  sectionOrder: StarSection[];
}

export async function getResumeRuntimeConfig(): Promise<ResumeRuntimeConfig> { ... }
export async function getResumePrompt(kind: 'star' | 'ats' | 'match'): Promise<string | null> { ... }
export async function isForcedLocalMode(): Promise<boolean> { ... }
export function clearResumeConfigCache(): void { ... } // 测试用
```

- server-only（`import 'server-only'`）
- fetch `/api/admin/config?key=...` 失败 → 返回 fallback 默认值（保证向后兼容）
- 写入由 admin UI 走 `/api/admin/config` POST，admin-config.ts 只读不写
- 5s memo 用 `let cache = { value, expires }`，并发请求复用单次 fetch

### 3.4 `src/lib/resume/privacy.ts` 改 1 处

```ts
// 旧: env > localStorage
// 新: admin-override > env > localStorage
export async function isPrivacyMode(): Promise<boolean> {
  if (await isForcedLocalMode()) return true;          // 来自 admin config
  if (readEnvFlag()) return true;
  // localStorage fallback
  ...
}
```

**API breaking change**：`isPrivacyMode` 从同步变异步。调用方 4 处（[page.tsx L82](file:///Users/dev/Downloads/reup/src/app/resume/page.tsx#L82) / 现有 useEffect 2 处 / 1 处 PrivacyToggle）全部改为 `await` / `useEffect` 内 `void isPrivacyMode().then(set)`。

### 3.5 prompt / config 运行时注入（4 个文件）

| 文件 | 改动 |
|---|---|
| [prompts/star.ts](file:///Users/dev/Downloads/reup/src/lib/resume/prompts/star.ts) | `buildStarRewritePrompt` 新增 `opts.systemOverride?: string` 入参（覆盖内置 system）；`exampleIds` 已支持 runtime |
| [ats.ts](file:///Users/dev/Downloads/reup/src/lib/resume/ats.ts) | `extractJdKeywords` 新增 `opts.topK?: number`（默认从 admin-config 拉）；system 段也支持 override |
| [matcher.ts](file:///Users/dev/Downloads/reup/src/lib/resume/matcher.ts) | `generatePriorities` 新增 `opts.systemOverride?: string` |
| [star-rewriter.ts](file:///Users/dev/Downloads/reup/src/lib/resume/star-rewriter.ts) | `confidence = min(1, len/confidenceChars)`，chars 来自 admin-config |
| [iteration.ts](file:///Users/dev/Downloads/reup/src/lib/resume/iteration.ts) | 透传 systemOverride |

**调用约定**：所有新增的 `opts.*Override` / `opts.*Config` 入参都接受 `undefined`（fallback 走原硬编码路径），保证旧测试零修改。

### 3.6 新增 API `POST /api/admin/resume/eval`

```
POST /api/admin/resume/eval
  → 200 { ok: true, results: Array<{ id, jdTitle, coveragePct, passed, missingTopK: string[] }>, avgCoverage: 93.0 }
  → 401 未鉴权
  → 500 服务端异常
```

服务端跑 `extractJdKeywords`（TF 路径，不调 LLM）+ `computeAtsCoverage`，逻辑从 [ats.benchmark.test.ts](file:///Users/dev/Downloads/reup/src/lib/resume/ats.benchmark.test.ts) 提取到新模块：

**`src/lib/resume/eval-runner.ts`**
```ts
export interface EvalFixture { id: string; jdTitle: string; resume: ResumeDocument; jd: string; expectedTopKeywords: string[]; expectedMinCoverage: number; }
export interface EvalRow { id: string; jdTitle: string; coveragePct: number; passed: boolean; missingTopK: string[]; }
export async function loadFixtures(): Promise<EvalFixture[]> { ... }   // 读 data/resume-eval/*.json
export async function runEval(opts?: { topK?: number }): Promise<{ rows: EvalRow[]; avgCoverage: number }> { ... }
```

`ats.benchmark.test.ts` 改为 `import { runEval }` + 复用断言（14 行 → 6 行），12 份 fixture 验证逻辑零修改。

### 3.7 UI：`src/app/admin/_components/resume-tab.tsx` + 4 个子 Card

复用现有 [PromptTab](file:///Users/dev/Downloads/reup/src/app/admin/_components/prompt-tab.tsx) 的 useDebouncedCallback + toast 模式。

```tsx
<ResumeTab>
  <PrivacyCard />     // 置顶：状态徽章 + Switch
  <PromptsCard />     // 2×2 textarea 网格
  <EvalCard />        // 按钮 + 表格
  <ConfigCard />      // 4 个 form 字段
</ResumeTab>
```

#### 3.7.1 PrivacyCard
- 读 `resume.privacy` + 本地 env flag + 推断当前生效源
- 展示：徽章 "当前生效：admin-override" / "env" / "localStorage"
- Switch "强制全局本地模式" → 显式 Save 按钮 + 二次确认（影响所有用户）
- 文案：开启后所有用户上传/解析/导出全部在浏览器内进行

#### 3.7.2 PromptsCard
- 2×2 grid (md+)，md- 单列
- 每块：`<Label>` + `<Textarea rows=8>` + 右上角 token 估算徽章（复用 [prompts/star.ts](file:///Users/dev/Downloads/reup/src/lib/resume/prompts/star.ts) 的 `estimateTokens`）
- 4 个 textarea 各自独立 debounce 300ms 自动保存 + toast
- 重置按钮：恢复内置默认值（弹 confirm）

#### 3.7.3 EvalCard
- 主按钮 "跑 12 份评测集"（点击后 disabled + Loader2）
- 跑完渲染 Table：id | JD 标题 | 覆盖率 | 状态 | Top-3 缺失关键词
- 表头脚：平均覆盖率 + 与 85% 阈值对比徽章
- 空态：未跑过时显示 "点击上方按钮开始跑分"
- 错误态：失败时显示错误消息 + 重试按钮

#### 3.7.4 ConfigCard
- ATS topK (Input type=number, min=5, max=50, default 20)：单次 LLM 抽取关键词上限
- 置信阈值 (Input type=number, min=500, max=10000, default 2000)：STAR 重写 4 段累计多少字符算 confidence=1.0（公式 `min(1, totalChars / confidenceChars)`，值越大代表需要更多字符才打满 confidence）
- Few-shot 例子 ID (multi-checkbox，options 来自 `examples/*.json` 列表)
- 4 段顺序 (4 个 `<Select>`，每个 options 是当前未选段)
- 显式 Save 按钮（不放 debounce；form-style 一次性提交）
- 重置按钮恢复默认

### 3.8 文件清单

**新增（9 个）**：
- `src/app/admin/_components/resume-tab.tsx`
- `src/app/admin/_components/resume/_PrivacyCard.tsx`
- `src/app/admin/_components/resume/_PromptsCard.tsx`
- `src/app/admin/_components/resume/_EvalCard.tsx`
- `src/app/admin/_components/resume/_ConfigCard.tsx`
- `src/app/api/admin/resume/eval/route.ts`
- `src/lib/resume/admin-config.ts`
- `src/lib/resume/admin-config.test.ts`
- `src/lib/resume/eval-runner.ts`
- `src/lib/resume/eval-runner.test.ts`

**修改（7 个）**：
- `src/app/admin/page.tsx` (+1 tab)
- `src/app/admin/_lib/types.ts` (TabKey +1)
- `src/lib/resume/privacy.ts` (异步 + 三层优先级)
- `src/lib/resume/prompts/star.ts` (systemOverride)
- `src/lib/resume/ats.ts` (topK + systemOverride)
- `src/lib/resume/matcher.ts` (systemOverride)
- `src/lib/resume/star-rewriter.ts` (confidenceChars 来源)
- `src/lib/resume/iteration.ts` (透传)
- `src/lib/resume/ats.benchmark.test.ts` (复用 runEval)

## 4. 测试 + 验收

### 4.1 TDD 优先模块（写测试 → 看红 → 实现 → 看绿）
- `admin-config.ts` (cache 命中 / 失效 / fallback)
- `eval-runner.ts` (12 份 fixture 跑通 / 0 LLM)
- 4 个 Card 组件 (`@testing-library/react`)

### 4.2 验收
- `pnpm ts-check` 0 错误
- `pnpm lint` 0 新警告
- `pnpm test` 全绿（含 12 份 ATS 评测 + 新模块 ≥ 80% 覆盖）
- `pnpm benchmark:ats` 仍 12/12 通过
- 手工：进 admin 简历 tab，4 个 Card 都可保存 + 重启服务不丢

## 5. 风险 + 缓解

| 风险 | 缓解 |
|---|---|
| `isPrivacyMode` 同步→异步破坏调用方 | 单一 PR 内 4 处调用方一起改；UI 端用 `useEffect` 异步 setState |
| 6 个 config key 与 chat 路由的 `customPrompt` 命名不一致 | 用 `resume.*` 命名空间，文档里说明区分 |
| Few-shot 多选 admin 端编辑成无效 JSON | Zod 校验：保存时 parse，失败 toast 报错不写 |
| ATS 跑分同步阻塞 UI | API 跑完 < 1s（TF 路径，12 份），无需 streaming；spinner 即可 |
| memo cache 在多实例部署下过期不一致 | 5s TTL 容忍；不引入 Redis 复杂度 |
| Privacy 强制开关被误开 | 二次确认 + 提示文案 "影响所有用户" |
