# Phase 1 Spec: LLM 兜底 + 汇总验证

**日期**: 2026-06-15  
**目标**: 完成改造 J（LLM 兜底），确保 PDF 解析在 rule-based 失败时自动调用 LLM 重解析；执行全量汇总验证。  
**依赖**: Phase 1 A-I 已全部完成并通过测试。

---

## 1. 需求背景

当前 PDF 解析链（`pdf-parse` → `parseTextResume`）在以下场景会失败：
- 非标准格式 PDF（图片型、扫描件、复杂排版）
- 文本提取后结构混乱（无明确标题、字段粘连）
- 简历内容以段落形式呈现，无 bullet 或子节

当 rule-based 解析器输出空结构（无 name、无 experience、无 projects、无 skills）时，用户需要手动粘贴 Markdown 文本，体验差。

**LLM 兜底** 在 rule-based 失败后，自动调用 LLM 对原始文本进行结构化提取，提升解析成功率。

---

## 2. 功能需求

### 2.1 触发条件

当 `parseTextResume` 返回的 `ResumeDocument` 满足以下任一条件，且 `raw.length > 200` 时，触发 LLM 兜底：

```typescript
function shouldFallback(doc: ResumeDocument): boolean {
  return (
    !doc.basic.name &&
    doc.experience.length === 0 &&
    doc.projects.length === 0 &&
    doc.skills.length === 0 &&
    doc.raw.length > 200
  );
}
```

### 2.2 开关控制

- 环境变量 `RESUME_PDF_LLM_FALLBACK`（默认 `false`）
  - `true`: 启用 LLM 兜底
  - `false`: 禁用，直接返回 rule-based 结果（当前行为）
- `privacyMode === true` 时强制跳过 LLM 兜底

### 2.3 LLM 调用

- 调用 `LLMClient.invoke()` 一次
- Prompt 要求 LLM 从原始文本中提取结构化简历信息，输出 JSON
- 使用 zod schema 校验 LLM 输出
- 失败时回退到 rule-based 结果（不抛错）

### 2.4 输出标记

- `meta.source` 标记为 `'pdf+llm'`
- `meta.createdAt` 记录解析时间

### 2.5 隐私保护

- 本地模式（`privacyMode === true`）下禁用 LLM 兜底
- 环境变量文档化（`.env.local` 模板）

---

## 3. 技术方案

### 3.1 架构

```
PDF Upload
    ↓
pdf-parse → raw text
    ↓
parseTextResume → ResumeDocument (rule-based)
    ↓
shouldFallback? ──No──→ 返回结果
    ↓ Yes
RESUME_PDF_LLM_FALLBACK=true? ──No──→ 返回结果
    ↓ Yes
privacyMode=true? ──Yes──→ 返回结果
    ↓ No
LLMClient.invoke(prompt, raw) → JSON
    ↓
zod parse → ResumeDocument
    ↓
meta.source = 'pdf+llm'
    ↓
返回结果
```

### 3.2 Prompt 设计

```
你是一个简历解析专家。请从以下简历文本中提取结构化信息，输出 JSON。

要求：
1. 识别姓名、联系方式、工作经历、项目经历、教育经历、专业技能
2. 工作经历每项包含：公司名、职位、时间段、职责描述列表
3. 项目经历每项包含：项目名称、时间段、描述列表
4. 教育经历每项包含：学校、学位、时间段
5. 专业技能为字符串数组
6. 如果某字段无法识别，使用空字符串或空数组
7. 保持原文语言，不要翻译

输出格式（严格 JSON）：
{
  "name": "",
  "title": "",
  "city": "",
  "contact": {},
  "experience": [{"company":"","role":"","period":"","bullets":[]}],
  "projects": [{"name":"","period":"","bullets":[]}],
  "education": [{"school":"","degree":"","period":"","notes":[]}],
  "skills": []
}

简历文本：
---
{raw}
---
```

### 3.3 Zod Schema

```typescript
const LLMResumeSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  city: z.string().optional(),
  contact: z.record(z.string()).optional(),
  experience: z.array(z.object({
    company: z.string(),
    role: z.string(),
    period: z.string(),
    bullets: z.array(z.string()),
  })).optional().default([]),
  projects: z.array(z.object({
    name: z.string(),
    period: z.string().optional(),
    bullets: z.array(z.string()),
  })).optional().default([]),
  education: z.array(z.object({
    school: z.string(),
    degree: z.string(),
    period: z.string(),
    notes: z.array(z.string()).optional(),
  })).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
});
```

---

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/resume/parser-text.ts` | 修改 | 添加 `shouldFallback` + `llmFallbackParse` |
| `src/lib/resume/types.ts` | 修改 | `source` 类型增加 `'pdf+llm'` |
| `src/lib/resume/parser-text.test.ts` | 修改 | 新增 LLM 兜底测试 |
| `src/app/api/resume/parse/route.ts` | 修改 | 传入 `privacyMode` 参数 |
| `src/app/api/resume/parse/route.test.ts` | 修改 | 新增 LLM 兜底集成测试 |
| `.env.local.example` | 修改 | 添加 `RESUME_PDF_LLM_FALLBACK` 文档 |

---

## 5. 验收标准

### 5.1 功能验收

- [ ] `shouldFallback` 在空结构 + raw > 200 时返回 true
- [ ] `shouldFallback` 在结构非空时返回 false
- [ ] `shouldFallback` 在 raw <= 200 时返回 false
- [ ] LLM 兜底开关为 false 时不调用 LLM
- [ ] privacyMode 为 true 时不调用 LLM
- [ ] LLM 成功时返回结构化数据，meta.source = 'pdf+llm'
- [ ] LLM 失败时回退到 rule-based 结果
- [ ] zod 校验失败时回退到 rule-based 结果

### 5.2 测试验收

- [ ] `parser-text.test.ts` 新增 5 个 LLM 兜底测试，全部通过
- [ ] `route.test.ts` 新增 2 个集成测试，全部通过
- [ ] 全量测试 >= 650 通过
- [ ] `pnpm lint` 0 errors
- [ ] `pnpm ts-check` 通过

### 5.3 性能验收

- [ ] LLM 兜底调用 < 5s（含网络延迟）
- [ ] 不触发兜底时解析时间不变

---

## 6. 风险

| 风险 | 缓解 |
|------|------|
| LLM 调用增加成本 | 默认关闭，仅 rule-based 失败时触发 |
| LLM 输出格式不稳定 | zod 校验 + 失败回退 |
| PII 泄露风险 | privacy mode 强制跳过；开关默认关闭 |
| 增加解析延迟 | 仅在失败时触发，正常路径无影响 |
