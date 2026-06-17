# ReUp 项目重构 + 新功能开发 — 完整上下文与约束

> 本文档供 AI 团队（产品经理 + 架构师 + 前后端 + 测试）阅读，用于产出 Spec 和 Plan。

---

## 一、技术约束（硬性，不可更改）

| 项 | 值 | 备注 |
|---|---|---|
| 框架 | Next.js 16 (App Router) + React 19 | TypeScript 5 strict |
| 样式 | Tailwind 4 + shadcn/ui (Radix) | 不引入新 UI 框架 |
| LLM | DashScope OpenAI-compatible (Qwen) | 所有调用走 `LLMClient.stream()`，客户端 SSE 消费 |
| Embedding | BGE-M3 本地 1024-dim | 预打包 `data/skill-vectors.json`（608 chunks） |
| Rerank | BGE-reranker-v2-m3 本地 | lazy load |
| DB | Prisma + SQLite (`dev.db`) | 已有 schema，见 `prisma/schema.prisma` |
| 测试 | Vitest 4 | 新模块覆盖率 >= 80% |
| 包管理 | pnpm 9 only | 禁止 npm/yarn |
| 环境变量 | `.env.local` | 核心 key: `DASHSCOPE_API_KEY` |

---

## 二、当前已有实现（先读完再设计，不要重复造轮子）

### 2.1 页面

| 路由 | 文件 | 行数 | 说明 |
|------|------|------|------|
| `/` | `src/app/page.tsx` | 1167 | 聊天主页：SSE 流式、多对话管理、语音输入、模型切换、侧边栏、引文溯源。**严重膨胀，所有逻辑堆在一个组件** |
| `/resume` | `src/app/resume/page.tsx` | 394 | 简历工作台：上传解析 + JD 匹配 + STAR 重写 + 导出。体验粗糙，流程割裂 |
| `/offer` | `src/app/offer/page.tsx` | 566 | Offer 评估 |
| `/admin` | `src/app/admin/page.tsx` | 302 | 管理后台 |
| `/review/[id]` | `src/app/review/[sessionId]/page.tsx` | 443 | 面试复盘 |

### 2.2 API 路由

| 路由 | 文件 | 行数 | 说明 |
|------|------|------|------|
| `/api/chat` | `src/app/api/chat/route.ts` | 719 | SSE 聊天入口。耦合了 RAG + 意图分类 + 安全门禁 + 模型路由 + Prompt 构建，**必须拆分** |
| `/api/resume/parse` | `src/app/api/resume/parse/route.ts` | 91 | 简历解析（PDF/Word/文本） |
| `/api/resume/match-report` | `src/app/api/resume/match-report/route.ts` | 188 | JD 匹配报告 |
| `/api/resume/rewrite` | `src/app/api/resume/rewrite/route.ts` | 104 | STAR 重写 |
| `/api/resume/export` | `src/app/api/resume/export/route.ts` | 143 | 导出 PDF/MD/DOCX |
| `/api/resume/jd-keywords` | `src/app/api/resume/jd-keywords/route.ts` | 50 | JD 关键词提取 |
| `/api/admin/*` | 多文件 | — | 管理后台 CRUD（auth/config/knowledge/runtime-config/skills/stats） |
| `/api/feedback` | `src/app/api/feedback/route.ts` | 61 | 用户反馈 |
| `/api/offer/*` | 多文件 | — | Offer 预测 |
| `/api/review/*` | 多文件 | — | 面试复盘 |
| `/api/test-connection` | `src/app/api/test-connection/route.ts` | 153 | 自定义模型连通性测试 |

### 2.3 核心库（src/lib/）

