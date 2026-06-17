# ReUp 项目审计与 AI 面试提效平台重构方案

> 审计对象：`/workspace` (项目名 ReUp v2)
> 审计范围：源码 / 配置 / 数据 / Prompt / Skills / Admin / RAG / Resume / JD 模块
> 目标产品：**互联网/AI 行业面试提效平台**
> 报告日期：2026-06-15

---

## 0. 关键结论（TL;DR）

- **ReUp 不是一个普通 Chat 产品**，而是一个**面向中国互联网人职级晋升 / 面试准备的 AI 知识库 + Agent 平台**。底层已有完整的 RAG、Skill、LLM 抽象、管理后台。
- **你想要的"AI 面试提效平台"核心 8 大能力，ReUp 已经实现 5 个**（JD 解析、简历分析、简历润色、JD 匹配、面试 Skill），缺失的是：AI 模拟面试、面试复盘、Offer 概率、订阅付费、用户行为分析。
- **可直接复用率 ≈ 70%**，不是从 0 写，是 **重构 + 增量**。
- **最大的浪费**是把 ReUp 当 CMS 看 — 它的"领域数据"（晋升 Skill + 面试 Skill + 简历 + JD）已经沉淀在 `/skills` 与 `/data`，是新产品的核心资产。
- **最大风险**：当前架构是 **本地优先 + 纯客户端 / Next.js Serverless**，没有真正的数据库、没有用户体系、没有支付，做 SaaS 需补齐"账户 + 持久层 + 计费"。

---

## 第一部分：项目全景分析

### 1.1 项目定位

ReUp **实质是**：**垂直领域 AI 知识库 + Skill 驱动型 Agent 平台**（互联网职级晋升 / 面试准备方向）。

| 维度 | 判定 |
|---|---|
| 项目类型 | **Skill 驱动型垂直 AI Agent 平台**（非通用 Chat / 非 CMS） |
| 核心抽象 | `Skill(id, category, framework, steps, trigger)` — 8 个内置 Skill |
| 数据层 | 浏览器 localStorage + JSON 文件，**无数据库** |
| AI 形态 | 单 LLM 客户端 + RAG + Guard 双重安全 + 缓存 |
| 部署形态 | Next.js 14 App Router（Node Runtime），单进程无状态 |
| 商业模式 | 暂无（无 Auth / 无支付） |

定位标签组合：
- ✅ AI Chat（基础对话能力）
- ✅ Agent 平台（Skill 驱动的领域流程）
- ✅ RAG 系统（向量检索 + 缓存 + Guard）
- ✅ 知识库系统（Markdown 语料 + 元数据）
- ❌ SaaS 框架（缺账户/计费/多租户）
- ❌ CMS（不是内容站）
- ✅ Workflow 系统（Skill 步骤化）

### 1.2 技术栈

| 模块 | 技术 | 关键文件 / 配置 |
|---|---|---|
| 前端框架 | Next.js 14 (App Router) + React 18 + TypeScript | `package.json`, `next.config.ts` |
| UI 组件 | shadcn/ui + Radix UI + Lucide Icons + Tailwind CSS | `src/components/ui/*` |
| 状态管理 | React Hooks + localStorage (zustand 风格) | `src/lib/conversation-store.ts`, `feedback-store.ts` |
| 后端 | Next.js Route Handlers (Node Runtime) | `src/app/api/**/route.ts` |
| 运行时 | Node.js（PDF 解析需 Buffer + pdfjs CJS） | `src/app/api/resume/parse/route.ts:14` |
| 数据库 | ❌ **无**（使用 localStorage + JSON 文件） | `data/server-config.json`, `data/skills.json` |
| ORM | ❌ **无** | - |
| Auth | ❌ **无**（Admin 通过 Bearer Token + IP 白名单） | `src/lib/admin-auth.ts` |
| AI SDK | 自研 LLM 客户端（OpenAI 兼容协议） | `src/lib/llm-client.ts` |
| 多模型 | 6+ 内置 + 自定义 Provider | `src/lib/models.ts`, `src/app/admin/_lib/constants.ts` |
| Embedding | `@xenova/transformers` 本地推理（Xenova/all-MiniLM-L6-v2） | `src/lib/embedder.ts`, `patches/@xenova__transformers@2.17.2.patch` |
| 向量库 | 自研内存向量库（余弦相似度） | `src/lib/vector-store.ts` |
| ReRanker | 自研（基于 query-hit + 词频） | `src/lib/reranker.ts` |
| 缓存 | 内存 LRU（默认 1000 条） | `src/lib/rag/cache.ts` |
| 校验 | zod（Prompt/Config/Skills 全部 schema 化） | 多处 |
| 测试 | Vitest + 单元 + E2E + 端到端 admin auth | `vitest.config.ts`, `scripts/admin-auth-e2e.mjs` |
| Lint/Format | ESLint flat config | `eslint.config.mjs` |
| 部署 | 任意支持 Node 18+ 的平台（当前用脚本 `scripts/start.sh`） | - |
| 支付 | ❌ **无** | - |

### 1.3 目录结构分析

