# ReUp v2 — Resume Parser Integration (A3/A4/A6 整合)

**Date**: 2026-06-14
**Status**: Draft (pending user review)
**Branch**: `local-deploy`
**Supersedes (in part)**: 覆盖 spec §7.A A3/A4/A6 之间的"整合缺失"空白；不改 spec 其它部分

---

## 1. 背景

`spec §7.A` 列出了 5 个解析子任务（A1 schema / A2 text / A3 PDF / A4 Word / A5 MD / A6 dispatcher）。当前代码状态：

| 子任务 | 文件 | 状态 |
|---|---|---|
| A1 schema | `src/lib/resume/types.ts` | ✅ 完成 |
| A2 text | `src/lib/resume/parser-text.ts` | ✅ 完成（7 测试） |
| A3 PDF | `src/lib/resume/parser-pdf.ts` | ✅ 完成（7 测试，pdf-parse 已实装） |
| A4 Word | `src/lib/resume/parser-word.ts` | ✅ 完成（7 测试，mammoth 已实装） |
| A5 MD | `src/lib/resume/parser-md.ts` | ✅ 完成 |
| **A6 dispatcher** | `src/lib/resume/parser.ts` | ❌ **仍抛 `not yet implemented`** |
| **上传 UI** | `src/app/resume/page.tsx` | ❌ **客户端硬编码拦截**：175-180 行抛"PDF 解析器尚未接入" |
| **dispatcher 测试** | `src/lib/resume/parser.test.ts` | ⚠️ 两条测试**断言旧错误行为**（29-35 行） |

**症状**：用户上传 PDF → 客户端立即拦截，提示 `PDF 解析器尚未接入（等待 A3/A4 子任务落地），请先用 Markdown 或纯文本格式测试。`

**根因**：A3/A4 实装后没有触发整合。A6 dispatcher 不知道 A3/A4 已实装；上传 UI 不知道 dispatcher 已修。

---

## 2. 关键约束（先列硬约束）

1. **`pdf-parse` / `mammoth` 必须跑在 Node 端**：依赖 `Buffer` 和 pdfjs v1.10.100 的 CommonJS 模块；浏览器 bundle 不可行。
2. **不破坏 text/md 路径**：当前客户端解析 text/md 已能跑通，新方案不能让它们退化。
3. **不持久化上传二进制**（spec §3.4 G2 / §12 Risk "Resume privacy leak"）：服务端只放内存，函数返回即 GC。
4. **不破坏现有 14 个 PDF/Word 解析器测试**。
5. **Privacy mode 仍要走服务端**：trade-off 已写入 spec §13（隐私模式允许"短时内存处理 + 立即释放"）。

---

## 3. 设计

### 3.1 新增 `src/app/api/resume/parse/route.ts`（Node runtime）

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

POST /api/resume/parse
  Content-Type: multipart/form-data
  - file:  PDF/DOCX 二进制
  - source: 'pdf' | 'word'

