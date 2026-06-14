# Prompt 管理最小修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `data/server-config.json` 持久化 "keep me" 脏值导致后台提示词显示为垃圾内容的问题，并防止空值/空白值再次被持久化展示。

**Architecture:** 单 prompt 配置模型不变。两层防御：数据层清掉现有脏值 + UI 层加空白兜底。

**Tech Stack:** Next.js 16 / React 19 / TypeScript / pnpm 9 / Vitest

---

## File 改动清单

| 文件 | 类型 | 责任 |
|---|---|---|
| `data/server-config.json` | 数据修复 | 移除脏 `prompt` 字段 |
| `src/app/admin/_components/prompt-tab.tsx` | UI 兜底 | 加载时空字符串回退到默认 |
| `src/app/admin/_components/prompt-tab.test.tsx` | 新建测试 | 覆盖空字符串/空白回退路径 |

---

### Task 1: 清理 `data/server-config.json` 中的脏值

**Files:**
- Modify: `data/server-config.json`

- [ ] **Step 1: 读取当前 `data/server-config.json` 确认脏值**

```bash
cat data/server-config.json
```

期望输出包含 `"prompt": "keep me"`（确认问题在）

- [ ] **Step 2: 用 Edit 工具把 `prompt: "keep me"` 字段删除**

old_string:
```json
  "prompt": "keep me",
  "updatedAt":
```

new_string:
```json
  "updatedAt":
```

- [ ] **Step 3: 验证 JSON 仍可解析**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/server-config.json','utf8'));console.log('ok')"
```

期望输出：`ok`

- [ ] **Step 4: 提交**

```bash
git add data/server-config.json
git commit -m "fix(prompt): clear stale 'keep me' value from server-config"
```

---

### Task 2: prompt-tab.tsx 加空白兜底（UI 防御）

**Files:**
- Modify: `src/app/admin/_components/prompt-tab.tsx:22-30`
- Create: `src/app/admin/_components/prompt-tab.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `src/app/admin/_components/prompt-tab.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PromptTab from './prompt-tab';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('PromptTab 空值兜底', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('当 customPrompt 是空字符串时,回退到 DEFAULT_SYSTEM_PROMPT', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customPrompt: '' }),
    } as unknown as Response);

    render(<PromptTab />);
    const textarea = await screen.findByRole('textbox');
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toContain('你是 ReUp');
    });
  });

  it('当 customPrompt 只有空白时,回退到默认', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customPrompt: '   \n  ' }),
    } as unknown as Response);

    render(<PromptTab />);
    const textarea = await screen.findByRole('textbox');
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toContain('你是 ReUp');
    });
  });

  it('当 customPrompt 是有意义的字符串时,正常显示', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customPrompt: '你是测试助手' }),
    } as unknown as Response);

    render(<PromptTab />);
    const textarea = await screen.findByRole('textbox');
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('你是测试助手');
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test -- --run src/app/admin/_components/prompt-tab.test.tsx 2>&1 | tail -30
```

期望：第 1、2 个测试 FAIL（因为当前 `if (data.customPrompt)` 判定空字符串为 truthy，但实际上不行——`''` 是 falsy，第 1 个会 PASS；第 2 个 `'   '` 是 truthy，会 FAIL）

> 实际预期：测试 1 PASS（空串 falsy 兜底已生效），测试 2 FAIL（空白串 truthy 不兜底），测试 3 PASS。这正说明修复的必要性。

- [ ] **Step 3: 修改 prompt-tab.tsx 加 trim 兜底**

打开 [prompt-tab.tsx](file:///Users/user/Downloads/reup/src/app/admin/_components/prompt-tab.tsx#L22-L30)，把：

```tsx
if (data.customPrompt) {
  setPrompt(data.customPrompt);
  setLocalPrompt(data.customPrompt);
  localPromptRef.current = data.customPrompt;
}
```

改成：

```tsx
const trimmed = typeof data.customPrompt === 'string' ? data.customPrompt.trim() : '';
if (trimmed) {
  setPrompt(trimmed);
  setLocalPrompt(trimmed);
  localPromptRef.current = trimmed;
}
```

- [ ] **Step 4: 跑测试确认全部通过**

```bash
pnpm test -- --run src/app/admin/_components/prompt-tab.test.tsx 2>&1 | tail -15
```

期望：`Tests 3 passed (3)`

- [ ] **Step 5: 跑全量测试确认无回归**

```bash
pnpm ts-check && pnpm test 2>&1 | tail -15
```

期望：`ts-check` 0 错；`pnpm test` 全部通过

- [ ] **Step 6: 提交**

```bash
git add src/app/admin/_components/prompt-tab.tsx src/app/admin/_components/prompt-tab.test.tsx
git commit -m "fix(prompt): trim whitespace fallback in admin prompt tab

Prevent empty/whitespace customPrompt from being shown as system prompt.
Falls back to DEFAULT_SYSTEM_PROMPT (defined in _lib/constants.ts)."
```

---

### Task 3: 验证"恢复默认"按钮

**Files:**
- 无代码改动（仅行为验证）

- [ ] **Step 1: 浏览器手动验证**

1. 访问 `http://localhost:8080/admin`，登录（如未配置 ADMIN_USERNAME/ADMIN_PASSWORD 用任意非空）
2. 进「提示词」tab
3. 文本框应该显示完整默认 prompt（不再是 "keep me"）
4. 文本框里随便输入"abc"
5. 点「保存」
6. 文本框显示 "abc"
7. 点「恢复默认」→ 确认弹窗 → 文本框回到完整默认
8. 刷新页面 → 仍显示完整默认

- [ ] **Step 2: 跑全量验证**

```bash
pnpm ts-check && pnpm lint --rule '{"@typescript-eslint/no-explicit-any":"warn"}' src/app/admin 2>&1 | tail -10
pnpm test 2>&1 | tail -10
```

期望都通过

---

## 验收清单

- [ ] `data/server-config.json` 不含 `prompt` 字段（或值为空字符串）
- [ ] `prompt-tab.tsx` 加载空白/空值时显示默认 prompt
- [ ] 单元测试 3 个 case 全过
- [ ] `pnpm ts-check && pnpm test` 全绿
- [ ] 浏览器「恢复默认」按钮工作正常

## 不在范围

- 不做 Prompt Caching（spec §2）
- 不拆 IDENTITY/SOUL/AGENT 三层（spec §3）