```
/workspace
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # 首页 (Chat 入口)
│   │   ├── layout.tsx                # 根布局
│   │   ├── resume/                   # 简历中心 (P2 已实现)
│   │   │   ├── page.tsx              # 上传/粘贴 简历
│   │   │   └── _components/          # 简历子组件
│   │   │       ├── ExportButtons.tsx
│   │   │       ├── JdInput.tsx
│   │   │       ├── MatchReportCard.tsx
│   │   │       ├── ParsePreview.tsx
│   │   │       └── StreamingResult.tsx
│   │   ├── admin/                    # 管理后台
│   │   │   ├── page.tsx              # 主框架 (Tabs 切换)
│   │   │   ├── layout.tsx
│   │   │   ├── _components/          # 7 个 Tab
│   │   │   │   ├── dashboard-tab.tsx       # 总览
│   │   │   │   ├── prompt-tab.tsx          # Prompt 管理
│   │   │   │   ├── model-tab.tsx           # 模型管理
│   │   │   │   ├── rag-tab.tsx             # RAG 配置
│   │   │   │   ├── knowledge-tab.tsx       # 知识库
│   │   │   │   ├── metadata-tab.tsx        # 元数据
│   │   │   │   ├── runtime-config-tab.tsx  # 运行时配置
│   │   │   │   └── framework-skills-tab.tsx# 框架技能
│   │   │   ├── _hooks/               # useAdminState
│   │   │   └── _lib/                 # types / utils / constants
│   │   └── api/                      # Route Handlers
│   │       ├── chat/route.ts              # Chat 主入口
│   │       ├── feedback/route.ts          # 反馈收集
│   │       ├── resume/                    # 简历相关 API
│   │       │   ├── parse/route.ts         # PDF/Word 解析
│   │       │   ├── rewrite/route.ts       # STAR 润色
│   │       │   ├── jd-keywords/route.ts   # JD 关键词提取
│   │       │   ├── match-report/route.ts  # 匹配报告
│   │       │   └── export/route.ts        # 导出
│   │       ├── admin/                     # Admin API
│   │       │   ├── auth/route.ts
│   │       │   ├── config/route.ts
│   │       │   ├── knowledge/route.ts
│   │       │   ├── runtime-config/route.ts
│   │       │   ├── skills/route.ts
│   │       │   └── stats/route.ts
│   │       └── test-connection/route.ts
│   ├── components/
│   │   ├── chat/                     # Chat UI 组件
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── CitationDrawer.tsx    # 引用抽屉
│   │   │   ├── ConversationSidebar.tsx
│   │   │   └── WelcomeScreen.tsx
│   │   └── ui/                       # shadcn/ui 套件
│   ├── lib/                          # 业务核心
│   │   ├── llm-client.ts             # 多 LLM 统一客户端
│   │   ├── embedder.ts               # 本地 Embedding
│   │   ├── vector-store.ts           # 内存向量库
│   │   ├── reranker.ts               # 重排序
│   │   ├── rag/                      # RAG 模块（重构后）
│   │   │   ├── index.ts              # 统一入口
│   │   │   ├── types.ts              # 类型
│   │   │   ├── cache.ts              # 内存缓存
│   │   │   ├── search.ts             # 向量搜索
│   │   │   ├── _retrieve-internal.ts # 检索主流程
│   │   │   ├── route.ts              # 路由
│   │   │   ├── safety.ts             # 输入/输出 Guard
│   │   │   ├── assess.ts             # 置信度评估
│   │   │   └── suggestions.ts        # 输入建议
│   │   ├── rag.ts                    # 向后兼容的旧入口
│   │   ├── skills-loader.ts          # Skills JSON 加载
│   │   ├── intent-classifier.ts      # 意图分类
│   │   ├── knowledge-base.ts         # 知识库抽象
│   │   ├── conversation-store.ts     # 会话持久化
│   │   ├── feedback-store.ts         # 反馈持久化
│   │   ├── runtime-config.ts         # 运行时配置
│   │   ├── server-config.ts          # 服务端配置
│   │   ├── admin-auth.ts             # Admin 鉴权
│   │   ├── admin-knowledge.ts        # 知识库管理
│   │   ├── admin-stats.ts            # 统计
│   │   ├── models.ts                 # 模型抽象
│   │   ├── category-rules.ts         # 分类规则
│   │   ├── url-safety.ts             # SSRF 防护
│   │   ├── error-classifier.ts       # 错误分类
│   │   ├── typo-correction.ts        # 拼写纠错
│   │   ├── rag-init.ts               # 启动初始化
│   │   ├── chat/
│   │   │   └── resume-context.ts     # Chat 中的简历上下文注入
│   │   ├── jd/                       # JD 解析（新增）
│   │   │   ├── parser.ts             # LLM + 规则回退
│   │   │   ├── smart-matcher.ts      # 智能匹配
│   │   │   └── types.ts
│   │   ├── resume/                   # 简历模块（已完整）
│   │   │   ├── types.ts              # ResumeDocument
│   │   │   ├── parser.ts             # 统一入口
│   │   │   ├── parser-pdf.ts         # pdf-parse
│   │   │   ├── parser-word.ts        # mammoth
│   │   │   ├── parser-md.ts          # markdown
│   │   │   ├── parser-text.ts        # 纯文本 + LLM 回退
│   │   │   ├── storage.ts            # localStorage
│   │   │   ├── privacy.ts            # 隐私模式
│   │   │   ├── ats.ts                # ATS 评分
│   │   │   ├── matcher.ts            # 简历 vs JD
│   │   │   ├── star-rewriter.ts      # STAR 重写
│   │   │   ├── diff.ts               # 差异对比
│   │   │   ├── iteration.ts          # 迭代历史
│   │   │   ├── export-pdf.ts         # PDF 导出
│   │   │   ├── export-docx.ts        # Word 导出
│   │   │   ├── export-md.ts          # Markdown 导出
│   │   │   ├── admin-config.ts       # 简历配置
│   │   │   ├── prompts/
│   │   │   │   ├── match.ts          # 匹配 Prompt
│   │   │   │   └── star.ts           # STAR Prompt
│   │   │   ├── examples/             # Few-shot 示例
│   │   │   └── __tests__/            # 完整测试套件
│   │   └── prompts/blocks.ts         # Prompt 块
│   ├── hooks/                        # 通用 Hook
│   ├── server.ts                     # 自定义服务器入口
│   └── test-setup.ts
├── data/                             # 静态数据
│   ├── skills.json                   # Skill 中心化定义
│   ├── skill-vectors.json            # Skill 预计算向量
│   ├── server-config.json            # 服务端配置
│   ├── book-sources/                 # 知识源（晋升 + 面试）
│   │   ├── 大厂晋升指南/*.md         # 16 个章节
│   │   └── 面试现场/*.md             # 31 个章节
│   ├── resume-eval/                  # 简历评估样本
│   └── user-samples/                 # 用户样例
├── skills/                           # 8 个 Framework Skill
│   ├── blind-spot-navigation/        # 盲点导航
│   ├── competency-model-alignment/   # 能力模型对齐
│   ├── highlight-extractor/          # 亮点提取
│   ├── jinsheng-dicing-luoji/        # 晋升底层逻辑
│   ├── jinsheng-san-yuanze/          # 晋升三原则
│   ├── nengli-sanzhong-jingjie/      # 能力三重境界
│   ├── p8-lingyu-zhuanjia/           # P8 领域专家
│   └── reverse-questioning-framework/# 反问框架
├── scripts/                          # 运维脚本
├── docs/                             # 设计文档 + Spec
│   ├── rules/efficiency.md
│   └── specs/                        # 21 份历史 Spec
│   └── superpowers/                  # 开发流程 Checklists
├── patches/                          # npm 补丁
└── public/                           # 静态资源
```

**目录职责总结**：

| 目录 | 职责 | 重构时动作 |
|---|---|---|
| `src/app/api/**` | API 入口 | **保留** + 加 `/api/auth/*`, `/api/billing/*` |
| `src/lib/rag/**` | RAG 核心 | **保留**，加多租户隔离 |
| `src/lib/resume/**` | 简历领域逻辑 | **保留**，加 Resume Table 持久化 |
| `src/lib/jd/**` | JD 领域逻辑 | **保留**，加 JD Table 持久化 |
| `src/lib/chat/resume-context.ts` | Chat 简历注入 | **保留** |
| `src/app/admin/**` | Admin 前端 | **保留框架**，补 Offer / 行为分析 Tab |
| `src/app/resume/**` | 简历中心 UI | **保留**为 `/resume-center` |
| `data/skills.json` | 8 个 Skill | **保留** + 扩展面试 Skill |
| `data/book-sources/` | 知识源 | **保留** + 加面试知识源 |
| `skills/*` | Framework Skill 库 | **保留** + 加面试 Skill |

---

## 第二部分：功能盘点

### 2.1 用户系统

| 功能 | 状态 | 复用度 | 备注 |
|---|---|---|---|
| 登录 | ❌ 无 | - | 需新建 |
| 注册 | ❌ 无 | - | 需新建 |
| OAuth | ❌ 无 | - | 需新建（GitHub/Google/微信） |
| 权限 | ⚠️ 仅 Admin Bearer Token | 部分 | `src/lib/admin-auth.ts` |

**重构成本**：中。需要新建 `User` 表 + Auth Provider 抽象 + 中间件。

### 2.2 AI 系统

| 功能 | 文件 | 完整性 | 复用度 |
|---|---|---|---|
| Chat | `src/app/api/chat/route.ts` | ✅ 完整 | **高** |
| Agent | `src/lib/skills-loader.ts` + `data/skills.json` | ✅ 完整 | **高** |
| Tool Calling | ❌ 无显式 Tool Calling 抽象 | - | 需新增 |
| Prompt | `src/lib/resume/prompts/`, `src/lib/prompts/blocks.ts` | ✅ 完整 | **高** |
| Memory | `src/lib/conversation-store.ts` (localStorage) | ⚠️ 本地化 | **中**，需迁库 |
| Streaming | 客户端 fetch stream | ✅ | **高** |
| 意图分类 | `src/lib/intent-classifier.ts` | ✅ | **高** |
| 多 LLM | `src/lib/llm-client.ts` | ✅ | **高** |

### 2.3 RAG 系统

| 功能 | 文件 | 完整性 | 复用度 |
|---|---|---|---|
| Embedding | `src/lib/embedder.ts` (Xenova/transformers, 本地) | ✅ 完整 | **高** |
| 向量检索 | `src/lib/vector-store.ts` + `src/lib/rag/search.ts` | ✅ 完整 | **高** |
| Chunk | `src/lib/knowledge-base.ts` | ✅ 完整 | **高** |
| ReRank | `src/lib/reranker.ts` | ⚠️ 简单规则 | **中**，可升级 Cross-Encoder |
| Cache | `src/lib/rag/cache.ts` (LRU 1000) | ✅ | **高** |
| Guard | `src/lib/rag/safety.ts` (输入/输出) | ✅ | **高** |
| Hot Query | `src/lib/rag/assess.ts` | ✅ | **高** |

**架构亮点**（可直接复用）：
- **Skill 预计算向量** (`data/skill-vectors.json`)：避免 Skill 路由时再 Embed
- **Intent 预计算** (`precomputed: PrecomputedIntent`)：减少重复分类
- **双层 Guard**：inputGuard + outputGuard + hallucinationCheck
- **缓存 Key 包含 topK + history**：避免被粗粒度 Key 污染

### 2.4 知识库

| 功能 | 文件 | 完整性 | 复用度 |
|---|---|---|---|
| 上传 | `src/lib/admin-knowledge.ts` | ✅ | **高** |
| 删除 | `src/lib/admin-knowledge.ts` | ✅ | **高** |
| 更新 | `src/lib/admin-knowledge.ts` | ✅ | **高** |
| 切分 | `src/lib/knowledge-base.ts` | ✅ | **高** |
| 元数据 | `data/skill-vectors.json` + Skill `category` 字段 | ✅ | **高** |
| 关联 Skill | Skill `id` 关联 | ✅ | **高** |

### 2.5 后台系统

