# 管理后台与数据专项治理 Spec

> 分支: `fix/admin-data-governance-optimization`
> 日期: 2026-06-16
> 目标: 后台全部正确，配置和数据可管理

---

## 问题一：向量库分段/章节名不贴近段落意思

**现状：** `data/skill-vectors.json` 中 `doc_title` 和 `section_title` 字段使用原始章节编号名（如 "03_开篇词面试这样做会功到自然成" 33字、"01_面试现场未完待续2019_04_02" 21字、"大厂晋升指南（第4章优化版）" 15字），不够直观。

**修复方案：**
- 在 `admin-knowledge.ts` 的 `loadAllRecords()` 中维护一张 `doc_title` → 简称（≤20字）的映射表
- 同样处理 `section_title` → 简称映射
- 映射表覆盖全部 54 个 doc_title 和 151 个 section_title

**影响范围：** `src/lib/admin-knowledge.ts`

---

## 问题二：Skills 框架内容为空 + 报错

**根因分析：**
1. `tryReadSkillMarkdown()` 中使用 `process.cwd()` 拼接路径，在 Next.js server runtime 下 `cwd()` 可能不是项目根目录，导致 `skills/<id>/SKILL.md` 找不到 → 8 个 skill 都显示 markdown: null
2. `skills-loader.ts` 使用 `import skillsJson from '../../data/skills.json'` 静态导入正常，但 `getFrameworkSkills()` 的 markdown 加载依赖绝对路径

**修复方案：**
- 将 `tryReadSkillMarkdown` 的路径解析改用相对于模块文件的绝对路径（`path.resolve(__dirname, ...)` 或 `import.meta.url`），或使用 `process.env.PROJECT_ROOT || process.cwd()`
- 增加降级：当文件读取失败时，不从后端全量失败，而是返回 markdown: null + 明确错误信息

**影响范围：** `src/lib/admin-knowledge.ts`

---

## 问题三：简历改写提示词为空

**根因分析：**
这是**设计如此**，不是 bug。`prompt-tab.tsx` 中 STAR 改写 subtab 的 `defaultPrompt: ''`，`defaultIsRuntime: true`，因为真正的默认提示词由 `buildStarRewritePrompt()` 在运行时动态拼接（注入 skills 列表 + few-shot 示例）。

但用户看不到默认提示词内容，误以为是 bug。

**修复方案：**
- 在 STAR 改写 editor 区域增加 "预览默认提示词" 按钮
- 点击后调用 API 返回 `buildStarRewritePrompt()` 生成的默认 System Prompt 全文
- 同时保留 `defaultIsRuntime: true` 的行为（留空时回落到运行时默认）

**影响范围：** `src/app/admin/_components/prompt-tab.tsx`、`src/app/api/admin/config/route.ts` (add preview-default endpoint)

---

## 问题四：分类 tab 中展示合规声明

**根因分析：**
`data/book-sources/` 下每个 `.md` 文件第一行都是：
```
> ⚠️ **合规声明**：本项目及本文档仅用于个人学习...
```
这些声明在 chunk 切片时被包含进了 `skill-vectors.json` 的 `text` 字段（如 vector #0 text 以合规声明开头），导致搜索结果和分组展示中都会出现合规声明文本。

**修复方案：**
- 在 `admin-knowledge.ts` 的 `searchKnowledge()` 和 `listByGroup()` 返回的 `preview` 中，调用 `stripComplianceNotice()` 函数
- `stripComplianceNotice()` 检测并移除以 `> ⚠️ **合规声明**` 开头的块引用段落
- 不修改底层向量数据（避免重新 embedding），仅在展示层过滤

**影响范围：** `src/lib/admin-knowledge.ts`

---

## 问题五：按书×分类页点击查看分段详情

**现状：** `knowledge-tab.tsx` 展开分组时使用 `handleToggleGroup()`，它调用搜索 API，返回匹配 chunks 的 preview。但用户希望点击后能看到**完整的 chunk 原文**，而非只看到 preview。

**修复方案：**
- 新增 API action: `action=chunk-full-text&id=<chunkId>` 返回 chunk 完整原文
- 在 admin knowledge API route 中添加此 action
- 在 `knowledge-tab.tsx` 的展开区域增加 "查看详情" 按钮/link，弹出 modal 或内联展开完整文本

**影响范围：** `src/app/api/admin/knowledge/route.ts`、`src/lib/admin-knowledge.ts`、`src/app/admin/_components/knowledge-tab.tsx`