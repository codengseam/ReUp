# Checklist — 2026-06-15 Coze Removal & LLM Model Migration

> **Status**: in progress
> **Branch**: `local-deploy`
> **Goal**: 彻底移除 coze / 豆包系列模型；默认 Qwen 3.6 Plus（含自动 fallback 到 Qwen 3.6 Plus 不带后缀版本）+ 智谱 GLM-4.7-Flash；API 密钥通过 `data/.runtime-config.json` 安全存储，env-var 兜底，管理后台可替换；密钥永不出现在代码、log、API 响应中。

## P1 — Code (M3 必做)

- [ ] **C1** `src/lib/models.ts` —— 删除 `gui-plus-2026-02-26` / `doubao-seed-*` / `deepseek-v3-2` / `kimi-k2-5` / `glm-4-7` / `glm-5-0` / `minimax-m2-5` / `qwen-3-5-plus`；新增 `qwen3.6-plus-2026-04-02` / `qwen3.6-plus` / `GLM-4.7-Flash` 三条白名单
- [ ] **C2** `src/lib/intent-classifier.ts:161` —— 移除硬编码 `model: 'doubao-seed-2-0-lite-260215'`（让 LLMClient 使用 constructor 默认 + candidate 链）
- [ ] **C3** `src/lib/rag/route.ts:40, 115, 171` —— 移除三处 `model: 'doubao-seed-2-0-pro-260215'` / `model: 'doubao-seed-2-0-lite-260215'`
- [ ] **C4** `src/lib/rag/search.ts:102, 254, 351` —— 移除三处 `model: 'doubao-seed-2-0-lite-260215'` / `model: 'doubao-seed-2-0-pro-260215'`
- [ ] **C5** `src/lib/rag/safety.ts:67, 95, 189, 213, 243` —— 移除五处 `model: 'doubao-seed-2-0-pro-260215'`
- [ ] **C6** `src/app/api/chat/route.ts:25-46` —— 更新 `AllowedModelId` 字面量联合 + `ALLOWED_MODEL_IDS` 数组；`validateModel` 兜底改为 `qwen3.6-plus-2026-04-02`；让内置模型分支使用 `getModelCandidates` + `LLMClient.stream({ models: candidates })` 走自动 fallback
- [ ] **C7** `data/server-config.json` —— `defaultModelId` 改为 `qwen3.6-plus-2026-04-02`
- [ ] **C8** `data/.runtime-config.json` —— 写入真实 zhipu key（注意：此文件已在 `.gitignore`，不提交）

## P1 — Admin UI (M3 必做)

- [ ] **C9** `src/lib/runtime-config.ts` + `src/lib/runtime-config.test.ts` —— 已完成（见 commit）
- [ ] **C10** `src/lib/llm-client.ts` + `src/lib/llm-client.test.ts` —— 已完成（multi-candidate fallback）
- [ ] **C11** `src/app/api/admin/runtime-config/route.ts` (NEW) —— `GET` 返回掩码配置；`POST { apiKeys: { dashscope, zhipu } }` 替换（zod 校验），TDD
- [ ] **C12** `src/app/admin/_components/runtime-config-tab.tsx` (NEW) —— 列表 + 编辑 + 掩码展示 + 保存；测试用 `runtime-config-tab.test.tsx`
- [ ] **C13** `src/app/admin/_lib/types.ts` —— `TabKey` 新增 `'runtime-config'`
- [ ] **C14** `src/app/admin/page.tsx` —— `TAB_CONFIG` 新增 API Keys 条目（用 `KeyRound` 图标），`<TabsContent value="runtime-config">`

## P1 — Infra / Cleanup (M3 必做)

- [ ] **C15** `pnpm-lock.yaml` —— 验证 coze-coding-dev-sdk 是否真存在；如存在则 `pnpm install --no-frozen-lockfile` 重新生成（注意：本仓库不直接依赖该 SDK，应已不存在）
- [ ] **C16** `package.json` —— 确认无 coze / 豆包相关 dep（应已无）
- [ ] **C17** `.gitignore` —— 确认 `data/.runtime-config.json` 已在忽略列表（已加）
- [ ] **C18** 端到端验证：`pnpm ts-check && pnpm lint && pnpm test` 全部绿色
- [ ] **C19** 启动 dev server 验证：`pnpm run dev`，curl `POST /api/chat` 真发一条消息，收到 SSE 200 流式

## P2 — Optional (M3 之外)

- [ ] **O1** 文档：`docs/specs/2026-06-14-reup-roadmap-design.md` 移除 coze 段落（仅当 roadmap 仍引到 v1 旧模型时）
- [ ] **O2** README：移除"豆包 / coze 集成"宣传段（如有）

## 备注

- **fallback 链**：qwen3.6-plus-2026-04-02 → qwen3.6-plus（同 provider，同 key），GLM-4.7-Flash 单独成链
- **密钥安全**：`data/.runtime-config.json` 已 gitignore；GET 返回 `***MASKED***`；env-var 永远优先（便于 CI 覆盖）
- **backward compat**：单 candidate 模式（构造器 model 缺省）继续 throw 原始错误类型，避免破坏其他调用方
- **coze 残留**：`vitest.config.ts` / `next.config.ts` / `eslint.config.mjs` / `scripts/prepare.sh` 中的 coze 引用均为 Coze IDE 工程文件（`.cozeproj` / `*.dev.coze.site` / `coze check-bins`），与 LLM SDK 无关，**保留**