| 功能 | 文件 | 完整性 | 复用度 |
|---|---|---|---|
| 仪表盘 | `src/app/admin/_components/dashboard-tab.tsx` | ✅ | **高** |
| Prompt 管理 | `src/app/admin/_components/prompt-tab.tsx` | ✅ | **高** |
| 模型管理 | `src/app/admin/_components/model-tab.tsx` | ✅ | **高** |
| RAG 配置 | `src/app/admin/_components/rag-tab.tsx` | ✅ | **高** |
| 知识库 | `src/app/admin/_components/knowledge-tab.tsx` | ✅ | **高** |
| 元数据 | `src/app/admin/_components/metadata-tab.tsx` | ✅ | **高** |
| 运行时配置 | `src/app/admin/_components/runtime-config-tab.tsx` | ✅ | **高** |
| 框架技能 | `src/app/admin/_components/framework-skills-tab.tsx` | ✅ | **高** |
| 行为分析 | ❌ | - | 需新增 |
| Offer 管理 | ❌ | - | 需新增 |
| 订阅管理 | ❌ | - | 需新增 |

### 2.6 简历系统（已有完整实现）

| 功能 | 文件 | 完整性 | 复用度 |
|---|---|---|---|
| 上传 | `src/app/resume/page.tsx` | ✅ | **高** |
| 多格式解析 | `src/lib/resume/parser-pdf.ts`, `parser-word.ts`, `parser-md.ts`, `parser-text.ts` | ✅ | **高** |
| 结构化展示 | `src/app/resume/_components/ParsePreview.tsx` | ✅ | **高** |
| STAR 润色 | `src/lib/resume/star-rewriter.ts` | ✅ | **高** |
| 隐私模式 | `src/lib/resume/privacy.ts` | ✅ | **高** |
| 导出 | `export-pdf.ts`, `export-docx.ts`, `export-md.ts` | ✅ | **高** |
| 迭代历史 | `src/lib/resume/iteration.ts` | ✅ | **高** |
| ATS 评分 | `src/lib/resume/ats.ts` | ✅ | **高** |

### 2.7 JD / 匹配系统

| 功能 | 文件 | 完整性 | 复用度 |
|---|---|---|---|
| JD 解析 | `src/lib/jd/parser.ts` (LLM + 规则回退) | ✅ | **高** |
| 关键词提取 | `src/app/api/resume/jd-keywords/route.ts` | ✅ | **高** |
| 简历-JD 匹配 | `src/lib/resume/matcher.ts` | ✅ | **高** |
| 智能匹配 | `src/lib/jd/smart-matcher.ts` | ✅ | **高** |
| 匹配报告 | `src/app/api/resume/match-report/route.ts` | ✅ | **高** |

### 2.8 支付系统

| 功能 | 状态 | 备注 |
|---|---|---|
| Stripe | ❌ 无 | 需新增 |
| 订阅 | ❌ 无 | 需新增 |
| 限额 | ⚠️ 部分（`admin-stats.ts` 有调用计数） | 可复用 |

### 2.9 关键能力完整度总览

| 能力 | 状态 | 文件证据 |
|---|---|---|
| JD 解析 | ✅ | `src/lib/jd/parser.ts` |
| 简历分析 | ✅ | `src/lib/resume/parser.ts` |
| 简历润色 | ✅ | `src/lib/resume/star-rewriter.ts` |
| JD 匹配度分析 | ✅ | `src/lib/resume/matcher.ts`, `smart-matcher.ts` |
| AI 模拟面试 | ❌ | - |
| 面试复盘 | ❌ | - |
| 面试提升计划 | ⚠️ | 间接通过 8 个 Skill 覆盖 |
| Offer 概率分析 | ❌ | - |
| 后台运营系统 | ✅ | `src/app/admin/*` |
| 用户行为分析 | ❌ | 需新增 |
| Prompt 管理 | ✅ | `src/app/admin/_components/prompt-tab.tsx` |
| 模型管理 | ✅ | `src/app/admin/_components/model-tab.tsx` |
| 订阅付费 | ❌ | 需新增 |

---

## 第三部分：数据库分析

### 3.1 当前数据存储

**事实**：ReUp **完全没有数据库**。所有持久化都依赖：
- **localStorage**（浏览器）：会话、反馈、简历、模型配置
- **JSON 文件**（服务端）：Skill、Knowledge、Server Config
- **内存**（进程）：向量库、缓存、统计

### 3.2 当前"数据模型"（隐式）

| 逻辑实体 | 当前存储 | 文件 |
|---|---|---|
| Skill | JSON | `data/skills.json` |
| Knowledge Chunk | 内存 + 持久化到 `data/skill-vectors.json` | `src/lib/knowledge-base.ts` |
| Conversation | localStorage | `src/lib/conversation-store.ts` |
| Message | localStorage (随 Conversation) | `src/lib/conversation-store.ts` |
| Feedback | localStorage | `src/lib/feedback-store.ts` |
| Resume | localStorage | `src/lib/resume/storage.ts` |
| Resume Iteration | localStorage | `src/lib/resume/iteration.ts` |
| Admin Stats | 内存 + 持久化到 `data/server-config.json` | `src/lib/admin-stats.ts` |
| Custom Provider | localStorage | `src/app/admin/_hooks/use-admin-state.ts` |
| Activity Log | localStorage | `src/app/admin/_hooks/use-admin-state.ts` |

### 3.3 复用评估

| 存储 | 复用度 | 重构建议 |
|---|---|---|
| `data/skills.json` | ✅ **直接复用** | 保留，可加 version 字段 |
| `data/skill-vectors.json` | ✅ **直接复用** | 保留 |
| `data/server-config.json` | ⚠️ 改为 DB | Server Config 是单例，可保留 JSON 或入 DB |
| `data/book-sources/` | ✅ **直接复用** | RAG 语料不变 |
| `ResumeDocument` schema (Zod) | ✅ **直接复用** | `src/lib/resume/types.ts` |
| `JDDocument` schema (Zod) | ✅ **直接复用** | `src/lib/jd/types.ts` |

### 3.4 新增数据表（推荐 Prisma + PostgreSQL）

#### 核心业务表

