# ReUp 面试全程辅导工具 — 执行计划

## 总览

| Phase | 子项目 | 优先级 | 预计文件数 | 依赖 |
|-------|--------|--------|-----------|------|
| 1 | A: 简历分析三件套 + Infra 基础 | P0 | ~25 | 无 |
| 2 | B: 简历润色 + 面试指导 | P1 | ~20 | Phase 1 |
| 3 | C: 面经上传分析 + Infra 统计面板 | P2 | ~15 | Phase 1,2 |

## Phase 1: 简历分析三件套 + 基础设施

### Task 1.1: Infra 基础 — 日志 + 埋点 SDK
- [ ] 创建 `server/logger.ts`：结构化 JSON 日志 + traceId 生成
- [ ] 创建 `shared/utils/analytics.ts`：前端埋点 SDK
- [ ] 创建 `app/api/analytics/track/route.ts`：埋点上报 API
- [ ] 创建 `server/analytics/store.ts`：事件存储
- [ ] 编写测试：`server/__tests__/logger.test.ts`、`shared/utils/__tests__/analytics.test.ts`

### Task 1.2: JD 解析增强
- [ ] 修改 `features/jd/types.ts`：JDDocument 增加 `focusPoints` 字段
- [ ] 修改 `features/jd/parser.ts`：LLM prompt 增加考察重点提取
- [ ] 编写测试：`features/jd/__tests__/parser-focus-points.test.ts`

### Task 1.3: 简历诊断引擎
- [ ] 创建 `features/resume/diagnostics/typo.ts`：错别字检测
- [ ] 创建 `features/resume/diagnostics/timeline.ts`：时间线冲突检测
- [ ] 创建 `features/resume/diagnostics/format.ts`：格式一致性检测
- [ ] 创建 `features/resume/diagnostics/contradiction.ts`：前后矛盾检测
- [ ] 创建 `features/resume/diagnostics/index.ts`：统一导出 + 编排
- [ ] 编写测试：每个子模块 ≥80% 覆盖率

### Task 1.4: 统一分析 API
- [ ] 创建 `app/api/resume/analyze/route.ts`（≤80行）
- [ ] 创建 `features/resume/analyzer.ts`：编排 parse + ats + match + diagnostics
- [ ] 编写集成测试

### Task 1.5: 工作台 UI
- [ ] 创建 `components/shared/resume/ResumeAnalyzer.tsx`：分析工作台主组件
- [ ] 创建 `components/shared/resume/ResumeRawCompare.tsx`：原文 vs 结构化对照
- [ ] 创建 `components/shared/resume/DiagnosticsPanel.tsx`：诊断结果面板
- [ ] 创建 `components/shared/jd/JdCard.tsx`：JD 结构化卡片
- [ ] 创建 `components/shared/resume/MatchGauge.tsx`：匹配度仪表盘
- [ ] 修改 `app/resume/page.tsx`：接入新组件

## Phase 2: 简历润色 + 面试指导

### Task 2.1: 上下文改写引擎
- [ ] 创建 `features/resume/rewriter/contextual-rewriter.ts`：基于匹配的改写
- [ ] 修改 `app/api/resume/rewrite/route.ts`：接入新改写引擎
- [ ] 编写测试

### Task 2.2: 改写 UI
- [ ] 创建 `components/shared/resume/StarRewritePanel.tsx`
- [ ] 创建 `components/shared/resume/RewriteDiff.tsx`
- [ ] 修改导出功能支持改写后内容

### Task 2.3: 面试模拟引擎
- [ ] 创建 `features/interview/coach/system-prompt.ts`：面试官 prompt 构建
- [ ] 创建 `features/interview/coach/evaluator.ts`：面试评估
- [ ] 创建 `features/interview/coach/session.ts`：会话管理
- [ ] 创建 `app/api/interview/coach/start/route.ts`
- [ ] 创建 `app/api/interview/coach/chat/route.ts`
- [ ] 创建 `app/api/interview/coach/report/route.ts`
- [ ] 编写测试

### Task 2.4: 面试模拟 UI
- [ ] 创建 `components/shared/interview/InterviewChat.tsx`
- [ ] 创建 `components/shared/interview/InterviewReport.tsx`
- [ ] 创建 `app/interview/page.tsx`：面试辅导页面

### Task 2.5: Prisma Schema
- [ ] 新增 `InterviewSession` model
- [ ] 运行 `prisma generate`

## Phase 3: 面经上传分析 + 统计面板

### Task 3.1: 面经解析引擎
- [ ] 创建 `features/interview/transcript/parser.ts`
- [ ] 创建 `features/interview/transcript/audio-split.ts`
- [ ] 创建 `app/api/interview/transcript/upload/route.ts`
- [ ] 编写测试

### Task 3.2: 面经分析引擎
- [ ] 创建 `features/interview/analysis/analyzer.ts`
- [ ] 创建 `features/interview/analysis/rag-enricher.ts`
- [ ] 创建 `app/api/interview/transcript/analyze/route.ts`
- [ ] 编写测试

### Task 3.3: 面经 UI
- [ ] 创建 `components/shared/interview/TranscriptUpload.tsx`
- [ ] 创建 `components/shared/interview/TranscriptCard.tsx`
- [ ] 创建 `components/shared/interview/TranscriptList.tsx`
- [ ] 创建 `components/shared/interview/AnalysisPanel.tsx`

### Task 3.4: 后台统计面板
- [ ] 创建 `server/analytics/queries.ts`
- [ ] 创建 `app/api/admin/analytics/route.ts`
- [ ] 创建管理后台统计页面组件
- [ ] Prisma: 新增 `AnalyticsEvent` model

### Task 3.5: 全量埋点接入
- [ ] 在 Phase 1/2 的所有关键操作点接入埋点

## 验证策略

每个 Phase 结束后：
1. `pnpm ts-check` — 0 错误
2. `pnpm lint` — 0 error（max-lines 和旧路径警告可接受）
3. `pnpm test` — 新增测试全部通过，覆盖率 ≥80%
4. 手动功能验证（dev server 启动后测试关键流程）

## 并行执行策略

- Phase 1 的 Task 1.1/1.2/1.3 可并行执行（3 个 agent）
- Task 1.4 依赖 1.2/1.3 完成后执行
- Task 1.5 可与 1.4 并行
- Phase 2 的 Task 2.1/2.3 可并行执行
- Phase 3 的 Task 3.1/3.4 可并行执行