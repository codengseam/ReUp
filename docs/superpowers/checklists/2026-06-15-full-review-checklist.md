# ReUp 项目全面审查 Check List + Fix Plan

**日期**: 2026-06-15
**范围**: 全项目 `src/` 目录深度审查
**审查方法**: 5 Agent 并行 + 关键文件深入审查
**测试基线**: 688/689 通过（1 个 admin-knowledge Intl 预存失败）

---

## 发现问题汇总

| # | 严重级别 | 模块 | 文件 | 问题 |
|---|----------|------|------|------|
| R1 | High | chat | `resume-context.ts:8` | buildResumeContext 对空简历返回非空字符串 |
| R2 | Medium | jd | `parser.ts:37` | ruleBasedParse 标题提取无前缀时 fallback 为第一行（可能是空行或噪音） |
| R3 | Medium | jd | `smart-matcher.ts:47` | requiredYears 解析可能匹配错误数字 |
| R4 | Medium | jd | `parser.ts:40-47` | salaryMatch 正则匹配任意 `\d+k` 范围，误匹配 JD 中的其他数字 |
| R5 | Low | jd | `parser.ts:60-67` | eduMatch 匹配第一个学位词，可能匹配"大专在读"这类弱信号 |
| R6 | Medium | UI | `ExportButtons.tsx:141-143` | setTimeout 闭包引用陈旧 state |
| R7 | Medium | UI | `ExportButtons.tsx:160-161` | 导出失败 error 仅显示 status code，缺少 response body 解析 |
| R8 | Low | api | `export/route.ts` | 无 Zod schema 校验 `resume` 字段的实际结构（仅 validated as object） |
| R9 | Low | api | `export/route.ts:107-108` | PDF render uses pdfkit — no CJK support (已有 caveat 文档，但运行时仍会静默丢失中文字符) |
| R10 | Low | api | `export/route.ts` | 缺少测试文件（0 test coverage） |
| R11 | Low | api | `rewrite/route.ts` | 缺少测试文件（0 test coverage） |
| R12 | Low | chat | `resume-context.ts:28` | shouldInjectResume 关键词覆盖不足（不含"分析我的"、"评估"等） |

---

## 每个问题详细分析

### R1: buildResumeContext 对空简历返回非空字符串 (High)

**文件**: `src/lib/chat/resume-context.ts:7-27`

**证据**:
```typescript
export function buildResumeContext(resume: ResumeDocument | null): string {
  if (!resume) return '';
  const parts: string[] = ['[用户简历摘要]'];
  // ... adds to parts only when fields are present ...
  return parts.join('\n');
}
```

当 resume 不为 null 但所有字段为空（`basic: {}, experience: [], skills: []`）时，`parts` 只有 `['[用户简历摘要]']`，返回 `"[用户简历摘要]"`。

调用方（chat route 集成后）会检查 `if (resumeContext)` 决定是否注入，truthy 值会注入空语境。

**修复**: 添加 `parts.length > 1` 检查，无实际内容时返回 `''`。

---

### R2: ruleBasedParse 标题 fallback 取第一行 (Medium)

**文件**: `src/lib/jd/parser.ts:37-38`

**证据**:
```typescript
const title = titleMatch?.[1]?.trim() || raw.split('\n')[0]?.trim() || '未知职位';
```

当 JD 以空行、或 "我们是一家...公司" 开头，第一行不是职位名称。例如：

```
（知名互联网公司）
招聘高级工程师...
```

第一行 `（知名互联网公司）` 被误取为标题。

**修复**: 跳过纯括号行、已知非标题前缀行。

---

### R3: requiredYears 可能匹配到错误数字 (Medium)

**文件**: `src/lib/jd/smart-matcher.ts:47`

**证据**:
```typescript
const requiredYears = expReq ? parseInt(expReq.description.match(/\d+/)?.[0] || '0', 10) : 0;
```

`expReq.description` 来自 `ruleBasedParse`，值为 `"3年以上工作经验"` — 这里 `3` 是正确的。但如果 LLM 路径返回的描述是 `"5 年以上的 Python 经验"`，匹配到 `5`，没问题。

**但风险**: 如果描述是 `"应届生或 1-3 年经验"`，正则取第一个数字 `1`，而不是 `3`。

**修复**: 尝试匹配范围或取最大数字。

---

### R4: salaryMatch 误匹配非薪资数字 (Medium)

**文件**: `src/lib/jd/parser.ts:40-47`

**证据**:
```typescript
const salaryMatch = raw.match(/(\d+)[kK]?\s*[-~]\s*(\d+)[kK]?/);
```

此正则匹配任意 `数字k - 数字k` 组合。如果 JD 包含类似 "团队规模 10-20人" 或 "3-5 年经验"（不含 k），会误匹配。例如 "3-5 年经验" 会解析为 salary: {min: 3, max: 5}。

**修复**: 要求至少一个数字带 `k` 或 `K` 后缀，或前面有 `薪资`/`薪水`/`salary` 上下文。

---

### R5: eduMatch 匹配第一个学位词 (Low)

**文件**: `src/lib/jd/parser.ts:60-67`

