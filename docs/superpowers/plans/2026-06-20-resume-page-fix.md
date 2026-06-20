# 简历优化工作台修复与增强计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or inline manual execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复简历分析页面 6 大用户问题，支持单独分析简历/JD，修复匹配度 0%、短板为 Skill ID、JD 页空白、诊断维度不足、对比视图不清晰等问题。

**Architecture:** 前端解除简历+JD 强制绑定；后端复用现有 `/api/resume/analyze` 的 optional JD 能力；将匹配引擎从「职业辅导 Skill 维度」切换为「JD hardRequirements / skills / responsibilities / focusPoints」维度；JD Tab 与诊断 Tab 引入 LLM 驱动的专家分析（带 rule-based fallback）。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, shadcn/ui, Vitest。

---

## 文件结构

- 前端入口与状态：[`src/app/resume/page.tsx`](file:///workspace/src/app/resume/page.tsx)、[`src/components/shared/resume/ResumeAnalyzer.tsx`](file:///workspace/src/components/shared/resume/ResumeAnalyzer.tsx)
- 对比视图：[`src/components/shared/resume/ResumeRawCompare.tsx`](file:///workspace/src/components/shared/resume/ResumeRawCompare.tsx)
- 匹配度面板：[`src/components/shared/resume/MatchGauge.tsx`](file:///workspace/src/components/shared/resume/MatchGauge.tsx)
- 诊断面板：[`src/components/shared/resume/DiagnosticsPanel.tsx`](file:///workspace/src/components/shared/resume/DiagnosticsPanel.tsx)
- JD 卡片：[`src/components/shared/jd/JdCard.tsx`](file:///workspace/src/components/shared/jd/JdCard.tsx)
- 分析编排：[`src/features/resume/analyzer.ts`](file:///workspace/src/features/resume/analyzer.ts)
- 匹配引擎：[`src/lib/resume/matcher.ts`](file:///workspace/src/lib/resume/matcher.ts)
- JD 解析：[`src/features/jd/parser.ts`](file:///workspace/src/features/jd/parser.ts)
- 诊断引擎：[`src/features/resume/diagnostics/*.ts`](file:///workspace/src/features/resume/diagnostics)
- API：[`src/app/api/resume/analyze/route.ts`](file:///workspace/src/app/api/resume/analyze/route.ts)

---

## Task 1: 支持单独分析简历或 JD

**Files:**
- Modify: [`src/components/shared/resume/ResumeAnalyzer.tsx`](file:///workspace/src/components/shared/resume/ResumeAnalyzer.tsx)
- Test: [`src/components/shared/resume/__tests__/ResumeAnalyzer.tracking.test.tsx`](file:///workspace/src/components/shared/resume/__tests__/ResumeAnalyzer.tracking.test.tsx)（补充模式测试）

- [ ] **Step 1: 调整 hasInput 与按钮文案**
  - `hasInput` 改为 `(file !== null || rawText.trim().length > 0) || jdText.trim().length > 0`
  - 根据当前输入动态显示按钮提示：仅简历→"分析简历"；仅 JD→"分析 JD"；都有→"开始匹配分析"
  - 上传文件时不再因为 JD 为空而重置状态

- [ ] **Step 2: 处理返回数据与 Tab 可见性**
  - 只有简历时：显示「对比视图」「诊断」，隐藏「JD」「匹配度」
  - 只有 JD 时：显示「JD」Tab（含 JD 分析），隐藏「对比视图」「诊断」「匹配度」
  - 都有时：四个 Tab 全显
  - 调整 `onAnalyze` 中 `matchReport` 设置逻辑，避免无 JD 时仍创建空匹配报告

- [ ] **Step 3: 运行相关测试**
  - `pnpm test src/components/shared/resume/__tests__/ResumeAnalyzer.tracking.test.tsx`

---

## Task 2: 修复匹配度 0% 与短板为 Skill ID

**Files:**
- Modify: [`src/lib/resume/matcher.ts`](file:///workspace/src/lib/resume/matcher.ts)、[`src/features/resume/analyzer.ts`](file:///workspace/src/features/resume/analyzer.ts)
- Test: [`src/lib/resume/matcher.test.ts`](file:///workspace/src/lib/resume/matcher.test.ts)、[`src/features/resume/match.test.ts`](file:///workspace/src/features/resume/match.test.ts)

- [ ] **Step 1: 重构 classifyDimensions / 新增 buildMatchReportFromJD**
  - 当存在 JD 时，维度来源改为 `jd.hardRequirements`、`jd.skills`、`jd.responsibilities`、`jd.focusPoints`
  - 每个维度输出：`dimension`（中文可读名称）、`evidence`（简历中匹配到的原文或空）、`score`（0/0.5/1 或连续值）
  - gaps 从「未命中维度」生成，severity 按 must/required/high 权重区分
  - 保留 `classifyDimensions` 兼容旧测试，但 analyzer 默认走 JD 路径

- [ ] **Step 2: 调整综合匹配度算法**
  - 综合匹配度 = 命中维度权重 / 总维度权重，而不是 strengths/(strengths+gaps)
  - 当无 JD 时，Match Tab 不可见

- [ ] **Step 3: 更新测试与 snapshot**
  - 运行 `pnpm test src/lib/resume/matcher.test.ts src/features/resume/match.test.ts`

---

## Task 3: 增强 JD Tab（JD 分析 + 面试问题 + 风险）

**Files:**
- Create: [`src/features/jd/analyzer.ts`](file:///workspace/src/features/jd/analyzer.ts)
- Create: [`src/components/shared/jd/JdAnalysisCard.tsx`](file:///workspace/src/components/shared/jd/JdAnalysisCard.tsx)
- Modify: [`src/components/shared/jd/JdCard.tsx`](file:///workspace/src/components/shared/jd/JdCard.tsx)、[`src/app/api/resume/analyze/route.ts`](file:///workspace/src/app/api/resume/analyze/route.ts)、[`src/features/resume/analyzer.ts`](file:///workspace/src/features/resume/analyzer.ts)
- Test: [`src/app/api/resume/analyze/__tests__/route.test.ts`](file:///workspace/src/app/api/resume/analyze/__tests__/route.test.ts)

- [ ] **Step 1: 新增 JD 专家分析类型与函数**
  - 类型：`JDAnalysis { summary, interviewQuestions, hiddenRisks, cultureFit, growthPath, keyCompetencies }`
  - `analyzeJD(jdDoc, llmClient)`：优先 LLM，失败则返回基于 JD 结构的 rule-based 分析

- [ ] **Step 2: 接入 analyze 接口**
  - `analyzeResume` 返回 `{ ..., jdAnalysis: JDAnalysis | null }`
  - API route 透传该字段

- [ ] **Step 3: 前端展示 JD 分析**
  - 在 JdCard 或新增 JdAnalysisCard 中展示：岗位概要、核心能力要求、可能的面试问题、隐藏风险、文化匹配、成长路径
  - 面试问题按高/中/低权重分组

- [ ] **Step 4: 测试**
  - `pnpm test src/app/api/resume/analyze/__tests__/route.test.ts`

---

## Task 4: 扩展诊断维度

**Files:**
- Create: [`src/features/resume/diagnostics/impact.ts`](file:///workspace/src/features/resume/diagnostics/impact.ts)
- Create: [`src/features/resume/diagnostics/readability.ts`](file:///workspace/src/features/resume/diagnostics/readability.ts)
- Create: [`src/features/resume/diagnostics/career.ts`](file:///workspace/src/features/resume/diagnostics/career.ts)
- Modify: [`src/features/resume/diagnostics/index.ts`](file:///workspace/src/features/resume/diagnostics/index.ts)、[`src/features/resume/diagnostics/types.ts`](file:///workspace/src/features/resume/diagnostics/types.ts)、[`src/components/shared/resume/DiagnosticsPanel.tsx`](file:///workspace/src/components/shared/resume/DiagnosticsPanel.tsx)
- Test: [`src/features/resume/diagnostics/__tests__/index.test.ts`](file:///workspace/src/features/resume/diagnostics/__tests__/index.test.ts)

- [ ] **Step 1: 扩展 DiagnosticIssue type**
  - type 新增 `'impact' | 'readability' | 'career'`

- [ ] **Step 2: 实现新检测器**
  - `impact.ts`：检测 bullet 中缺少量化数据（数字、%、倍数、用户数、QPS 等）
  - `readability.ts`：检测单条 bullet 过长/过短、全文长度、段落密度
  - `career.ts`：检测职业叙事一致性（title 与经历方向、技能与岗位方向、晋升路径合理性）

- [ ] **Step 3: 接入并展示**
  - `runDiagnostics` 调用新增检测器
  - DiagnosticsPanel 增加对应图标与分组

- [ ] **Step 4: 测试**
  - `pnpm test src/features/resume/diagnostics/__tests__/`

---

## Task 5: 优化对比视图与解析完整性

**Files:**
- Modify: [`src/components/shared/resume/ResumeRawCompare.tsx`](file:///workspace/src/components/shared/resume/ResumeRawCompare.tsx)
- Modify（如需要）: [`src/lib/resume/parser-text.ts`](file:///workspace/src/lib/resume/parser-text.ts)、[`src/features/resume/parser-text.ts`](file:///workspace/src/features/resume/parser-text.ts)
- Test: 现有 parser 测试

- [ ] **Step 1: 对比视图语义明确化**
  - 左侧标题改为「原始文本 / 上传文件预览」
  - 右侧标题改为「结构化解析结果」
  - 增加模块标题与分隔，确保各模块完整展示（工作经历、项目经历、教育、技能、基本信息）
  - 对缺失模块给出「未解析到」提示

- [ ] **Step 2: 检查并修复解析遗漏**
  - 用用户截图中的简历样例文本作为 fixture，验证解析是否完整
  - 若发现关键字段丢失（如项目经历只解析出标题、bullet 丢失），修复 parser-text

- [ ] **Step 3: 测试**
  - `pnpm test src/lib/resume/parser.test.ts src/features/resume/parser-text.test.ts`

---

## Task 6: 专家团审计（UI / 功能 / 性能 / 稳定性）

**Files:** 全页面相关文件

- [ ] **Step 1: UI/UX 审查**
  - 检查 Tab 禁用状态提示、空状态、加载状态、错误状态是否完整
  - 检查移动端/小屏适配（可选，桌面优先）

- [ ] **Step 2: 功能审查**
  - 单独分析简历、单独分析 JD、两者都分析三种模式端到端验证
  - 检查文件上传后 rawText 显示 `[已上传 xxx]` 是否合理（用户截图中左侧显示该占位）

- [ ] **Step 3: 性能与稳定性审查**
  - 检查 analyze 接口是否对 LLM 调用做超时/降级处理
  - 检查前端是否对上传文件大小做限制
  - 检查无 LLM 配置时的 fallback 是否仍可返回基础分析

- [ ] **Step 4: 修复审计发现的其他问题**
  - 记录并修复至少 1-2 个高优先级问题

---

## Task 7: 最终验证

- [ ] **Step 1: 类型检查**
  - `pnpm ts-check`

- [ ] **Step 2: 代码检查**
  - `pnpm lint`

- [ ] **Step 3: 全量测试**
  - `pnpm test`

- [ ] **Step 4: 更新 AGENTS.md token 数（如改动文档）**
  - `pnpm tokens AGENTS.md`