| 目录/文件 | 文件数 | 说明 |
|-----------|--------|------|
| `resume/` | 25+ | 解析器（text 884行/pdf/word/md）、ATS 评分（375行）、JD 匹配（280行）、STAR 改写（212行）、导出（pdf/docx/md）、存储、隐私、diff、迭代、prompts、类型 |
| `rag/` | 8 | 语义+稀疏+HyDE 混合检索、缓存、安全门禁、输出守卫、幻觉检测、置信度评估 |
| `jd/` | 3 | JD 解析器 + 智能匹配 + 类型 |
| `offer/` | 6 | Offer 评估公式、因子、置信度、存储、类型 |
| `review/` | 5 | 面试复盘评分、Prompt、存储、类型 |
| `prompts/` | 1 | `blocks.ts`：System Prompt 拆块（已建但未接入 route.ts） |
| `chat/` | 1 | `resume-context.ts`：简历上下文注入 |
| 根目录散落 | 20+ | `llm-client.ts`(532行)、`intent-classifier.ts`(190行)、`vector-store.ts`(344行)、`embedder.ts`(254行)、`reranker.ts`(158行)、`conversation-store.ts`(199行)、`admin-knowledge.ts`(464行)、`admin-stats.ts`、`error-classifier.ts`、`runtime-config.ts`(224行)、`server-config.ts`(146行)、`models.ts`、`skills-loader.ts`、`knowledge-base.ts`、`typo-correction.ts`、`url-safety.ts`、`db.ts`、`utils.ts` |

### 2.4 前端组件

| 目录 | 文件 | 说明 |
|------|------|------|
| `components/chat/` | 5 | ChatMessage(541行)、ChatInput、WelcomeScreen、CitationDrawer、ConversationSidebar |
| `components/ui/` | 50+ | shadcn/ui 基础组件（不动） |
| `app/resume/_components/` | 6 | ExportButtons、JdInput、MatchReportCard、ParsePreview、PrivacyToggle、StreamingResult |

### 2.5 共享类型与常量

| 文件 | 说明 |
|------|------|
| `components/chat/types.ts`(135行) | Message、CitationData、SKILLS 定义、EXAMPLE_QUERIES、INPUT_SUGGESTIONS_DB、PROVIDER_TEMPLATES — **混合了类型和大量业务常量，需拆分** |
| `lib/resume/types.ts`(99行) | 简历领域类型（ResumeBasic、ResumeExperience、ResumeProject 等） |
| `lib/jd/types.ts`(50行) | JD 领域类型 |
| `lib/offer/types.ts`(78行) | Offer 领域类型 |
| `lib/review/types.ts`(114行) | 面试复盘领域类型 |

### 2.6 知识库与技能

| 路径 | 说明 |
|------|------|
| `skills/` | 8 个 SKILL.md 文件（晋升4 + 面试4），RAG 检索的知识源 |
| `data/skill-vectors.json` | 608 个预计算 1024-dim 向量（BGE-M3） |
| `data/book-sources/` | 54 本电子书原文（大厂晋升指南 22 + 面试现场 32） |
| `data/user-samples/` | 测试夹具（简历/项目/面试题） |

### 2.7 Prisma Schema

已有 2 个 model：
- `InterviewReview`：面试复盘评分（overallScore、dimensions、perQuestionFeedback 等）
- `OfferPrediction`：Offer 概率预测（probability、confidence、breakdown 等）

**新功能（面试辅导、面经管理）可能需要新增 model。**

---

## 三、已诊断的 5 个结构问题

| # | 问题 | 详情 |
|---|------|------|
| 1 | 测试文件 3 种模式并存 | 同级 `.test.ts`（如 `parser.test.ts`）、`__tests__/` 子目录（如 `lib/__tests__/`）、组件级 `.test.tsx` — 不一致 |
| 2 | `lib/` 无分层 | 基础设施（llm-client、db、embedder）、安全工具、配置、业务逻辑混在一起，20+ 文件平铺 |
| 3 | `lib/resume/` 超级模块 | 25+ 文件：解析、匹配、ATS、导出、改写、存储、隐私、diff、迭代、prompts、配置全堆一起。其中 `parser-text.ts` 884 行远超合理上限 |
| 4 | 无 Server/Client 边界 | `parser-pdf.ts`、`parser-word.ts` 只能在 Node 运行，但和纯客户端代码混放，无编译期隔离 |
| 5 | API Route 耦合业务逻辑 | `/api/chat/route.ts` 719 行包含 RAG + 意图 + 安全 + 模型路由 + Prompt 构建全部逻辑，难以测试维护 |