```prisma
// === 用户与认证 ===
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  hashedPassword  String?
  name            String?
  avatar          String?
  // OAuth
  githubId        String?  @unique
  wechatOpenId    String?  @unique
  // 订阅
  plan            Plan     @default(FREE)
  planExpiresAt   DateTime?
  stripeCustomerId String? @unique
  // 关系
  resumes         Resume[]
  jds             JobDescription[]
  interviews      InterviewSession[]
  reviews         InterviewReview[]
  plans           ImprovementPlan[]
  predictions     OfferPrediction[]
  conversations   Conversation[]
  feedbacks       Feedback[]
  behaviors       UserBehavior[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum Plan {
  FREE
  PRO
  PREMIUM
}

// === 简历 ===
model Resume {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  name            String   // 简历标题
  source          String   // pdf / word / md / text
  rawText         String   @db.Text
  document        Json     // ResumeDocument 序列化
  // ATS & 评分
  atsScore        Float?
  // 关系
  analyses        ResumeAnalysis[]
  matches         ResumeMatchReport[]
  iterations      ResumeIteration[]
  jdMatches       ResumeJDMatch[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([userId])
}

model ResumeAnalysis {
  id              String   @id @default(cuid())
  resumeId        String
  resume          Resume   @relation(fields: [resumeId], references: [id])
  // 分析维度
  overallScore    Float
  strengths       Json     // string[]
  weaknesses      Json     // string[]
  suggestions     Json     // {category, content}[]
  redFlags        Json     // string[]
  keywordCoverage Json     // {keyword, hit: bool}[]
  llmTraceId      String?  // 链路追踪
  createdAt       DateTime @default(now())
  @@index([resumeId])
}

model ResumeIteration {
  id              String   @id @default(cuid())
  resumeId        String
  resume          Resume   @relation(fields: [resumeId], references: [id])
  version         Int
  diffFromPrev    Json     // DiffItem[]
  starRewrite     Json?    // StarRewriteResult
  trigger         String?  // 'star' | 'jd' | 'manual'
  createdAt       DateTime @default(now())
  @@index([resumeId, version])
}

// === JD ===
model JobDescription {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  title           String
  company         String?
  rawText         String   @db.Text
  document        Json     // JDDocument
  // 关系
  matches         ResumeJDMatch[]
  interviews      InterviewSession[]
  createdAt       DateTime @default(now())
  @@index([userId])
}

model ResumeJDMatch {
  id              String   @id @default(cuid())
  resumeId        String
  jdId            String
  resume          Resume   @relation(fields: [resumeId], references: [id])
  jd              JobDescription @relation(fields: [jdId], references: [id])
  // 匹配结果
  overallScore    Float
  hardSkillScore  Float
  experienceScore Float
  educationScore  Float
  missing         Json     // {category, detail}[]
  highlights      Json     // string[]
  report          Json     // MatchReport
  createdAt       DateTime @default(now())
  @@unique([resumeId, jdId])
  @@index([resumeId])
  @@index([jdId])
}

// === 模拟面试 ===
model InterviewSession {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  jdId            String?  // 关联 JD
  jd              JobDescription? @relation(fields: [jdId], references: [id])
  resumeId        String?  // 关联简历
  type            InterviewType
  level           String?  // P5/P6/P7/校招/社招
  status          SessionStatus @default(IN_PROGRESS)
  // 配置
  config          Json     // {duration, focus, difficulty}
  startedAt       DateTime @default(now())
  endedAt         DateTime?
  // 关系
  questions       InterviewQuestion[]
  review          InterviewReview?
  @@index([userId, status])
}

enum InterviewType {
  TECHNICAL       // 技术面
  BEHAVIORAL      // 行为面
  CASE            // 案例面
  SYSTEM_DESIGN   // 系统设计
  MIXED           // 综合
}

enum SessionStatus {
  IN_PROGRESS
  COMPLETED
  ABANDONED
}

model InterviewQuestion {
  id              String   @id @default(cuid())
  sessionId       String
  session         InterviewSession @relation(fields: [sessionId], references: [id])
  order           Int
  category        String   // 算法/系统设计/项目/行为
  difficulty      Int      // 1-5
  question        String   @db.Text
  // 提示
  hints           Json?    // string[]
  // 期望答案
  referenceAnswer String?  @db.Text
  // 用户回答
  userAnswer      String?  @db.Text
  userAnswerAt    DateTime?
  audioUrl        String?  // 语音回答
  // 评分
  score           Float?   // 0-10
  evaluation      Json?    // {strengths, weaknesses, score_breakdown}
  createdAt       DateTime @default(now())
  @@index([sessionId, order])
}

model InterviewReview {
  id              String   @id @default(cuid())
  sessionId       String   @unique
  session         InterviewSession @relation(fields: [sessionId], references: [id])
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  // 复盘
  overallScore    Float
  dimensions      Json     // {tech: 7, comm: 8, depth: 6}
  topIssues       Json     // {issue, severity, suggestion}[]
  greatMoments    Json     // string[]
  actionableItems Json     // string[]
  createdAt       DateTime @default(now())
  @@index([userId])
}

// === 提升计划 ===
model ImprovementPlan {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  title           String
  goal            String
  // 周期
  startDate       DateTime
  endDate         DateTime
  // 任务
  tasks           Json     // [{title, type, dueDate, status, ref}]
  // 来源
  source          String   // 'review' | 'match' | 'manual'
  sourceId        String?
  status          PlanStatus @default(ACTIVE)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([userId, status])
}

enum PlanStatus {
  ACTIVE
  COMPLETED
  ARCHIVED
}

// === Offer 概率 ===
model OfferPrediction {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  jdId            String?
  resumeId        String?
  // 输入特征
  features        Json     // {matchScore, levelFit, expYears, comp, ...}
  // 输出
  probability     Float    // 0-1
  confidence      Float    // 0-1
  breakdown       Json     // {factor, weight, score}[]
  // 实际结果（用于模型迭代）
  actualResult    String?  // 'offer' | 'rejected' | 'pending'
  feedbackAt      DateTime?
  createdAt       DateTime @default(now())
  @@index([userId])
}

// === 行为分析 ===
model UserBehavior {
  id              String   @id @default(cuid())
  userId          String?
  user            User?    @relation(fields: [userId], references: [id])
  sessionId       String?  // 浏览器会话
  event           String   // 'chat.send' / 'resume.parse' / 'jd.match' / 'interview.start' ...
  payload          Json
  ip              String?
  userAgent       String?
  createdAt       DateTime @default(now())
  @@index([userId, event, createdAt])
  @@index([event, createdAt])
}

// === 复用 ReUp 已有数据 ===
model Skill {
  id              String   @id
  name            String
  category        String   // 'promotion' / 'interview'
  trigger         String
  framework       String
  steps           Json     // string[]
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  @@index([category])
}

model KnowledgeChunk {
  id              String   @id @default(cuid())
  skillId         String?
  source          String   // '大厂晋升指南/...md'
  content         String   @db.Text
  embedding       Bytes?   // pgvector
  metadata        Json
  createdAt       DateTime @default(now())
  @@index([skillId])
}

model Conversation {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  title           String
  context         Json?    // 注入的简历/JD
  messages        Message[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([userId, updatedAt])
}

model Message {
  id              String   @id @default(cuid())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  role            String   // 'user' / 'assistant' / 'system'
  content         String   @db.Text
  citations       Json?    // Citation[]
  skillUsed       String?  // 触发的 Skill
  llmTrace        Json?    // {model, tokens, latency}
  feedbackRating  Int?     // -1 / 0 / 1
  createdAt       DateTime @default(now())
  @@index([conversationId, createdAt])
}

model Feedback {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  messageId       String?
  rating          Int      // -1 / 1
  comment         String?
  createdAt       DateTime @default(now())
  @@index([userId])
}

// === 订阅 & 支付 ===
model Subscription {
  id              String   @id @default(cuid())
  userId          String
  stripeSubId     String   @unique
  status          String   // 'active' / 'past_due' / 'canceled'
  plan            String
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAt        DateTime?
  createdAt       DateTime @default(now())
  @@index([userId, status])
}

model PaymentRecord {
  id              String   @id @default(cuid())
  userId          String
  stripeInvoiceId String   @unique
  amount          Int      // 分
  currency        String
  status          String
  createdAt       DateTime @default(now())
  @@index([userId])
}
```

### 3.5 数据迁移策略

| ReUp 现有 | 新表 | 迁移方式 |
|---|---|---|
| `data/skills.json` | `Skill` 表 | 启动时 seed |
| `data/skill-vectors.json` | 不入表（启动时预热到内存） | 保持现状 |
| `data/book-sources/` | `KnowledgeChunk` 表 | 启动时 chunk + embed + 入库 |
| `data/server-config.json` | `RuntimeConfig` 表（单例） | 启动时 seed |
| localStorage `resume:*` | `Resume` 表 | 用户登录后一次性导入向导 |
| localStorage `chat:*` | `Conversation` + `Message` | 同上 |
| localStorage `feedback:*` | `Feedback` | 同上 |

---

## 第四部分：AI 架构分析

### 4.1 当前 AI 调用链

```
┌────────────────────────────────────────────────────────────────┐
│                  Chat 调用全链路 (src/app/api/chat/route.ts)    │
└────────────────────────────────────────────────────────────────┘
[User 输入]
  │
  ▼
[1. 输入 Guard] — src/lib/rag/safety.ts → inputGuard()
  │   - 长度 / 注入检测 / 敏感词
  │
  ▼
[2. 拼写纠错] — src/lib/typo-correction.ts
  │
  ▼
[3. 意图分类] — src/lib/intent-classifier.ts
  │   - 命中 hot query? → 走 Skill
  │   - 通用 chat? → 走 RAG
  │
  ▼
[4. Skill 路由] — src/lib/skills-loader.ts
  │   - getSkillById(id) → 加载 framework + steps
  │
  ▼
[5. RAG 检索] — src/lib/rag/_retrieve-internal.ts → retrieve()
  │   - 缓存命中? → 返回 cached
  │   - Embedding → src/lib/embedder.ts (Xenova 本地)
  │   - 向量搜索 → src/lib/vector-store.ts
  │   - ReRank → src/lib/reranker.ts
  │
  ▼
[6. 上下文拼装] — src/lib/rag/suggestions.ts → formatContext()
  │   - System: 角色 + Skill framework
  │   - User: question + citations
  │
  ▼
[7. LLM 调用] — src/lib/llm-client.ts
  │   - 多 Provider 抽象 (OpenAI 兼容)
  │   - 流式输出
  │
  ▼
[8. 输出 Guard] — src/lib/rag/safety.ts → outputGuard()
  │   - hallucinationCheck
  │   - 敏感词
  │
  ▼
[9. SSE 流式返回] — stream response
  │
  ▼
[10. 前端渲染] — src/components/chat/ChatMessage.tsx
```

### 4.2 简历中心调用链

