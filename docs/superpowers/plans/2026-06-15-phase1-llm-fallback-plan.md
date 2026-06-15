# Phase 1: LLM 兜底 + 汇总验证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成改造 J（LLM 兜底），确保 PDF 解析在 rule-based 失败时自动调用 LLM 重解析；执行全量汇总验证。

**Architecture:** 在 `parseTextResume` 出口处增加 `shouldFallback` 判断，条件满足时调用 `llmFallbackParse` 重解析。LLM 调用通过现有 `LLMClient` 封装，zod 校验输出，失败时静默回退。

**Tech Stack:** Next.js 16 + React 19 + TypeScript 5 + Vitest 4 + zod + DashScope Qwen

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/resume/parser-text.ts` | 核心解析器，新增 `shouldFallback` + `llmFallbackParse` |
| `src/lib/resume/types.ts` | ResumeDocument 类型定义，扩展 `source` 联合类型 |
| `src/lib/resume/parser-text.test.ts` | 单元测试：shouldFallback + llmFallbackParse mock 测试 |
| `src/app/api/resume/parse/route.ts` | API 路由，传入 privacyMode + fallback 开关 |
| `src/app/api/resume/parse/route.test.ts` | 集成测试：端到端 fallback 流程 |
| `.env.local.example` | 环境变量文档 |

---

## Task 1: 扩展 ResumeDocument 类型

**Files:**
- Modify: `src/lib/resume/types.ts`

- [ ] **Step 1: 修改 `ResumeSource` 类型**

```typescript
// 找到 ResumeSource 定义，扩展为：
export type ResumeSource = 'pdf' | 'word' | 'md' | 'text' | 'pdf+llm';
```

- [ ] **Step 2: 运行类型检查**

Run: `cd /workspace && pnpm ts-check`
Expected: PASS（无新增类型错误）

- [ ] **Step 3: Commit**

```bash
git add src/lib/resume/types.ts
git commit -m "types: add 'pdf+llm' to ResumeSource union"
```

---

## Task 2: 实现 shouldFallback 函数（TDD）

**Files:**
- Modify: `src/lib/resume/parser-text.ts`
- Modify: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `src/lib/resume/parser-text.test.ts` 末尾添加：

```typescript
describe('shouldFallback', () => {
  it('returns true when all core fields are empty and raw > 200', () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: 'a'.repeat(201),
    };
    expect(shouldFallback(doc)).toBe(true);
  });

  it('returns false when name exists', () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: { name: '张三' },
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: 'a'.repeat(201),
    };
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when experience exists', () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: {},
      experience: [{ company: 'A', role: 'B', period: 'C', bullets: [] }],
      projects: [],
      skills: [],
      education: [],
      raw: 'a'.repeat(201),
    };
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when raw <= 200', () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: 'a'.repeat(200),
    };
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when projects exist', () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [{ name: 'P', bullets: [] }],
      skills: [],
      education: [],
      raw: 'a'.repeat(201),
    };
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when skills exist', () => {
    const doc: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: ['Java'],
      education: [],
      raw: 'a'.repeat(201),
    };
    expect(shouldFallback(doc)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace && pnpm test -- src/lib/resume/parser-text.test.ts -t "shouldFallback" --reporter=verbose`
Expected: FAIL - "shouldFallback is not defined"

- [ ] **Step 3: 实现 shouldFallback**

在 `src/lib/resume/parser-text.ts` 末尾（`parseTextResume` 函数之后）添加：

```typescript
export function shouldFallback(doc: ResumeDocument): boolean {
  return (
    !doc.basic.name &&
    doc.experience.length === 0 &&
    doc.projects.length === 0 &&
    doc.skills.length === 0 &&
    doc.raw.length > 200
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace && pnpm test -- src/lib/resume/parser-text.test.ts -t "shouldFallback" --reporter=verbose`
Expected: 6/6 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser): add shouldFallback for LLM fallback trigger"
```

---

## Task 3: 实现 llmFallbackParse 函数（TDD）

**Files:**
- Modify: `src/lib/resume/parser-text.ts`
- Modify: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `src/lib/resume/parser-text.test.ts` 末尾添加：

```typescript
describe('llmFallbackParse', () => {
  it('returns structured doc when LLM returns valid JSON', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      name: '张三',
      title: '工程师',
      city: '北京',
      contact: { phone: '123' },
      experience: [{ company: 'A', role: 'B', period: 'C', bullets: ['d'] }],
      projects: [{ name: 'P', period: 'Q', bullets: ['r'] }],
      education: [{ school: 'S', degree: 'D', period: 'E', notes: ['f'] }],
      skills: ['Java'],
    });

    const raw = 'some long resume text...';
    const result = await llmFallbackParse(raw, mockLLM);

    expect(result.basic.name).toBe('张三');
    expect(result.basic.title).toBe('工程师');
    expect(result.basic.city).toBe('北京');
    expect(result.basic.contact?.phone).toBe('123');
    expect(result.experience).toHaveLength(1);
    expect(result.projects).toHaveLength(1);
    expect(result.education).toHaveLength(1);
    expect(result.skills).toEqual(['Java']);
    expect(result.meta.source).toBe('pdf+llm');
    expect(mockLLM).toHaveBeenCalledTimes(1);
  });

  it('returns fallback doc when LLM throws', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM error'));
    const raw = 'some text';
    const fallback: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: {}, experience: [], projects: [], skills: [], education: [], raw,
    };

    const result = await llmFallbackParse(raw, mockLLM, fallback);
    expect(result).toBe(fallback);
  });

  it('returns fallback doc when LLM returns invalid JSON', async () => {
    const mockLLM = vi.fn().mockResolvedValue({ invalid: 'data' });
    const raw = 'some text';
    const fallback: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
      basic: {}, experience: [], projects: [], skills: [], education: [], raw,
    };

    const result = await llmFallbackParse(raw, mockLLM, fallback);
    expect(result).toBe(fallback);
  });

  it('uses empty defaults when LLM returns partial data', async () => {
    const mockLLM = vi.fn().mockResolvedValue({ name: '李四' });
    const raw = 'some text';
    const result = await llmFallbackParse(raw, mockLLM);

    expect(result.basic.name).toBe('李四');
    expect(result.experience).toEqual([]);
    expect(result.skills).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace && pnpm test -- src/lib/resume/parser-text.test.ts -t "llmFallbackParse" --reporter=verbose`
Expected: FAIL - "llmFallbackParse is not defined"

- [ ] **Step 3: 实现 llmFallbackParse**

在 `src/lib/resume/parser-text.ts` 中 `shouldFallback` 之后添加：

```typescript
import { z } from 'zod';

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

type LLMInvokeFn = (prompt: string) => Promise<unknown>;

export async function llmFallbackParse(
  raw: string,
  llmInvoke: LLMInvokeFn,
  fallbackDoc?: ResumeDocument,
): Promise<ResumeDocument> {
  const prompt = `你是一个简历解析专家。请从以下简历文本中提取结构化信息，输出 JSON。

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
${raw}
---`;

  try {
    const response = await llmInvoke(prompt);
    const parsed = LLMResumeSchema.parse(response);

    return {
      meta: {
        version: 'reup.v2.phase3',
        source: 'pdf+llm',
        createdAt: new Date().toISOString(),
      },
      basic: {
        name: parsed.name,
        title: parsed.title,
        city: parsed.city,
        contact: parsed.contact,
      },
      experience: parsed.experience,
      projects: parsed.projects,
      education: parsed.education,
      skills: parsed.skills,
      raw,
    };
  } catch {
    return fallbackDoc ?? {
      meta: { version: 'reup.v2.phase3', source: 'text', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw,
    };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace && pnpm test -- src/lib/resume/parser-text.test.ts -t "llmFallbackParse" --reporter=verbose`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser): add llmFallbackParse with zod validation"
```

---

## Task 4: 在 parseTextResume 中集成 fallback 逻辑

**Files:**
- Modify: `src/lib/resume/parser-text.ts`

- [ ] **Step 1: 修改 parseTextResume 签名和出口**

将 `parseTextResume` 函数签名改为：

```typescript
export async function parseTextResume(
  input: string,
  options?: {
    enableLLMFallback?: boolean;
    privacyMode?: boolean;
    llmInvoke?: LLMInvokeFn;
  },
): Promise<ResumeDocument> {
```

在函数末尾（return doc 之前）添加：

```typescript
  const doc: ResumeDocument = {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: new Date().toISOString() },
    basic,
    experience,
    projects,
    skills,
    education,
    raw: input,
  };

  // LLM fallback
  if (
    options?.enableLLMFallback &&
    !options?.privacyMode &&
    shouldFallback(doc) &&
    options?.llmInvoke
  ) {
    return await llmFallbackParse(input, options.llmInvoke, doc);
  }

  return doc;
}
```

- [ ] **Step 2: 运行 parser-text 测试确认无回归**

Run: `cd /workspace && pnpm test -- src/lib/resume/parser-text.test.ts --reporter=verbose`
Expected: 30/30 PASS（原有 20 + shouldFallback 6 + llmFallbackParse 4）

- [ ] **Step 3: 运行 fixture 测试确认无回归**

Run: `cd /workspace && pnpm test -- src/lib/resume/parser-text-fixtures.test.ts --reporter=verbose`
Expected: 7/7 PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/resume/parser-text.ts
git commit -m "feat(parser): integrate LLM fallback into parseTextResume"
```

---

## Task 5: 更新 API 路由传入参数

**Files:**
- Modify: `src/app/api/resume/parse/route.ts`

- [ ] **Step 1: 读取当前 route.ts**

Read: `src/app/api/resume/parse/route.ts`

- [ ] **Step 2: 修改路由以传入 fallback 参数**

在 `parseTextResume(text)` 调用处改为：

```typescript
const enableLLMFallback = process.env.RESUME_PDF_LLM_FALLBACK === 'true';
const doc = await parseTextResume(text, {
  enableLLMFallback,
  privacyMode,
  llmInvoke: enableLLMFallback && !privacyMode
    ? (prompt) => LLMClient.invoke(prompt, { model: 'qwen-turbo' })
    : undefined,
});
```

- [ ] **Step 3: 运行 route 测试确认无回归**

Run: `cd /workspace && pnpm test -- src/app/api/resume/parse/route.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/api/resume/parse/route.ts
git commit -m "feat(api): wire LLM fallback into parse route"
```

---

## Task 6: 添加 API 集成测试

**Files:**
- Modify: `src/app/api/resume/parse/route.test.ts`

- [ ] **Step 1: 添加 fallback 集成测试**

在 `route.test.ts` 末尾添加：

```typescript
describe('POST /api/resume/parse with LLM fallback', () => {
  it('triggers LLM fallback when rule-based returns empty and fallback enabled', async () => {
    process.env.RESUME_PDF_LLM_FALLBACK = 'true';
    // Mock LLMClient
    vi.mocked(LLMClient.invoke).mockResolvedValueOnce({
      name: 'MockName',
      experience: [{ company: 'C', role: 'R', period: 'P', bullets: ['b'] }],
      skills: ['S'],
    });

    const form = new FormData();
    form.append('file', new File(['unstructured text that parser cannot handle'], 'test.txt', { type: 'text/plain' }));

    const req = new NextRequest('http://localhost/api/resume/parse', { method: 'POST', body: form });
    const res = await POST(req);
    const json = await res.json();

    expect(json.data.basic.name).toBe('MockName');
    expect(json.data.meta.source).toBe('pdf+llm');
    expect(LLMClient.invoke).toHaveBeenCalledTimes(1);

    delete process.env.RESUME_PDF_LLM_FALLBACK;
  });

  it('does not trigger fallback when privacy mode is on', async () => {
    process.env.RESUME_PDF_LLM_FALLBACK = 'true';
    process.env.NEXT_PUBLIC_PRIVACY_MODE = 'local-only';

    const form = new FormData();
    form.append('file', new File(['unstructured text'], 'test.txt', { type: 'text/plain' }));

    const req = new NextRequest('http://localhost/api/resume/parse', { method: 'POST', body: form });
    const res = await POST(req);
    const json = await res.json();

    expect(json.data.meta.source).toBe('text');
    expect(LLMClient.invoke).not.toHaveBeenCalled();

    delete process.env.RESUME_PDF_LLM_FALLBACK;
    delete process.env.NEXT_PUBLIC_PRIVACY_MODE;
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `cd /workspace && pnpm test -- src/app/api/resume/parse/route.test.ts --reporter=verbose`
Expected: 2/2 new tests + existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/resume/parse/route.test.ts
git commit -m "test(api): add LLM fallback integration tests"
```

---

## Task 7: 文档化环境变量

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: 添加 RESUME_PDF_LLM_FALLBACK 到示例文件**

```bash
# Resume Parser
# 启用 LLM 兜底：当 rule-based 解析器输出空结构时，自动调用 LLM 重解析
# 默认 false（关闭），开启会增加 LLM 调用成本
RESUME_PDF_LLM_FALLBACK=false
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: document RESUME_PDF_LLM_FALLBACK env var"
```

---

## Task 8: 汇总验证

- [ ] **Step 1: 全量测试**

Run: `cd /workspace && pnpm test --silent`
Expected: >= 660 PASS（原有 658 + 新增 12）

- [ ] **Step 2: Lint**

Run: `cd /workspace && pnpm lint`
Expected: 0 errors

- [ ] **Step 3: TypeCheck**

Run: `cd /workspace && pnpm ts-check`
Expected: PASS

- [ ] **Step 4: 最终 Commit**

```bash
git commit -m "feat(phase1): complete LLM fallback (J) + full validation

- Add shouldFallback() trigger logic
- Add llmFallbackParse() with zod validation
- Integrate into parseTextResume() and API route
- Add 12 new tests (unit + integration)
- Document RESUME_PDF_LLM_FALLBACK env var
- All 660+ tests pass, lint clean, typecheck clean"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] `shouldFallback` 触发条件 → Task 2
- [x] `llmFallbackParse` LLM 调用 + zod 校验 → Task 3
- [x] `parseTextResume` 集成 fallback → Task 4
- [x] API 路由传入参数 → Task 5
- [x] 集成测试 → Task 6
- [x] 环境变量文档 → Task 7
- [x] 汇总验证 → Task 8

### Placeholder Scan
- [x] 无 TBD/TODO
- [x] 所有步骤包含完整代码
- [x] 所有步骤包含运行命令和期望输出

### Type Consistency
- [x] `ResumeSource` 扩展 `'pdf+llm'`
- [x] `parseTextResume` 签名添加 `options`
- [x] `llmFallbackParse` 返回 `ResumeDocument`