**补充发现的隐性债务：**

| # | 问题 | 详情 |
|---|------|------|
| 6 | `page.tsx` 1167 行 | 聊天主页所有状态、逻辑、渲染堆在一个组件，必须拆分 |
| 7 | `admin-knowledge.ts` 464 行 | 管理后台知识库模块超限，且使用 `fs/promises` 属于纯服务端代码 |
| 8 | `prompts/blocks.ts` 已建未接入 | System Prompt 拆块已写好但标注"阶段 4 才接入 route.ts"，技术债 |
| 9 | `chat/types.ts` 混合职责 | 135 行里既有类型（Message）又有业务常量（SKILLS、EXAMPLE_QUERIES），需拆分 |
| 10 | `resume/parser-text.ts` 884 行 | 远超 300 行上限，需按解析段落拆分 |

---

## 四、重组后的目标结构

```
src/
├── app/                              # Next.js App Router（仅页面 + 路由壳）
│   ├── page.tsx                      # 聊天主页（瘦身后）
│   ├── (routes)/                     # 按功能拆分路由组
│   │   ├── resume/page.tsx           # 简历工作台
│   │   ├── interview/page.tsx        # 【新增】面试辅导中心
│   │   ├── review/page.tsx           # 面试复盘
│   │   └── offer/page.tsx            # Offer 评估
│   ├── api/                          # API 路由（薄壳，每个 <= 80 行）
│   │   ├── chat/route.ts
│   │   ├── resume/                   # parse / match-report / rewrite / export / jd-keywords
│   │   ├── interview/                # 【新增】coach / transcript / analysis
│   │   ├── review/
│   │   ├── offer/
│   │   └── admin/
│   └── admin/page.tsx                # 管理后台
│
├── components/                       # 共享 UI 组件（纯展示 + 交互，不含业务逻辑）
│   ├── ui/                           # shadcn 基础组件（不动）
│   └── shared/                       # 跨功能复用的业务组件
│       ├── chat/                     # ChatMessage、ChatInput、WelcomeScreen、ConversationSidebar
│       ├── resume/                   # ParsePreview、MatchReportCard、ExportButtons 等
│       └── layout/                   # 工作台布局组件（左右分栏等）
│
├── features/                         # 【核心变更】按领域拆分的功能模块
│   ├── resume/                       # 简历领域
│   │   ├── parser/                   # 解析（text/md/pdf/word）
│   │   ├── matcher/                  # JD 匹配
│   │   ├── ats/                      # ATS 评分
│   │   ├── rewriter/                 # STAR 改写
│   │   ├── export/                   # 导出（pdf/docx/md）
│   │   ├── storage/                  # 简历存储
│   │   ├── diff/                     # 改写对比
│   │   ├── privacy/                  # 隐私脱敏
│   │   └── types.ts                  # 领域类型
│   ├── jd/                           # JD 解析领域
│   │   ├── parser/                   # JD 结构化解析
│   │   ├── smart-matcher/            # 智能匹配
│   │   └── types.ts
│   ├── interview/                    # 【新增】面试辅导领域
│   │   ├── coach/                    # 模拟面试官（多轮对话）
│   │   ├── transcript/               # 面经上传（语音/文字 → 结构化）
│   │   ├── analysis/                 # 面经深度分析 + 智能体解释
│   │   └── types.ts
│   ├── chat/                         # 对话领域
│   │   ├── rag/                      # RAG 引擎（从 lib/rag/ 迁入）
│   │   ├── intent/                   # 意图分类
│   │   ├── prompts/                  # System Prompt 构建（从 lib/prompts/ 迁入）
│   │   ├── safety/                   # 安全门禁 + 输出守卫 + 幻觉检测
│   │   ├── conversation/             # 对话管理（从 lib/conversation-store 迁入）
│   │   └── types.ts
│   ├── review/                       # 面试复盘领域
│   │   ├── scoring/                  # 评分引擎
│   │   ├── store/                    # 存储
│   │   └── types.ts
│   └── offer/                        # Offer 评估领域
│       ├── formula/                  # 评估公式
│       ├── confidence/               # 置信度
│       ├── store/                    # 存储
│       └── types.ts
│
├── server/                           # 纯服务端代码（禁止客户端导入）
│   ├── llm/                          # LLM 客户端（从 lib/llm-client.ts 迁入）
│   ├── db/                           # Prisma 客户端（从 lib/db.ts 迁入）
│   ├── embedder/                     # 向量嵌入（从 lib/embedder.ts 迁入）
│   ├── vector-store/                 # 向量存储（从 lib/vector-store.ts 迁入）
│   ├── reranker/                     # 重排序（从 lib/reranker.ts 迁入）
│   ├── auth/                         # 认证（从 lib/admin-auth.ts 迁入）
│   ├── config/                       # 服务端配置（从 lib/server-config.ts + runtime-config.ts 迁入）
│   ├── knowledge/                    # 知识库管理（从 lib/admin-knowledge.ts 迁入并拆分）
│   └── stats/                        # 统计（从 lib/admin-stats.ts 迁入）
│
├── shared/                           # 通用工具（Server + Client 均可安全导入）
│   ├── utils/                        # 纯函数工具
│   │   ├── error-classifier.ts       # 从 lib/error-classifier.ts 迁入
│   │   ├── typo-correction.ts        # 从 lib/typo-correction.ts 迁入
│   │   ├── url-safety.ts             # 从 lib/url-safety.ts 迁入
│   │   └── utils.ts                  # 从 lib/utils.ts 迁入
│   ├── constants/                    # 业务常量
│   │   ├── skills.ts                 # 从 chat/types.ts 的 SKILLS 拆出
│   │   ├── examples.ts              # 从 chat/types.ts 的 EXAMPLE_QUERIES / INPUT_SUGGESTIONS_DB 拆出
│   │   └── providers.ts             # 从 chat/types.ts 的 PROVIDER_TEMPLATES 拆出
│   ├── config/                       # 共享配置
│   │   └── models.ts                 # 从 lib/models.ts 迁入
│   └── types/                        # 全局共享类型
│       ├── message.ts                # Message、CitationData、ThinkingStep（从 chat/types.ts 拆出）
│       └── model.ts                  # ModelConfig、CustomProvider
│
└── hooks/                            # 共享 React Hooks（已有）
```