```
[上传 PDF/Word]
  │
  ▼
/api/resume/parse  (src/app/api/resume/parse/route.ts)
  │  - pdf-parse / mammoth
  │
  ▼
parseTextResume()  (src/lib/resume/parser-text.ts)
  │  - 规则解析
  │  - 失败时 → llmFallbackParse() (Phase 1 J)
  │
  ▼
ResumeDocument
  │
  ├──▶ StreamingResult  → /api/resume/rewrite  → STAR 润色
  ├──▶ JdInput          → /api/resume/jd-keywords  → 关键词
  ├──▶ MatchReportCard  → /api/resume/match-report  → 匹配报告
  └──▶ ExportButtons    → /api/resume/export  → PDF/Word/MD 导出
```

### 4.3 性能瓶颈分析

| 阶段 | 现状耗时 | 评估 | 优化方向 |
|---|---|---|---|
| 输入 Guard | < 5ms | ✅ OK | - |
| 拼写纠错 | < 10ms | ✅ OK | - |
| 意图分类 | < 20ms | ✅ OK | - |
| Skill 加载 | < 5ms (JSON 缓存) | ✅ OK | - |
| Embedding | 200-500ms | ⚠️ **瓶颈** | 可换 ONNX 量化或远程 API |
| 向量搜索 | 5-20ms | ✅ OK | 量大后需换 pgvector |
| ReRank | 5-20ms | ✅ OK | 可加 Cross-Encoder |
| LLM 调用 | 1-5s (流式) | ✅ 流式 | - |
| 输出 Guard | 50-200ms | ⚠️ | 可异步 |

**关键瓶颈**：
1. **本地 Embedding 启动慢**：Xenova/transformers 首次加载 ~3-5s
2. **RAG 检索是同步阻塞**：未做并发 / 流式
3. **无 RAG 缓存 TTL**：缓存条目会无限增长（虽然有 LRU 上限）

### 4.4 设计不合理的模块

| 模块 | 问题 | 建议 |
|---|---|---|
| `intent-classifier.ts` | 规则式分类，不准 | 加 LLM 分类兜底 |
| `vector-store.ts` | 内存存储，重启即丢 | 迁移 pgvector |
| `conversation-store.ts` | localStorage，无跨设备 | 迁移 DB |
| `feedback-store.ts` | 丢用户反馈 | 迁移 DB |
| `admin-stats.ts` | 仅内存 | 迁移 DB + 时序聚合 |

### 4.5 可缓存的模块

| 模块 | 缓存策略 |
|---|---|
| Skill 定义 | 进程内 LRU（已有 ✅） |
| Skill 向量 | 预计算 JSON（已有 ✅） |
| RAG 检索 | LRU 1000（已有 ✅） |
| LLM 响应（Hot Query） | LRU（已有 ✅） |
| Embedding 结果 | 缺失 — **建议加** |
| 用户简历 | DB（缺失 — **建议加**） |

### 4.6 适合本地推理的模块

- **Embedding**（已是本地 ✅）
- **拼写纠错**（规则式，无需 LLM）
- **输入 Guard 词表**（已本地 ✅）
- **ReRank**（规则式 ✅）

---

## 第五部分：性能分析

### 5.1 请求链路耗时分解

**典型 Chat 请求**（基于代码静态分析 + 注释推断）：

| 阶段 | 耗时（首次） | 耗时（缓存命中） |
|---|---|---|
| 模型加载（Xenova 首次） | 3000-5000ms | 0 |
| 输入 Guard | 2-5ms | 同 |
| 拼写纠错 | 5-10ms | 同 |
| 意图分类 | 10-20ms | 同 |
| Skill 路由 | 2-5ms | 同 |
| Embedding | 200-500ms | 200-500ms |
| 向量搜索 | 5-20ms | 同 |
| ReRank | 5-20ms | 同 |
| 缓存查询 | 0-2ms | 0-2ms |
| LLM 首 Token | 500-2000ms | 同 |
| LLM 总输出 | 2-10s | 同 |
| 输出 Guard | 50-200ms | 同 |

### 5.2 Top 10 性能瓶颈

| # | 瓶颈 | 影响 | 文件 | 建议 |
|---|---|---|---|---|
| 1 | **本地 Embedding 冷启动** | 首次 3-5s | `src/lib/embedder.ts` | 持久化到全局模块 + 预热 |
| 2 | **无 RAG 流式** | 用户感知长 | `src/lib/rag/_retrieve-internal.ts` | 检索结果分批推送 |
| 3 | **无 LLM 响应缓存** | 重复 query 浪费 | `src/lib/llm-client.ts` | 加语义缓存（向量相似度） |
| 4 | **localStorage 容量** | 大量会话卡顿 | `src/lib/conversation-store.ts` | 迁 DB + 客户端只保留索引 |
| 5 | **无连接池** | LLM 并发受限 | `src/lib/llm-client.ts` | 用 undici Agent |
| 6 | **无请求去重** | 用户连点浪费 | API routes | 加 in-flight dedupe |
| 7 | **PDF 解析同步阻塞** | Node 事件循环卡 | `src/lib/resume/parser-pdf.ts` | 改为 worker_threads |
| 8 | **无 Tracing** | 难以定位慢请求 | 全局 | 加 OpenTelemetry |
| 9 | **无 Rate Limit** | 单用户刷爆 | API routes | 加 token bucket |
| 10 | **无 SSR Streaming** | 客户端白屏 | `src/app/page.tsx` | 用 React Server Components + Suspense |

### 5.3 已有性能优化（可借鉴）

| 优化 | 文件 | 效果 |
|---|---|---|
| LRU 缓存 | `src/lib/rag/cache.ts` | 减少重复 Embed + 检索 |
| Skill 向量预计算 | `data/skill-vectors.json` | 启动后路由 < 5ms |
| 流式 LLM | `src/lib/llm-client.ts` | 减少首 Token 感知 |
| Hot Query 直接返回 | `src/lib/rag/assess.ts` | 完全跳过 RAG |
| 输入 Guard 词表预编译 | `src/lib/rag/safety.ts` | 快速匹配 |

---

## 第六部分：产品重构评估

### 6.1 目标产品定义

**AI 面试提效平台**

| 角色 | 痛点 | 平台能力 |
|---|---|---|
| 大学生 | 无项目经验 / 不会写简历 | JD 解析 → 简历生成 → 模拟面试 |
| 校招生 | 算法 / 八股 / 行为面 | 八股题库 → 模拟面试 → 复盘 |
| 社招程序员 | 系统设计 / 项目深挖 | JD 匹配 → 项目 STAR 优化 → 模拟面试 |
| AI 工程师 | RAG / Agent / Prompt / LLM 原理 | LLM 专题 → Agent 设计题 |
| 产品经理 | 业务题 / 案例分析 | 案例题库 → 业务模拟面试 |

### 6.2 可直接复用的模块 ✅

| 模块 | 复用度 | 原因 |
|---|---|---|
| `src/lib/rag/**` | 100% | 通用 RAG 基础设施 |
| `src/lib/llm-client.ts` | 100% | 多 LLM 抽象 |
| `src/lib/skills-loader.ts` | 100% | Skill 注册中心 |
| `data/skills.json` | 100% | 8 个 Skill 中 5 个直接复用 |
| `src/lib/resume/**` | 90% | 简历能力 100% 复用，仅加 DB 持久化 |
| `src/lib/jd/**` | 100% | JD 解析 100% 复用 |
| `src/lib/admin-*` | 80% | Admin 框架 100% 复用，补 4 个 Tab |
| `src/components/chat/*` | 100% | Chat UI 组件全复用 |
| `src/app/admin/*` | 80% | Admin 前端全复用 |
| `src/lib/rag/safety.ts` | 100% | Guard 机制全复用 |
| `data/book-sources/大厂晋升指南` | 100% | 晋升知识源直接复用 |
| `data/book-sources/面试现场` | 100% | **面试知识源直接复用**（这是金子） |
| `scripts/` | 100% | 启动 / 构建 / 验证脚本 |

### 6.3 建议删除的模块 ❌

| 模块 | 原因 |
|---|---|
| `src/lib/feedback-store.ts` | localStorage 版本，被新 Feedback 表替代 |
| `src/lib/conversation-store.ts` (localStorage 部分) | 同上，保留 API 接口，迁 DB |
| `scripts/backfill-metadata.mjs` | 一次性脚本，可归档 |
| `src/lib/category-rules.ts` | 已被 Skill 体系替代 |
| 旧版 `src/lib/rag.ts` | 已被 `src/lib/rag/index.ts` 替代 |

### 6.4 建议重构的模块 ⚠️