200 { ok: true, doc: ResumeDocument }
400 { ok: false, error: 'missing_file' | 'missing_source' | 'invalid_source' | 'invalid_mime' | 'file_too_large' }
422 { ok: false, error: 'parse_failed', message: string }   // pdf-parse / mammoth 抛错
500 { ok: false, error: 'internal' }
```

- 限制 `file.size ≤ 10 * 1024 * 1024`（10MB）
- MIME 校验：`application/pdf` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- 调 `parseResume(buffer, source)`（dispatcher，**修后**真实调用 A3/A4）
- 错误透传 `pdf-parse` / `mammoth` 原始 `message` 字段（前端 §3.4 包装中文），**截断 200 字符**
- 不写盘、不入 RAG、不持久化

### 3.2 修 `src/lib/resume/parser.ts`（A6 dispatcher）

替换 62-72 行的 `throw new Error('... not yet implemented')` 为真实调用：

```ts
if (source === 'pdf')  return parsePdfResume(input as Buffer);
if (source === 'word') return parseWordResume(input as Buffer);
```

- `parsePdfResume` / `parseWordResume` 由**静态 import** 引入（不再 lazy）
- type guard：`Buffer.isBuffer(input)` 失败 → 抛 `TypeError`
- 与现有 `text` / `md` 分支风格一致

### 3.3 修 `src/app/resume/page.tsx`（上传 UI）

- **删除** 175-180 行 `if (source !== 'text' && source !== 'md')` 客户端拦截
- 新增 `parseUploadedFile(file: File, format: ResumeFormat): Promise<ResumeDocument>`：
  - `pdf` / `word`：构造 `FormData` → `POST /api/resume/parse` → 解析 JSON
  - `text` / `markdown`：维持现状，调 `parseResume(pastedText, source)`
- `onSubmit` 改用上述函数
- `handleFile` 不变：text/md 读 `file.text()` 入 textarea；pdf/word 占位文件名

### 3.4 错误信息（用户视角）

| 服务端 HTTP | 触发条件 | 页面展示（中文） |
|---|---|---|
| 400 invalid_mime | file MIME 不匹配 | `仅支持 PDF / DOCX 文件，请重新选择。` |
| 400 file_too_large | size > 10MB | `文件过大（>10MB），请压缩或拆分为单页。` |
| 422 parse_failed | `pdf-parse` / `mammoth` 抛错 | `PDF/Word 解析失败：<底层 message>。请用 Markdown/文本重试。` |
| fetch 失败 | 离线 / 5xx | `网络异常，未能上传到解析服务，请重试。` |

- 客户端包装错误：`r.ok === false` 时 `throw new Error(USER_FRIENDLY_MAP[json.error])`
- 422 透传 `message` 字段（已被限制在已知错误类别）

### 3.5 改 `src/lib/resume/parser.test.ts`（dispatcher 测试）

- **删除** 第 29-35 行两条断言 `not yet implemented` 的测试
- **新增** 两条：用 `vi.spyOn` 验证 `parsePdfResume` / `parseWordResume` 被调用
- 保留所有其它测试

### 3.6 新增 `src/app/api/resume/parse/route.test.ts`

- `@vitest-environment node`
- 复用 `parser-pdf.test.ts` 的 `pdfkit` fixture 模式（`renderPdf`）
- 复用 `parser-word.test.ts` 的手搓 minimal DOCX 模式（`buildMinimalDocx` + `buildZip`）
- 测试矩阵：
  - 200：PDF 解析 → `doc.meta.source === 'pdf'`
  - 200：DOCX 解析 → `doc.meta.source === 'word'`
  - 400：缺 `file`
  - 400：缺 `source`
  - 400：`source` 不在 `pdf|word`
  - 400：MIME 错（`text/plain`）
  - 400：超大 file（mock Buffer 11MB）
  - 422：损坏 PDF（`Buffer.from('garbage')`） → 透传 message

### 3.7 Privacy mode UX

服务端 route 不变（必然经服务端）。在 `page.tsx` 顶部 privacy 提示框加一行：

> 本地上传仍经服务端短暂处理后立即释放二进制，不持久化。

—— 已在 spec §13 声明的 trade-off。

---

## 4. 文件变更清单

| 类型 | 路径 | 行为 |
|---|---|---|
| 新增 | `src/app/api/resume/parse/route.ts` | 解析端点 |
| 新增 | `src/app/api/resume/parse/route.test.ts` | 端点测试 |
| 修改 | `src/lib/resume/parser.ts` | dispatcher 真实调用 A3/A4 |
| 修改 | `src/lib/resume/parser.test.ts` | 删旧断言 + 加新 spy 断言 |
| 修改 | `src/app/resume/page.tsx` | 删客户端拦截 + 走 API |

总计：**2 新 + 3 改**。共享度高，不需要并行子代理。

---

## 5. 验收（Acceptance Criteria）

- [ ] `pnpm ts-check` → 0 errors
- [ ] `pnpm lint` → 0 errors
- [ ] `pnpm test` → 所有现有测试 + 新测试通过
- [ ] 浏览器：`pnpm run dev` → 上传 `data/user-samples/resume/sample-resume.md` 转 PDF → 选择 PDF 格式 → 解析成功，preview 显示原文
- [ ] 浏览器：上传损坏 PDF（任意 .txt 改后缀） → 看到 `PDF/Word 解析失败：...` 中文提示，不崩页
- [ ] 浏览器：上传 >10MB 文件 → 看到 `文件过大` 提示
- [ ] 浏览器：text/md 路径不退化（粘贴文本仍可解析）
- [ ] `src/lib/resume/parser.test.ts` 不再含 `not yet implemented` 字样
- [ ] `grep -r 'not yet implemented' src/lib/resume` → 0 hits
- [ ] `grep -r '尚未接入' src/app/resume` → 0 hits
- [ ] Network tab：`/api/resume/parse` 返回 200，response 包含 `meta.source` 字段

---

## 6. 不在范围

- ❌ scanned PDF OCR（spec §2.2 v2.1 deferred）
- ❌ PDF/Word 二进制持久化（privacy 优先）
- ❌ 服务端 RAG 增强（解析与 RAG 解耦）
- ❌ 多文件并发上传
- ❌ PDF/Word 解析进度反馈（>5MB 才需要，先不做）

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `pdf-parse` 在 Next.js Edge runtime 不可用 | 已确认 | 阻塞 | `export const runtime = 'nodejs'` 强制 Node |
| 浏览器 bundle 拉入 `pdf-parse`/`mammoth` → 构建失败 | 中 | 中 | page.tsx 不再直接 import dispatcher 中的 PDF/Word 路径；走 fetch |
| 损坏 PDF 占用内存（10MB 上限内） | 低 | 低 | 10MB 硬限 + 不写盘 |
| 服务端暴露 PDF 内容日志 | 中 | 中 | route 中不打印 `file.buffer`；错误仅 message 透传 |
| Privacy mode 误以为不上传 | 低 | 低 | UI 顶部明确说明"短暂经服务端" |

---

## 8. 执行顺序

1. 写 `route.ts`（先有服务端入口）
2. 写 `route.test.ts`（TDD：先红后绿）
3. 修 `parser.ts` dispatcher（最小改动）
4. 修 `parser.test.ts`（更新断言）
5. 改 `page.tsx` UI（接入 API）
6. `pnpm ts-check && pnpm lint && pnpm test` 三连
7. 浏览器手测三种格式 + 两种错误
8. 提交（commit message：`fix(resume): wire A3/A4 parsers via /api/resume/parse (A6)`）

---

## 9. 关联文档

- 母 spec：`docs/superpowers/specs/2026-06-14-reup-v2-design.md` §7.A
- 现有解析器代码：`src/lib/resume/parser-{text,md,pdf,word}.ts`
- 现有解析器测试：`src/lib/resume/parser-{text,md,pdf,word}.test.ts`
- 现有 UI：`src/app/resume/page.tsx`