---

## 五、强制执行规则（写入 AGENTS.md）

| # | 规则 | 说明 | 强制方式 |
|---|------|------|----------|
| R1 | 测试文件统一放在被测文件同级的 `__tests__/` 子目录 | 禁止同级 `.test.ts`，禁止跨模块集中 | ESLint `no-restricted-paths` |
| R2 | `server/` 禁止被 `app/`、`components/`、`hooks/` 直接导入 | API Route 是唯一桥接点 | ESLint `no-restricted-imports` |
| R3 | 每个 `features/<domain>/` 必须有 `index.ts` 作为公共 API | 内部文件不对外暴露 | Code review |
| R4 | API Route 文件 <= 80 行 | 只做：参数校验 → 调 service → 返回响应 | ESLint `max-lines` |
| R5 | 单文件 <= 300 行，单模块 <= 15 文件 | 超过必须拆分 | ESLint `max-lines` |
| R6 | 新功能必须先确认归属领域再创建文件 | 无归属的先讨论，不往 `lib/` 塞 | Code review |
| R7 | 类型就近：模块私有放模块内，跨模块共享放 `shared/types/` | 禁止全局大杂烩 | Code review |

---

## 六、7 个功能需求

| # | 功能 | 核心要求 | 涉及领域 | 优先级 |
|---|------|----------|----------|--------|
| 1 | JD 解析 | 粘贴/上传 JD → 结构化提取（职位、要求、薪酬、考察重点） | `features/jd/` | P0 |
| 2 | 简历分析 | 上传简历 → **完整结构化展示（与源文档一致，不能展示太少）** + ATS 评分 + 诊断（错别字/格式/前后矛盾/时间冲突） | `features/resume/parser/` + `features/resume/ats/` | P0 |
| 3 | JD 匹配 | 简历 vs JD → 匹配分 + 缺什么 + 怎么补 | `features/resume/matcher/` + `features/jd/` | P0 |
| 4 | 简历润色 | 基于匹配弱点 + 诊断问题 → STAR 法重写项目经历 → 支持改写后重新导出 PDF | `features/resume/rewriter/` + `features/resume/export/` | P1 |
| 5 | 面试指导 | 模拟面试官，多轮对话，覆盖自我介绍/项目经历/技术深挖等 | `features/interview/coach/` | P1 |
| 6 | 面经上传 | 文字或语音上传 → 自动识别并整理成结构化面经 | `features/interview/transcript/` | P2 |
| 7 | 面经分析 | 结合面经 + 简历 + JD → 智能体深度解释和改进建议 | `features/interview/analysis/` + `features/chat/` | P2 |