| 模块 | 原因 |
|---|---|
| `src/lib/admin-auth.ts` | 从 Bearer Token 升级到 NextAuth + RBAC |
| `src/lib/admin-stats.ts` | 从内存升级到 DB + 聚合查询 |
| `src/lib/llm-client.ts` | 加限流 + 缓存 + 计量 |
| `src/app/page.tsx` | 从纯 Chat 升级为"功能入口聚合页" |
| `src/app/admin/page.tsx` | 加订阅/用户/行为分析 Tab |

### 6.5 缺失能力（必须新建）🚧

| 能力 | 优先级 | 建议方案 |
|---|---|---|
| **AI 模拟面试** | P0 | 新建 `InterviewSession` + `InterviewQuestion`，复用 LLM + RAG |
| **面试复盘** | P0 | 新建 `InterviewReview`，复用 LLM |
| **面试提升计划** | P0 | 新建 `ImprovementPlan`，从 Review 自动生成 |
| **Offer 概率分析** | P1 | 新建 `OfferPrediction`，基于规则 + 轻量模型 |
| **订阅付费** | P0 | 集成 Stripe + Webhook |
| **用户行为分析** | P1 | 新建 `UserBehavior` + Admin 分析 Tab |
| **面试题库** | P0 | 复用 RAG（已有 `data/book-sources/面试现场` 语料） |
| **语音面试** | P2 | 接入 STT/TTS（Whisper / CosyVoice） |
| **多租户** | P2 | B 端 API 接入 |

---

## 第七部分：后台系统分析

### 7.1 当前后台能力

| Tab | 文件 | 能力 | 评价 |
|---|---|---|---|
| 仪表盘 | `src/app/admin/_components/dashboard-tab.tsx` | 统计概览 | ✅ 基础完整 |
| Prompt 管理 | `src/app/admin/_components/prompt-tab.tsx` | Prompt CRUD | ✅ 完整 |
| 模型管理 | `src/app/admin/_components/model-tab.tsx` | 多 LLM Provider | ✅ 完整 |
| RAG 配置 | `src/app/admin/_components/rag-tab.tsx` | topK / threshold / cache | ✅ 完整 |
| 知识库 | `src/app/admin/_components/knowledge-tab.tsx` | 知识 CRUD | ✅ 完整 |
| 元数据 | `src/app/admin/_components/metadata-tab.tsx` | 分类标签 | ✅ 完整 |
| 运行时配置 | `src/app/admin/_components/runtime-config-tab.tsx` | 服务端配置 | ✅ 完整 |
| 框架技能 | `src/app/admin/_components/framework-skills-tab.tsx` | Skill CRUD | ✅ 完整 |

**亮点**：
- Tabs 化设计
- localStorage 持久化用户操作
- Activity Log 记录
- 自定义 Provider 支持

### 7.2 缺失能力

| 能力 | 必要性 | 实现方式 |
|---|---|---|
| **用户管理** | P0 | DB + Admin Tab |
| **用户画像** | P1 | DB 聚合 + 图表 |
| **行为分析** | P1 | `UserBehavior` 表 + 漏斗 / 留存 / 转化 |
| **订阅管理** | P0 | Stripe Webhook + 状态展示 |
| **支付记录** | P0 | DB 记录 |
| **A/B Test** | P2 | Feature Flag + 分流 |
| **Prompt 版本管理** | P1 | 加 `version` + diff |
| **模型路由策略** | P1 | 按用户 / 任务 / 成本路由 |
| **Token 消耗统计** | P1 | DB 聚合 |
| **报警 / 监控** | P2 | 接入 Sentry / Grafana |

### 7.3 推荐后台架构

```
/admin
├── 仪表盘（升级）       # 今日活跃 / 转化 / 关键指标
├── 用户管理 (新)        # 列表 / 详情 / 订阅状态
├── Prompt 管理          # 已有 + 版本
├── 模型管理 (升级)      # 已有 + 路由策略 + 限流
├── RAG 配置             # 已有
├── 知识库               # 已有
├── 框架技能 (升级)      # 已有 + 效果追踪
├── 订阅管理 (新)        # 订阅列表 / 续费提醒
├── 支付记录 (新)        # 流水
├── 行为分析 (新)        # 漏斗 / 留存 / 转化
├── 内容运营 (新)        # 面试题库 / 简历模板
└── 系统配置             # 已有
```

---

## 第八部分：面试平台目标架构设计

### 8.1 最终产品架构

```
┌──────────────────────────────────────────────────────────────┐
│                  AI 面试提效平台 · 产品架构                     │
└──────────────────────────────────────────────────────────────┘

用户端 (App)
├── 首页 /land
│   └── 价值主张 + 入口卡片 (JD分析/简历/模拟面试/复盘/计划)
├── JD分析 /jd
│   ├── JD 解析（粘贴 / 上传）
│   ├── 关键词高亮
│   ├── 匹配简历
│   └── 公司情报
├── 简历中心 /resume-center
│   ├── 上传 / 解析
│   ├── ATS 评分
│   ├── 智能分析
│   ├── STAR 润色
│   ├── 模板切换
│   └── 版本管理
├── 模拟面试 /interview/new
│   ├── 选择 JD（可选）
│   ├── 选择类型（技术/行为/案例/系统设计）
│   ├── 选择难度
│   ├── 文字面试
│   ├── 语音面试 (P2)
│   └── 实时评估
├── 面试复盘 /interview/[id]/review
│   ├── 总分
│   ├── 维度评分（技术深度 / 表达 / 思维 / 项目）
│   ├── 亮点 / 问题
│   ├── 逐题反馈
│   └── 一键生成提升计划
├── 提升计划 /plan
│   ├── 目标设定
│   ├── 任务日历
│   ├── 学习路径
│   ├── 进度追踪
│   └── 复盘迭代
├── Offer 分析 /offer
│   ├── 多 JD 概率对比
│   ├── 关键短板
│   └── 行动建议
└── 个人中心 /me
    ├── 简历
    ├── JD 收藏
    ├── 历史面试
    ├── 订阅
    └── 设置

管理后台 /admin
├── 仪表盘
├── 用户管理
├── Prompt 管理
├── 模型管理
├── 知识库
├── 框架技能
├── 订阅 & 支付
├── 行为分析
├── 内容运营
└── 系统配置
```

### 8.2 推荐数据库设计

参见 **第三部分 § 3.4** 完整 Prisma Schema。

**核心新增表**：
- `InterviewSession` / `InterviewQuestion` / `InterviewReview`
- `ImprovementPlan`
- `OfferPrediction`
- `Resume` / `ResumeAnalysis` / `ResumeJDMatch`（从 localStorage 迁库）
- `JobDescription`（从无状态升级为有状态）
- `User` / `Subscription` / `PaymentRecord`（新）
- `UserBehavior`（新）

### 8.3 推荐 Agent 设计

#### 8.3.1 JD Agent

```yaml
agent: jd-agent
input: { jdText: string, resumeId?: string }
prompt: |
  你是 JD 解析专家。从 JD 文本中提取结构化信息：
  1. 职位基本信息（title/company/level/location/salary）
  2. 硬性要求（学历/经验/技术栈/语言/证书）
  3. 软性素质（沟通/团队/ownership）
  4. 业务领域 & 团队定位
  5. 隐藏要求（从"加分项"反推）
  6. 面试考察重点预测
tools:
  - jd.parse (LLM)
  - jd.extract_keywords
  - jd.predict_interview_focus
output:
  JDDocument {
    basic, hardRequirements, softRequirements,
    skills, salary, interviewPrediction
  }
```

#### 8.3.2 Resume Agent

```yaml
agent: resume-agent
input: { file?: File, text?: string, jdId?: string }
prompt: |
  你是资深简历优化师。任务：
  1. 解析简历 → ResumeDocument
  2. ATS 评分（关键词/格式/结构/可读性）
  3. 强项 & 弱项
  4. 与 JD 匹配分析（缺什么、补什么、怎么补）
  5. STAR 化重写
tools:
  - resume.parse
  - resume.ats_score
  - resume.analyze
  - resume.match_jd
  - resume.star_rewrite
  - resume.export
output:
  ResumeAnalysis { score, strengths, weaknesses, suggestions }
  StarRewriteResult { experience: [...] }
  MatchReport { overall, breakdown, missing, highlights }
```

#### 8.3.3 Interview Agent

