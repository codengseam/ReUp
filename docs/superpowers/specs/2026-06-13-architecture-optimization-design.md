# BOSS Agent 架构优化 Design

**Date**: 2026-06-13
**Status**: Draft → Approved
**Context**: Coze 空间部署；优先字节系 API/SDK；纯个人项目

## 背景

当前 `src/lib/rag.ts` 1300+ 行单文件，`src/app/api/chat/route.ts` 570 行单文件，串行 LLM 调用 4-6 次/请求。稳定性、可控性、AI 产出均有改进空间。

## 目标（3 维）

| 维度 | 目标 |
|------|------|
| 稳定性 | RAG 不再单点超时；SSE 断线可重连；admin-stats 不锁文件 |
| 可控性 | Prompt/Skill/HOT_QUERIES 一处定义；admin 鉴权走后端；合并 4 个弱 LLM 调用 |
| AI 产出 | Citation 强制编号；置信度合理；用户反馈闭环 |

## 硬约束

1. **不破坏现有功能** —— 每阶段都跑 `pnpm ts-check` + `pnpm lint:build` + `pnpm test`，通过才进下一阶段
2. **字节系技术栈** —— 仅用 `coze-coding-dev-sdk` + Doubao + Coze Knowledge API；不引入 LangChain/Pinecone 等
3. **保持向后兼容** —— `INTENT_CLASSIFIER_MODE` 等关键开关支持 legacy fallback

## 4 阶段方案

### 阶段 1：稳定性急救
- 拆 `rag.ts` 为 4 文件（search / route / safety / cache）
- `sse-client.ts` 加指数退避重连
- RAG 检索超时分层（HyDE 5s / retrieve 6s / rerank 4s，总 10s 兜底）
- 缓存 key 加 `params 摘要` 防污染

### 阶段 2：LLM 调用瘦身
- 合并 `rewriteQuery` / `routeQuery` / `inferCategory` / `inputGuard(LLM 部分)` 为 `intent-classifier.ts`
- 单次 LLM 输出 JSON schema：`{ intent, rewrittenQuery, strategy, subQueries?, riskLevel, reason }`
- 通过 `INTENT_CLASSIFIER_MODE` 开关切换 `unified` / `legacy`

### 阶段 3：可控性加固
- 新增 `data/skills.json`：合并 `SKILL_PROMPTS` / `HOT_QUERIES` / `SUGGESTION_DB` / `QUICK_ENTRIES`
- `lib/skills-loader.ts` 启动加载 + schema 校验
- `lib/prompts/blocks.ts` 把 prompt 拆 `persona / constraints / format / examples / skill` 五块
- 新增 `/api/admin/auth` 路由 + bcrypt + httpOnly cookie；删除 `NEXT_PUBLIC_ADMIN_*` env
- `lib/url-safety.ts` 防 SSRF（拒绝内网 IP / metadata 域）

### 阶段 4：AI 产出优化
- Prompt 强制 AI 用 `[1][2]` 编号引用 Citation
- `formatMarkdown` 解析 `[1]` 并渲染为可点击链接
- 置信度改为线性打分：`RAG召回数 × Top1分数 × HOT命中 → 0-1`
- 新增 `lib/feedback-store.ts` 持久化 thumbsDown（`feedback.json`）

## 文件结构

```
src/lib/
├── rag/                    # 拆出
│   ├── index.ts            # 公开 retrieve() 入口
│   ├── search.ts           # semanticSearch / hybridSearch
│   ├── rerank.ts           # rerankResults
│   ├── route.ts            # routeQuery / intent-classifier
│   ├── safety.ts           # inputGuard / outputGuard / hallucinationCheck
│   └── cache.ts            # LRU 缓存
├── intent-classifier.ts    # 阶段 2 新增
├── sse-client.ts           # 阶段 1 新增
├── skills-loader.ts        # 阶段 3 新增
├── url-safety.ts           # 阶段 3 新增
├── feedback-store.ts       # 阶段 4 新增
├── prompts/blocks.ts       # 阶段 3 新增
└── (existing files)

data/
└── skills.json             # 阶段 3 新增

src/app/api/
├── chat/route.ts           # 阶段 1-4 增量修改
└── admin/auth/route.ts     # 阶段 3 新增

src/lib/__tests__/
├── rag/                    # 阶段 1 拆出对应测试
├── intent-classifier.test.ts  # 阶段 2
├── skills-loader.test.ts      # 阶段 3
└── feedback-store.test.ts     # 阶段 4
```

## 决策（D1-D4）

- D1 保留 legacy fallback，开关控制（采纳）
- D2 一次性切换 admin 鉴权，重新登录（采纳）
- D3 先存 JSON 文件，后续后台加 Tab（采纳）
- D4 阶段 1/2 加 vitest 单测，阶段 3/4 视情况（采纳）

## 验收标准

每阶段都需：
1. `pnpm ts-check` 通过
2. `pnpm lint:build` 通过
3. `pnpm test` 现有 22 + 新增全通过
4. 手工 `pnpm dev` 跑 1 轮对话不报错

## 风险与回退

| 风险 | 回退 |
|------|------|
| 拆 `rag.ts` 时漏 import | 保持 `src/lib/rag.ts` 作为 re-export shim 一段时间 |
| 合并 LLM 调用降低识别精度 | `INTENT_CLASSIFIER_MODE=legacy` 立即回退 |
| Admin 鉴权迁移丢登录态 | 保留旧 sessionStorage 路径 1 周观察期 |
| Citation 强制编号让 AI 啰嗦 | Prompt 软约束（"建议"而非"必须"） |

## 暂不做

- LangChain / LlamaIndex 集成
- Postgres / Redis 替换 JSON
- 第三方可观测平台
- 模型路由/熔断