### 功能架构约束

1. **统一工作台布局**：7 个功能不是 7 个独立页面，而是一个「面试工作台」左右分栏：
   - 左栏：对话/交互区（与 AI 对话）
   - 右栏：工具面板（JD 输入、简历预览、匹配报告、STAR 改写、面经记录等 tab 切换）
2. **数据共享**：所有功能共享同一份简历/JD 数据（状态提升，避免重复上传）
3. **复用现有架构**：
   - 面试模拟复用 chat SSE 架构
   - 语音识别复用现有 Web Speech API（见 `page.tsx` 的 `createRecognition()`）
   - 导出 PDF 复用现有 pdfkit 方案（见 `features/resume/export/`），不引入新依赖
   - RAG 引擎（`features/chat/rag/`）供面试分析功能复用
4. **面试模拟多轮对话**：复用 `features/chat/conversation/` 的对话管理能力
5. **面经语音转文字**：复用 Web Speech API，补充长音频分段识别

---

## 七、禁止事项

| # | 禁止 | 原因 |
|---|------|------|
| 1 | 不要重写 `llm-client.ts` | 稳定模块，迁到 `server/llm/` 即可 |
| 2 | 不要动 `data/skill-vectors.json` | 预计算的 608 个 1024-dim 向量 |
| 3 | 不要改 Prisma schema（除非 spec 明确说明） | 现有 InterviewReview + OfferPrediction 结构稳定 |
| 4 | 不要删除 RAG 管线 | 新功能要复用，不重建 |
| 5 | 不要在客户端直接调用 LLM SDK | 必须走 API Route |
| 6 | 不要引入新 UI 框架 | 只用 shadcn/ui + Tailwind |
| 7 | `page.tsx`(1167行) 不要一步重写 | 先拆组件到 `components/shared/chat/`，再渐进重构 |
| 8 | 不要创建 .md 文件追踪进度 | 除非明确要求 |
| 9 | 不要改动 `skills/` 目录的 SKILL.md | RAG 知识源，格式已稳定 |
| 10 | 不要引入新依赖做 PDF 导出 | 已有 pdfkit |

---

## 八、迁移路径（三步走）

### Phase 0 — 结构骨架（最先做，可独立交付）