```yaml
agent: interview-agent
input: {
  type: 'TECHNICAL' | 'BEHAVIORAL' | 'CASE' | 'SYSTEM_DESIGN' | 'MIXED',
  jdId?: string,
  resumeId?: string,
  level: '校招' | 'P5' | 'P6' | 'P7' | 'P8',
  difficulty: 1-5,
  totalQuestions: number,
}
prompt: |
  你是{company}{level}面试官。请根据：
  - 候选人简历（{resume}）
  - JD 要求（{jd}）
  连续出{count}道{totalQuestions}道{difficulty}难度的{type}题。

  规则：
  1. 第一题热身（自我介绍/项目概述）
  2. 难度循序渐进
  3. 项目深挖用 STAR
  4. 算法题给 hint 不给答案
  5. 行为面用"最近一次"开头

  出题后等待候选人回答。
  回答后立即评估（多维度），并引导下一题。
tools:
  - llm.generate_question
  - llm.evaluate_answer
  - llm.generate_hint
  - rag.retrieve (从面试题库检索)
  - interview.score
output:
  InterviewSession { questions, scores, transcript }
  InterviewQuestion { question, hints, reference, evaluation }
```

#### 8.3.4 Review Agent

```yaml
agent: review-agent
input: { sessionId: string }
prompt: |
  你是面试复盘教练。基于完整面试 transcript：
  1. 给出 0-10 总分
  2. 多维度评分（技术深度 / 表达清晰度 / 思维结构 / 项目掌握 / 行为匹配）
  3. Top 3 亮点
  4. Top 5 问题（按严重度排序）
  5. 每道题逐题反馈（哪答得好、哪答得差、应该怎么答）
  6. 可执行的改进建议
  7. 自动生成 7 天提升计划
tools:
  - llm.analyze_transcript
  - llm.generate_actionable_advice
  - plan.generate
output:
  InterviewReview { overallScore, dimensions, topIssues, greatMoments, actionableItems }
  ImprovementPlan { goal, tasks, duration }
```

#### 8.3.5 Career Agent

```yaml
agent: career-agent
input: { userId: string, targetJdId?: string }
prompt: |
  你是职业规划师。基于用户：
  - 历史简历
  - 历史面试
  - 提升计划完成度
  - Offer 记录
  提供：
  1. Offer 概率预测（综合匹配分 + 面试表现 + 市场行情）
  2. 投递顺序建议
  3. 谈薪策略
  4. 长期发展路径
tools:
  - llm.predict_offer
  - llm.suggest_targets
  - llm.salary_negotiation
  - llm.career_path
output:
  OfferPrediction { probability, confidence, breakdown }
  CareerAdvice { targets, salary, path }
```

### 8.4 Agent 调度器

```typescript
// src/lib/agents/orchestrator.ts
type AgentName = 'jd' | 'resume' | 'interview' | 'review' | 'career';

interface AgentRoute {
  agent: AgentName;
  input: any;
  context: { userId; resumeId?; jdId?; sessionId? };
}

class AgentOrchestrator {
  async run(route: AgentRoute): Promise<AgentResponse> {
    // 1. 加载用户上下文（限流、计费）
    // 2. 选择 LLM（按 plan / 任务）
    // 3. 调用 Agent
    // 4. 记录到 UserBehavior
    // 5. 计费扣点
  }
}
```

---

## 第九部分：商业化分析

### 9.1 套餐设计

| 维度 | Free | Pro | Premium |
|---|---|---|---|
| 月费 | ¥0 | ¥39 | ¥99 |
| JD 解析 | 3 次/月 | 50 次/月 | 无限 |
| 简历解析 | 1 份 | 5 份 | 无限 |
| 简历匹配 | 3 次/月 | 50 次/月 | 无限 |
| 模拟面试 | 1 次/月 | 20 次/月 | 无限 |
| 面试复盘 | ❌ | ✅ | ✅ |
| 提升计划 | ❌ | ✅ | ✅ |
| Offer 概率 | ❌ | ❌ | ✅ |
| 模型选择 | 仅默认 | 5 个 | 全部 |
| 简历模板 | 1 个 | 10 个 | 全部 |
| 知识库 | 公共 | 公共 | 公共+私有 |
| 语音面试 | ❌ | ❌ | ✅ |
| 客户支持 | 社区 | 邮件 | 1V1 |

### 9.2 商业化关键点

1. **免费试用**：必须给 1-3 次完整流程（JD 解析 + 简历 + 模拟面试 + 复盘），让用户感知价值
2. **付费墙位置**：
   - 第 2 份简历解析
   - 第 2 场模拟面试
   - 复盘详细报告（高级）
3. **企业版**（B 端）：
   - HR SaaS：JD 标准化、简历筛选、面试题库管理
   - 高校：校招训练平台
4. **API**：开放 `Match Score` API，给招聘平台

### 9.3 转化漏斗

```
访问 → 注册 → 首次解析 JD → 首次上传简历 → 首次模拟面试 → 付费
 100%   40%     30%              20%            10%        3%
```

**优化点**：
- 缩短注册流（微信扫码 / GitHub 一键）
- 首次进来直接给"5 分钟模拟面试" demo
- 复盘页加"升级解锁详细反馈"

---

## 第十部分：最终输出

### 10.1 完整报告

本报告即为完整报告。**核心结论**：

#### 10.1.1 复用度评估

| 类别 | 复用度 |
|---|---|
| RAG 基础设施 | 100% |
| LLM 客户端 | 100% |
| Skill 系统 | 100% |
| 简历模块 | 90%（需 DB 化） |
| JD 模块 | 100% |
| Admin 后台 | 80%（需补 Tab） |
| Chat UI | 100% |
| **整体** | **~70%** |

#### 10.1.2 核心数据资产

| 资产 | 位置 | 价值 |
|---|---|---|
| 8 个 Framework Skill | `data/skills.json` + `skills/` | ⭐⭐⭐⭐⭐ |
| 47 篇知识源 | `data/book-sources/` | ⭐⭐⭐⭐⭐ |
| 12 个简历评估样本 | `data/resume-eval/` | ⭐⭐⭐⭐ |
| RAG + Guard + Cache | `src/lib/rag/**` | ⭐⭐⭐⭐⭐ |
| 多 LLM 抽象 | `src/lib/llm-client.ts` | ⭐⭐⭐⭐ |
| Admin 7 Tab 框架 | `src/app/admin/**` | ⭐⭐⭐⭐ |

#### 10.1.3 必须重写的部分

| 模块 | 工作量 | 原因 |
|---|---|---|
| Auth + User | 3 人天 | 全新 |
| 订阅 + 支付 | 5 人天 | Stripe 集成 + Webhook |
| Prisma Schema + 迁移 | 3 人天 | 全新 |
| 模拟面试 Agent | 7 人天 | 全新（含 LLM 流程） |
| 复盘 Agent | 5 人天 | 全新 |
| 提升计划 | 3 人天 | 全新 |
| Offer 概率 | 5 人天 | 全新（含模型） |
| 行为埋点 | 2 人天 | 全新 |
| **总计** | **~33 人天** | |

#### 10.1.4 风险点

| 风险 | 等级 | 缓解 |
|---|---|---|
| 简历解析准确率（中文 PDF） | 中 | 已有 LLM 回退 |
| LLM 成本失控 | 高 | 加 token 计量 + 限额 |
| 模拟面试体验 | 中 | 早期聚焦文字，P2 加语音 |
| Offer 概率模型冷启动 | 高 | 先用规则 + 透明公式 |
| 多租户隔离 | 中 | 早期不做 B 端 |
| 数据合规（简历含个人信息） | 高 | 隐私模式 + 用户授权 + 加密 |

### 10.2 重构优先级

#### P0（必须先做，4-6 周）

| 任务 | 工期 | 交付物 |
|---|---|---|
| Prisma + PostgreSQL 接入 | 1 周 | Schema + 迁移脚本 |
| NextAuth + User 体系 | 1 周 | 登录/注册/OAuth |
| 简历中心 DB 化 | 1 周 | Resume 持久化 |
| JD 中心 DB 化 | 0.5 周 | JobDescription 持久化 |
| 模拟面试 Agent（MVP） | 2 周 | 文字版 + 评估 |
| 复盘 Agent | 1 周 | 总分 + 维度 + 改进 |
| 提升计划 | 0.5 周 | 7 天计划自动生成 |
| Stripe 订阅（基础） | 1 周 | Free / Pro / Premium |
| 简历中心 UI 优化 | 0.5 周 | 把现有 UI 改成多简历 |
| **P0 总计** | **~8 周** | **可上线 v1.0** |

#### P1（推荐做，4-6 周）

| 任务 | 工期 | 交付物 |
|---|---|---|
| Offer 概率分析 | 2 周 | 规则模型 + 解释 |
| 行为分析埋点 | 1 周 | 漏斗 + 留存 + 转化 |
| Admin 新 Tab：用户/订阅/行为 | 1 周 | 后台可视化 |
| RAG 性能优化（pgvector） | 1 周 | 替换内存向量库 |
| 简历 vs JD 多份对比 | 0.5 周 | 横向矩阵 |
| 面试题库（基于现有语料） | 1 周 | 标签 + 搜索 |
| **P1 总计** | **~6 周** | **可上线 v1.5** |

