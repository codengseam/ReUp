# 2026-06-15 Resume 解析 + JD 匹配 + 提示词后台化

> **状态**: 实施中 · **范围**: parser 6 bug + JD 真实化 + 3 prompt 抽模块 + 后台 4 sub-tab

## 动机

用户截图 3 类问题：

1. **PDF 解析缺内容** —— 实测根因 = `parser-text.ts` 6 个隐藏 bug（不是 PDF 库问题）；`ParsePreview` 是隐性空 section 不报错
2. **JD 分析没基于简历+JD** —— `MATCH_REPORT_PROMPT` 太泛 + `parseMatchReport` 解析失败静默回退 + `buildResumeSummary` 压缩成 1 行
3. **提示词后台配置** —— `admin-config.getResumePrompt()` 接口已留好但 3 个 route 都没接；后台 `prompt-tab` 只管主系统提示词

## 范围 (In / Out)

**In**

- A: `parser-text.ts` 6 bug 修复 + 6 个单测 (1 个 test file)
- B: `ParsePreview` EmptyState + 1 个 e2e 测试
- C: `match-report` 真实化 + `parseMatchReport` 失败 → 502 + `ats.ts`/`match-report`/`star-rewriter` 3 个 prompt 抽到 `prompts/` + 接 `getResumePrompt(...)` + UI `error` 渲染
- D: 后台 `prompt-tab` 4 sub-tab (主 / STAR / ATS / Match)

**Out**

- 切换 PDF OCR 库
- A/B test / 多版本 prompt / 回滚
- prompt 改 SSE 流式

## 设计

### Phase A — parser-text.ts 修复

目标：基于 `data/user-samples/resume/简历.md` 这份真实样本，6 个 bug 全修复 + 现有测试不破坏。

**Bug → 修复**

| ID | 现象 | 修复点 |
|----|------|--------|
| A1 | `role` 字段被 period 污染；`懂车帝 - 抖音电商（业务负责人，，北京` | `parseRoleLine`：先抽 period，role 只保留括号前部分；trailing 逗号+地点剥离 |
| A2 | company 错乱；`K12 - 智慧考试（团队负责人，…，北京）` | 改"第二行 inline 角色行"规则：`() 团队)`/`(业务)` 等带 `团队/业务/负责人/工程师/测试` 的 role 行也认；company 落到 `###` 行 |
| A3 | fan-out 误伤；3 个 bullet 被当 3 个空 project | `splitSubBlocks` fan-out 触发条件加 `header === ''` |
| A4 | skill 按 `：` 切开；`数据库：MySQL` 当 1 项 | 改"行优先"：每行整条入 skills；只在 `、，；/ and &` 切 |
| A5 | 教育"相关课程"被吃 | `ResumeEducation` 加 `notes?: string[]`；`parseEducationSection` 收集 bullet 入 notes |
| A6 | role 截断；逗号后 period 提取失败 | `PERIOD_RE` 收紧：`/，/` 视为合法分隔 |

**测试**：`src/lib/resume/parser-text-fixtures.test.ts`，6 个 case 对真实样本片段的预期输出（不重写 `parser-text.test.ts` 的 mock fixture）。

### Phase B — ParsePreview 反馈强化

`EmptyState`：section 为空时显示 `「未解析到 XX，请检查简历中是否包含 XX 标题」`。
e2e：`src/lib/resume/__tests__/parse_preview_e2e.test.tsx`（vitest + @testing-library），跑真实 md → ParsePreview → 验 5 个 section 都渲染。

### Phase C — JD 真实化

**C1** `route.ts` 的 `MATCH_REPORT_PROMPT` 移到 `src/lib/resume/prompts/match.ts`，export `DEFAULT_MATCH_PROMPT` + `buildMatchReportPrompt(resume, jd, opts?)`。
**C2** `ats.ts` 的 `KEYWORD_PROMPT_SYSTEM` + `buildKeywordPrompt` 移到 `src/lib/resume/prompts/ats.ts`，export `DEFAULT_ATS_PROMPT` + `buildAtsPrompt(jd, topK)`。
**C3** `prompts/star.ts` 已有，复用 export `DEFAULT_STAR_PROMPT`（从 system 拼装字符串中抽出常量）。
**C4** 3 个 route 改成：`const prompt = (await getResumePrompt('match')) ?? DEFAULT_MATCH_PROMPT`，用 `buildMatchReportPrompt` 注入简历。
**C5** `parseMatchReport` 失败 → 返回 502 + `{ error }`，UI 红 banner。
**C6** `buildResumeSummary` → `JSON.stringify(resume)`（去掉 raw 太长则截断到 6000 字符）。
**C7** `MatchReportCard` 加 `error` prop + 红色 banner 组件。

**测试**：`src/lib/resume/prompts/match.test.ts` 4 case（默认 prompt 存在 / build 注入正确 / 截断边界 / 空 resume）。

### Phase D — 后台 prompt-tab 4 sub-tab

`src/app/admin/_components/prompt-tab.tsx` 改写：

- 顶层 shadcn `Tabs`：`default` / `star` / `ats` / `match`
- 每个 sub-tab：textarea + 保存按钮 + 恢复默认 + 右侧 outline
- sub-tab 内 fetch `${CONFIG_API}?key=...` 加载，POST 时 `key=...&value={ customPrompt: ... }`
- 4 个 key：`prompt` / `resume.starPrompt` / `resume.atsPrompt` / `resume.matchPrompt`
- 4 个默认常量从 `prompts/*.ts` 导入

**测试**：`src/app/admin/_components/prompt-tab.test.tsx` 4 case（每个 sub-tab 加载/保存/恢复默认 + key 正确）。

## 风险

- `parser-text.ts` 修改触发现存 6+ 个测试 fixture 失败 → 优先跑 baseline，逐个修
- `prompts/star.ts` 导出常量可能影响 `iteration.ts` 单测 → 跑 vitest 验证
- 真实 PDF 回归 = 用户手动（data/ 无 PDF）

## 验收

- `pnpm ts-check && pnpm lint && pnpm test` 全绿
- 浏览器手测 4 个 sub-tab 各保存一次
- commit: `feat(resume): parser/jd/prompts admin-config 集成`