1. 创建 `server/`、`features/`、`shared/` 目录骨架
2. 每个新目录放一个 `index.ts` 占位
3. 配置 ESLint 规则：
   - R2: `server/` 导入限制（`no-restricted-imports`）
   - R4: API Route 行数限制（`max-lines`）
   - R5: 通用文件行数限制
4. 将 7 条强制规则写入 `AGENTS.md`
5. 搬迁最高优先级的文件：
   - `lib/llm-client.ts` → `server/llm/`
   - `lib/rag/` → `features/chat/rag/`
   - `lib/resume/` → `features/resume/` 各子模块
   - `lib/jd/` → `features/jd/`
   - `lib/db.ts` → `server/db/`
   - `lib/admin-auth.ts` → `server/auth/`
   - `lib/embedder.ts` → `server/embedder/`
   - `lib/vector-store.ts` → `server/vector-store/`
   - `lib/reranker.ts` → `server/reranker/`
   - `chat/types.ts` 拆分：类型 → `shared/types/`，常量 → `shared/constants/`
   - `lib/conversation-store.ts` → `features/chat/conversation/`
6. 更新所有 import 路径
7. 确保 `pnpm ts-check && pnpm lint && pnpm test` 全绿
8. 为 `lib/` 中暂时保留的文件创建 re-export shim（`lib/xxx.ts` → `export from '@/features/...'`），保证渐进迁移不破坏外部引用

### Phase 1~N — 功能开发中渐进搬迁

- 每做一个新功能，顺手搬迁该功能涉及的老代码到新结构
- 新代码严格遵循新结构
- 每个功能独立可交付可验证

### Phase Final — 清理

- 清理 `lib/` 残余文件和 re-export shim
- 删除空目录
- 更新 `AGENTS.md` 中的目录说明
- 最终验证：`pnpm ts-check && pnpm lint && pnpm test`

---

## 九、大文件拆分计划（现有超限文件）

| 文件 | 当前行数 | 拆分方案 |
|------|----------|----------|
| `page.tsx` | 1167 | 拆为：ChatPageLayout + useChatSession hook + useModelConfig hook + useVoiceInput hook + useSuggestions hook |
| `api/chat/route.ts` | 719 | 拆为：route.ts（薄壳） + `features/chat/prompts/builder.ts` + `features/chat/safety/guard.ts` + `features/chat/rag/orchestrator.ts` |
| `resume/parser-text.ts` | 884 | 按解析段落拆为：parser-basic.ts + parser-experience.ts + parser-project.ts + parser-education.ts + parser-skill.ts |
| `admin-knowledge.ts` | 464 | 拆为：`server/knowledge/stats.ts` + `server/knowledge/search.ts` + `server/knowledge/inspect.ts` |
| `ChatMessage.tsx` | 541 | 拆为：ChatMessage + MessageActions + ThinkingStepsPanel + CitationBadges |
| `llm-client.ts` | 532 | 迁到 `server/llm/` 后拆为：client.ts + stream.ts + types.ts |

---

## 十、产出要求

1. **Spec（功能规格）**：每个功能的用户故事、数据流图、模块接口定义
2. **Plan（执行计划）**：按 Phase 分批，每 Phase 独立可交付可验证
3. 每个任务标明涉及的**文件路径**（用新目录结构的路径）
4. 产出 ESLint 规则配置代码（R2 server/ 导入限制 + R4/R5 行数限制）
5. 产出 `AGENTS.md` 更新内容（7 条强制规则 + 新目录结构说明）
6. 产出 Prisma schema 变更方案（面试辅导 + 面经管理是否需要新增 model）

---

## 十一、回答确认问题

我选择 **C：同步推进**。

理由：
- 结构重组规则（7 条强制规则 + 目录骨架 + ESLint 配置）先落成文档和代码，工作量小
- 功能 Spec 的讨论不依赖实际搬迁，可以并行
- 等 Spec 确认后，Phase 0 实际搬迁和 Phase 1 功能开发衔接进行
- 避免"先做 A 再做 B"的串行等待
