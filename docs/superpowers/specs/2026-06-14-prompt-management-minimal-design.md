# 2026-06-14 Prompt 管理最小方案

## 目标

修复「管理后台提示词持久化显示 `keep me` 等无效值」的 bug，并在不拆分三层的前提下，
尝试为 system message 加上 **Prompt Caching 提示** 以降低 LLM 调用成本。

## 范围

- 保持 `customPrompt` 单字段模型
- 不拆分 IDENTITY/SOUL/AGENT（经讨论 ROI 不足；当前 1 产品 1 角色）
- 不动 8 个 Skill 定义、BLOCKED_RESPONSE 等代码内硬编码

## 设计

### §1 修复 keep me bug

**根因**：`data/server-config.json` 的 `prompt` 字段持久化了用户输入的测试值 "keep me"。
`prompt-tab.tsx` 加载时只检查 `data.customPrompt` 是否为真，不检查内容是否合理。

**修复**：

1. `data/server-config.json` 清空 `prompt` 字段（或保持为空字符串），由 `loadConfig()` 返回 `{}` → `getCustomPrompt()` 返回 `undefined` → `chat/route.ts` 走 `buildSkillPrompt` 默认路径
2. `prompt-tab.tsx` 增加 `customPrompt.trim() === ''` 兜底：空白值视为未设置
3. 「恢复默认」按钮已有（`handleReset`），把 `customPrompt` 写回 `DEFAULT_SYSTEM_PROMPT`。验证它能正常清掉"keep me"

**验收**：
- 后台点「恢复默认」→ 文本框回到完整默认 prompt → 刷新页面仍显示默认
- 文本框手动清空 → 点击保存 → 刷新 → 显示默认（不显示空）
- 文本框输入 "abc" → 保存 → 刷新 → 显示 "abc"（非空白时正常持久化）

### §2 可选：Prompt Caching 标注

**前提**：DashScope 兼容模式（OpenAI 协议）**不直接支持** `cache_control` 字段。
如果上游是 Anthropic 协议或某些支持 cache 标记的 Qwen 模型，可加。

**实现**（**条件性**）：
- 在 `LLMClient.stream()` 的 body 构造里，给 `messages[0]`（system message）加 `cache_control: { type: 'ephemeral' }` 字段
- 私有化封装：扩展 `Message` 类型为 `Message | { role, content, cache_control? }`，stream/invoke 透明转发
- 默认开启（因为是 "hint"，不影响不识别的 provider），日志记录 provider 是否回 `usage.cache_creation_input_tokens`

**验收**（如果实施）：
- 单测：`stream()` payload 第一个 message 含 `cache_control: { type: 'ephemeral' }`
- 集成测：Qwen GUI-Plus 实际跑一次，看 `usage` 是否带 `cache_*` 字段
- 若是 → 成本验证；否则 → 移除该字段，纯当 no-op

### §3 不做（明确 out-of-scope）

- ❌ 拆分 IDENTITY/SOUL/AGENT 三层（单产品 1 角色，ROI 不足）
- ❌ 后台 token 计数（YAGNI，可手动估算）
- ❌ 提示词版本对比 / diff 视图（C 方案内容）
- ❌ 提示词模板库（多 persona 切换）
- ❌ 后台可视化 prompt 拼装过程（动态 RAG 注入等）

## 数据流

```
[admin/提示词 tab]  POST /api/admin/config { key:'prompt', value:{customPrompt} }
  → saveConfig({ prompt: '...' })
  → data/server-config.json 落盘

[chat/route.ts POST]  loadConfig().prompt
  → 非空且 trim 后非空 → 走 customPrompt 分支
  → 否则 → buildSkillPrompt(ragResults) 默认路径
  → + 动态 RAG context + sensitive warning
  → allMessages[0] = system  ← LLMClient.stream 标 cache_control
```

## 测试

- `prompt-tab.tsx`：单元/集成测不必要（UI 改动小）
- `chat/route.ts`：`customPrompt` 空白 / null / "keep me" 三种 case 走默认路径
- `server-config.ts`：`loadConfig()` 解析坏 JSON 不抛错，返回 `{}`（已实现）
- `llm-client.ts`：`stream()` payload 包含 `cache_control`（条件性）

## 风险

- **缓存一致性**：如果改了 `DEFAULT_SYSTEM_PROMPT`，所有客户端缓存立即失效（一次性成本）
- **provider 兼容性**：DashScope Qwen 可能忽略 `cache_control` 字段（视为 no-op，不报错）
- **不向后兼容风险**：如果用户当前的 `prompt: "keep me"` 已经被改成了有意义的值，清空会丢数据 → 修复前先看 `data/server-config.json` 当前值

## 工作量

- §1 修复：~30 分钟
- §2 Prompt Caching：~1-2 小时（含调研 + 单测）
- 合计：~0.5 天
