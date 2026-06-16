# 管理后台与数据专项治理 — 第二轮 Spec（专家团审计修复）

> 分支: `fix/admin-data-governance-optimization`
> 日期: 2026-06-16
> 审计方式: 4 Agent 并行专家团（Logic & Correctness / Stability & Robustness / Performance / Architecture & Integration）

---

## CRITICAL 修复项

### C1-C3: preview-default 端点三重 bug

**现状:** `config/route.ts` 的 `action=preview-default` 端点：
1. 导入 `buildStarRewritePrompt` 但该函数未从 `star-rewriter.ts` 导出
2. 调用时缺少必需的 `resume: ResumeDocument` 参数
3. 返回 `{system, user}` 对象但前端期望 `string`

**修复:** 
- 改为从 `@/lib/resume/prompts/star` 导入 `buildStarRewritePrompt`（该模块直接导出）
- 构造一个最小 dummy resume 传入
- 只返回 `system` 字段作为 `defaultPrompt`

### C4: loadAllRecords() 无缓存

**现状:** 每次 API 调用都重新读取+解析 9MB JSON，5 个公开函数共享此路径。

**修复:** 参考 `rag-init.ts` 的 `ensureVectorStoreLoaded()` 模式，添加模块级 Promise 缓存，错误时清除缓存。

### C5: simplifyTitle / stripComplianceNotice 类型安全

**现状:** `if (!raw) return raw` 在 falsy 输入时返回 `undefined/null`，但签名声称 `string`。

**修复:** 改为 `if (!raw) return ''`，确保返回类型永远是 `string`。

### C6: handleViewFullText 竞态

**现状:** 快速点击不同 chunk 时，两个请求并发，响应顺序不确定，可能显示错误 chunk。

**修复:** 添加 `AbortController` + 请求序号 ref，忽略过期请求的响应。

### C7: knowledge/route.ts 无 try/catch

**现状:** 所有 switch case 直接 await 可能抛错的函数，无任何错误边界。

**修复:** 在 switch 外包裹 try/catch，返回 `{ error: 'internal_error' }` 500。

---

## HIGH 修复项

### H1: DOC_TITLE_OVERRIDES 应用于 sectionTitle

**现状:** `simplifyTitle()` 先查 `DOC_TITLE_OVERRIDES[raw]`，然后同时应用于 docTitle 和 sectionTitle。

**修复:** 拆分 `DOC_TITLE_OVERRIDES` 和 `SECTION_TITLE_OVERRIDES`，或增加 `onlyDocTitle` 参数控制。

### H2: stripComplianceNotice 正则 m 标志

**现状:** `m` 标志让 `^` 匹配任意行首，可能从 chunk 中间误删合规声明文本。

**修复:** 移除 `m` 标志，改用 `text.startsWith('>')` 预检 + 无标志正则，确保只匹配文本开头。

### H3: simplifyTitle 内联正则编译

**现状:** `stripNumberPrefix` 和 `stripOptimizedSuffix` 每次调用都编译新 RegExp。

**修复:** 提取为模块级常量。

### H4: 合规声明剥离不一致

**现状:** `toSummary()` 和 `getChunkFullText()` 剥离，但 `loadAllRecords()` 不剥离。

**修复:** 统一在 `loadAllRecords()` 的 `text` 字段剥离，`toSummary()` 和 `getChunkFullText()` 不再重复剥离。

### H5: handleToggleGroup 使用全文搜索

**现状:** 点击分组时用 `action=search&q=groupName` 做全文搜索，而非 `action=search&book=xxx` 分组过滤。

**修复:** 改为使用 `action=search` 并传递正确的 filter 参数（book/category/docTitle/sectionTitle）。

### H6: 错误信息暴露内部细节

**现状:** `config/route.ts:57` 使用 `String(err)` 返回错误详情。

**修复:** 改为 `'preview_failed'` 不暴露内部细节。

---

## MEDIUM 修复项

### M1: 接口重复定义

**现状:** `ChunkFullText` 和 `KnowledgeChunkSummary` 有 8 个重复字段。

**修复:** 提取 `ChunkBase` 接口。

### M2: persistToServer 静默吞错 + outline 无 useMemo

**现状:** auto-save 失败不提示用户；outline 在每次按键时重新计算。

**修复:** 添加错误 toast；`useMemo` 包裹 outline。