**证据**:
```typescript
const eduMatch = raw.match(/(本科|硕士|博士|大专)(?:及以上)?/);
```

如果 JD 说 "本科优先，大专勿扰"，匹配到的可能是 "大专" 而不是 "本科"。

**修复**: 优先匹配最小学位（大专），不如改为取"最高学位"或加优先级排序。

---

### R6: ExportButtons setTimeout stale closure (Medium)

**文件**: `src/app/resume/_components/ExportButtons.tsx:141-143`

**证据**:
```typescript
setTimeout(() => {
  setCopied((cur) => (cur ? false : cur));
}, 1500);
```

回调使用了 `setCopied((cur) => (cur ? false : cur))`，这实际上是 no-op — `cur` 是 true 时设为 false，false 时设为 false（因为 `cur ? false : cur` → `false : false` = `false`）。实际上不需要函数式更新，`setCopied(false)` 就够了。但这不是 bug，只是冗余。

**实际风险**: 如果组件在 setTimeout 前 unmount，会有 state update warning。但没有 cleanup。

**修复**: 添加 cleanup（clearTimeout）在 useEffect return 中。不过这里用的是 useCallback，不是 useEffect。最简单的修复是检查组件是否仍然 mounted。

---

### R7: ExportButtons 错误信息不完整 (Medium)

**文件**: `src/app/resume/_components/ExportButtons.tsx:160-161`

**证据**:
```typescript
if (!res.ok) {
  throw new Error(`Export failed: ${res.status}`);
}
```

仅显示 HTTP status code，不读取 response body 中的错误详情（服务端返回 `{error: '...'}` JSON）。

**修复**: 尝试解析 response body，提取 `error` 字段。

---

### R8: export route Zod schema 不校验 resume 结构 (Low)

**文件**: `src/app/api/resume/export/route.ts:37-41`

**证据**:
```typescript
resume: z.custom<ResumeDocument>((v) => v !== null && typeof v === 'object', {
  message: 'resume must be an object',
}),
```

仅校验 `resume` 是 object，不校验其内部结构。用户可以发送 `{resume: {foo: "bar"}}` 通过校验，然后 export 函数可能 crash。

**修复**: 使用 partitial Zod schema 校验关键字段。

---

### R9-R12: 低优先级 — 文档/测试覆盖/增强

这些是已有文档记录的限制或测试覆盖率缺口，不产生运行时错误。
- R9: PDF 不支持 CJK（已有 caveat 文档）
- R10-R11: 测试覆盖缺口
- R12: 关键词覆盖不足（可后续扩展）

---

## 修复计划 (Fix Plan)

### 修复 R1: buildResumeContext 空简历返回空字符串

**文件**: `src/lib/chat/resume-context.ts`
**测试**: `src/lib/chat/resume-context.test.ts`

```typescript
// After building parts array, add check:
if (parts.length <= 1) return '';
return parts.join('\n');
```

新增测试：空字段简历返回空字符串。

---

### 修复 R2: ruleBasedParse 标题 fallback 增强

**文件**: `src/lib/jd/parser.ts`

在 `raw.split('\n')[0]` 的结果上增加过滤：
```typescript
const firstLine = raw.split('\n')[0]?.trim() || '';
const isNoise = /^[（(]|[）)]$|^[【\[]|^[\d]+[.、]/.test(firstLine);
const title = titleMatch?.[1]?.trim() || (isNoise ? '未知职位' : firstLine);
```

---

### 修复 R4: salaryMatch 防止误匹配

**文件**: `src/lib/jd/parser.ts`

```typescript
// Only match salary if preceded by salary keyword context
const salaryMatch = raw.match(/(?:薪资|薪水|薪酬|工资|salary)[^\n]{0,30}?(\d+)[kK]?\s*[-~]\s*(\d+)[kK]?/i)
  ?? (/(\d+)[kK]\s*[-~]\s*(\d+)[kK]/.test(raw)  // at least one has k suffix
    ? raw.match(/(\d+)[kK]?\s*[-~]\s*(\d+)[kK]?/)
    : null);
```

---

### 修复 R6: ExportButtons setTimeout cleanup

**文件**: `src/app/resume/_components/ExportButtons.tsx`

```typescript
const handleCopyMarkdown = useCallback(async () => {
  // ... copy logic ...
  setCopied(true);
  const timer = setTimeout(() => setCopied(false), 1500);
  // Cleanup handled by useRef + useEffect
}, [resume, starResult]);
```

Add a `useRef` + `useEffect` cleanup pattern.

---

### 修复 R7: ExportButtons 错误详情提取

**文件**: `src/app/resume/_components/ExportButtons.tsx`

```typescript
if (!res.ok) {
  let detail = `Export failed: ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) detail = body.error;
  } catch { /* ignore */ }
  throw new Error(detail);
}
```

---

## 执行步骤

- [ ] Task 1: 修复 R1 — buildResumeContext 空简历处理
- [ ] Task 2: 修复 R2 — ruleBasedParse 标题 fallback
- [ ] Task 3: 修复 R4 — salaryMatch 防止误匹配
- [ ] Task 4: 修复 R6 + R7 — ExportButtons 健壮性
- [ ] Task 5: 全量测试 + lint + typecheck 验证