#### P2（未来做，6-8 周）

| 任务 | 工期 | 交付物 |
|---|---|---|
| 语音面试（STT + TTS） | 3 周 | Whisper + CosyVoice |
| B 端 / HR SaaS | 4 周 | JD 标准化 + 简历筛选 |
| A/B Test 框架 | 1 周 | Feature Flag |
| 多租户 + RBAC | 2 周 | Org + Role + 权限 |
| OpenTelemetry Tracing | 1 周 | 全链路追踪 |
| **P2 总计** | **~10 周** | **企业版 v2.0** |

### 10.3 预计开发周期

| 阶段 | 周期 | 团队 |
|---|---|---|
| P0（MVP） | 8 周 | 2 全栈 + 1 AI |
| P1（增强） | 6 周 | 同上 |
| P2（拓展） | 10 周 | +1 前端 / +1 后端 |
| **总计** | **24 周（6 个月）** | - |

### 10.4 技术风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| LLM 输出不稳定 | 模拟面试质量差 | 多模型 fallback + 评估回路 |
| 中文 PDF 解析 | 简历解析失败 | LLM 回退（已有） |
| 并发与限流 | 服务被刷垮 | token bucket + 队列 |
| 数据迁移 | 老用户数据丢 | 双写 + 灰度 |
| pgvector 性能 | 量大时慢 | 分区 + 索引 |
| 隐私合规 | 法律风险 | 隐私模式 + 用户授权 + 加密 + 审计 |

### 10.5 产品风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 简历解析准确率 < 80% | 用户流失 | LLM 回退 + 人工标注 |
| 模拟面试不像真人 | 用户感受差 | 提示词工程 + Few-shot |
| 复盘给不出可执行建议 | 留存差 | 限定具体行动项 |
| Offer 概率被滥用 | 信任危机 | 透明公式 + 区间 |
| 竞争对手（ResumeWorded 等） | 市场份额 | 本土化 + 中文深度 |
| 用户付费意愿 | 收入不达预期 | 免费体验 + 渐进付费墙 |

### 10.6 最终建议

#### 战略层

1. **不要从 0 写**：ReUp 的 RAG / Skill / Admin 已经是金子。在现有基础上重构 = 3-6 个月。从 0 写 = 12-18 个月。
2. **保持 Skill 体系**：这是 ReUp 最大的差异化。把"模拟面试 / 复盘 / 提升"都封装成 Skill。
3. **复用知识源**：`data/book-sources/面试现场/` 是真实的面试方法论沉淀，比 LLM 直出专业 10 倍。

#### 战术层

1. **P0 不做大而全**：先做"JD 解析 + 简历 + 模拟面试 + 复盘"4 件套，闭环最短。
2. **P0 不要做语音**：文字面试体验做透 + 跑通商业模式，再加语音。
3. **P0 不做 Offer 概率**：先用规则 + 透明公式，P1 再升级模型。
4. **P0 要做免费试用**：1 份简历 + 1 场模拟面试 + 1 份复盘，转化率最高。
5. **P0 不要重写 Admin**：现有 8 Tab 90% 可复用，加"用户/订阅"2 个 Tab 即可。

#### 团队配置

- **MVP（8 周）**：1 全栈 + 1 AI 工程师 + 1 产品 + 1 设计
- **正式版（+6 周）**：+1 前端
- **企业版（+10 周）**：+1 后端

#### 里程碑

| 节点 | 时间 | 指标 |
|---|---|---|
| v0.5 内测 | 第 4 周 | 50 个种子用户 |
| v1.0 公测 | 第 8 周 | 1000 注册 + 100 付费 |
| v1.5 增强 | 第 14 周 | MRR 5w |
| v2.0 企业 | 第 24 周 | 3-5 个 B 端客户 |

#### 立项第一周 TODO

1. ✅ 确认技术栈（Next.js 14 + Prisma + PostgreSQL + Stripe + NextAuth）
2. ✅ 搭建本地开发环境（docker-compose）
3. ✅ Prisma Schema 初版
4. ✅ NextAuth 接入 GitHub/Google
5. ✅ 简历中心 DB 化（最小改动）
6. ✅ 模拟面试 Agent Prompt 草稿
7. ✅ Stripe Test 环境跑通

---

## 附录 A：项目地图（Project Map）

```
/workspace
├── src/
│   ├── app/                  # 路由
│   │   ├── page.tsx          # Chat 首页
│   │   ├── resume/           # 简历中心
│   │   ├── admin/            # 管理后台
│   │   └── api/              # API 入口
│   ├── lib/                  # 业务核心
│   │   ├── rag/              # RAG（已重构）
│   │   ├── resume/           # 简历（完整）
│   │   ├── jd/               # JD（完整）
│   │   ├── chat/             # Chat 上下文
│   │   ├── llm-client.ts     # LLM 抽象
│   │   ├── embedder.ts       # 本地 Embedding
│   │   ├── vector-store.ts   # 内存向量库
│   │   ├── skills-loader.ts  # Skill 加载
│   │   ├── conversation-store.ts
│   │   └── admin-*.ts
│   ├── components/
│   │   ├── chat/             # Chat UI
│   │   └── ui/               # shadcn/ui
│   └── hooks/
├── data/
│   ├── skills.json           # 8 个 Skill ⭐
│   ├── skill-vectors.json    # 预计算向量 ⭐
│   ├── book-sources/         # 知识源 ⭐
│   └── resume-eval/          # 评估样本
├── skills/                   # 8 个 Framework Skill ⭐
├── docs/                     # Specs / Plans / Checklists
├── scripts/                  # 运维
└── patches/                  # 依赖补丁
```

## 附录 B：核心文件清单（建议优先阅读）

| 优先级 | 文件 | 作用 |
|---|---|---|
| 1 | `src/app/api/chat/route.ts` | Chat 主入口 |
| 1 | `src/lib/rag/index.ts` + 子模块 | RAG 核心 |
| 1 | `src/lib/llm-client.ts` | LLM 客户端 |
| 1 | `data/skills.json` | Skill 定义 |
| 2 | `src/lib/resume/` 全部 | 简历模块 |
| 2 | `src/lib/jd/` 全部 | JD 模块 |
| 2 | `src/lib/skills-loader.ts` | Skill 加载 |
| 2 | `src/lib/embedder.ts` | 本地 Embedding |
| 2 | `src/lib/admin-auth.ts` | Admin 鉴权 |
| 3 | `src/app/admin/_components/*.tsx` | Admin UI |
| 3 | `src/lib/runtime-config.ts` | 运行时配置 |
| 3 | `data/book-sources/面试现场/*.md` | 面试知识源 |
| 3 | `docs/superpowers/specs/2026-06-14-reup-v2-design.md` | ReUp v2 设计 |
| 4 | `docs/superpowers/specs/2026-06-15-resume-parse-jd-prompts-design.md` | 简历 + JD 设计 |
| 4 | `docs/superpowers/specs/2026-06-15-phase1-llm-fallback-spec.md` | LLM 回退 |
| 4 | `docs/superpowers/specs/2026-06-15-phase2-jd-chat-spec.md` | JD Chat |
| 4 | `docs/superpowers/specs/2026-06-15-phase3-export-versioning-spec.md` | 导出版本 |

## 附录 C：项目时间线（基于 Specs 文件名推断）

| 日期 | 主题 |
|---|---|
| 2026-06-13 | 架构优化 + Chat 优化 |
| 2026-06-14 | ReUp v2 设计 + 简历 Parser + Admin Tab + Prompt 管理 + 跨 Agent 迁移 |
| 2026-06-15 | PDF Bug 修复 + 全量审查 + Coze 移除 + 模型迁移 + LLM 回退 + JD Chat + 导出版本 + 知识元数据 + 简历 + JD Prompt |

> **观察**：项目处于密集迭代期（每天 1-2 个 Spec），处于"功能完善 + Bug 修复"阶段，距离生产化还差：DB / Auth / 付费 / 行为分析。

---

**报告完毕。**

下一步建议：
1. **评审本文档**（产品 / 技术 / 业务三方）
2. **确定 P0 范围**（先做 4 件套还是先做订阅）
3. **搭建数据层**（Prisma + DB）
4. **开发环境就绪**（docker-compose + CI）

需要我深入展开哪一部分？例如：
- 详细 Prisma Schema 与迁移脚本
- 模拟面试 Agent 的完整 Prompt 工程
- Stripe 订阅的 Webhook 设计与代码
- 行为分析的埋点规范
- pgvector 的索引与查询优化
