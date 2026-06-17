# ReUp

> 一款以"资深 HR + 总裁视角"为特色的职场顾问智能体，专注于**晋升指导**和**面试辅导**两大场景。

通过网页聊天，用户即可获得结构化、有深度的职场建议。AI 回复采用 4 板块格式（我的分析 / 框架技能+原文知识点 / 底层心法 / 开始引导），结合 RAG 检索 8 个 Skill 知识库，确保建议有据可依。

---

## 目录

- [项目介绍](#项目介绍)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心功能模块](#核心功能模块)
- [8 个 Skill 知识库](#8-个-skill-知识库)
- [开发规范](#开发规范)
- [设计规范](#设计规范)
- [脚本与工具](#脚本与工具)
- [知识库 Wiki](#知识库-wiki)
- [AI 协作约定](#ai-协作约定)
- [常见问题](#常见问题)
- [部署与发布](#部署与发布)
- [参考链接](#参考链接)

---

## 项目介绍

### 项目定位

ReUp 是一款面向职场人士的 AI 顾问产品，主打"晋升"和"面试"两个高价值场景。区别于通用聊天机器人，ReUp 的特点是：

- **角色化人格**：以"资深 HR + 总裁"双重视角给出建议，既有 HR 的人岗匹配视角，也有老板的成本/价值视角
- **结构化输出**：每次回复固定 4 板块格式，让用户一眼抓住重点
- **专业方法论**：内置 8 个经过验证的 Skill（晋升底层逻辑、晋升三大原则、亮点挖掘、反问框架等），不依赖模型即兴发挥
- **RAG 增强**：每次回答前先检索相关 Skill 文档，再结合用户上下文生成建议

### 适用场景

- 准备晋升答辩，需要梳理自己的亮点和策略
- 准备面试（无论是技术面、HR 面还是总监面），需要练习自我介绍、反问、亮点的组织
- 处于职业瓶颈期，想系统了解晋升的底层逻辑和能力模型
- 想从执行者转型为管理者，但缺乏方法论

---

## 核心特性

- **流式对话**：基于 SSE 协议，首 token 延迟 < 1s，AI 回复实时增量渲染
- **RAG 检索**：语义检索 + 稀疏检索 + HyDE + 混合排序 4 重保障
- **状态可见**：检索中 / 生成中状态指示器，降低用户等待焦虑
- **响应式设计**：移动端、平板、桌面端自适应
- **快捷入口**：欢迎页提供 4 个高频场景胶囊按钮，新用户零成本上手
- **侧滑面板**：8 个 Skills 列表 + 清空对话
- **极简风格**：翡翠绿主色 + 纯白背景，无干扰、聚焦内容

---

## 技术栈

| 类别 | 技术 | 备注 |
|------|------|------|
| Framework | Next.js 16 (App Router) | 启用最新 App Router |
| UI Core | React 19 | RSC + Server Actions |
| Language | TypeScript 5 | strict 模式 |
| UI 组件库 | shadcn/ui (Radix UI) | 已预装，优先复用 |
| 样式 | Tailwind CSS 4 | CSS Variables 主题系统 |
| 表单 | React Hook Form + Zod | 类型安全 |
| LLM SDK | coze-coding-dev-sdk | 仅后端使用 |
| RAG | Knowledge + Embedding SDK | 向量+稀疏+HyDE |
| 包管理 | pnpm 9+ | 强制使用，已配 preinstall 拦截 |
| 代码规范 | ESLint 9 + eslint-config-next | `pnpm lint` |
| 工具脚本 | Node.js + tsx | 见 `scripts/` |

---

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9（项目 `preinstall` 钩子会拦截 npm/yarn）
- 扣子编程 CLI（`coze` 命令）

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm run dev
# 或
coze dev
```

默认监听 **8080 端口**。启动后浏览器访问 [http://localhost:8080](http://localhost:8080) 即可。

支持热更新（HMR），修改代码后页面自动刷新。

### 类型检查 / Lint / 构建

```bash
pnpm ts-check       # tsc 严格类型检查
pnpm lint           # ESLint 全量检查
pnpm lint:build     # 仅构建相关（CI 友好）
pnpm run build      # 生产构建
pnpm run start      # 启动生产服务
pnpm validate       # 并行跑 ts-check + lint:build
```

### 启动生产服务器

```bash
pnpm run build
pnpm run start
```

---

## 项目结构

```
.
├── public/                       # 静态资源（favicon、图标等）
├── skills/                       # 8 个 Skill 知识库原始文档
│   ├── jinsheng-dicing-luoji/    #   晋升底层逻辑
│   ├── jinsheng-san-yuanze/      #   晋升三大原则
│   ├── nengli-sanzhong-jingjie/  #   能力三重境界
│   ├── p8-lingyu-zhuanjia/       #   领域专家演进
│   ├── competency-model-alignment/   # 素质模型对齐
│   ├── highlight-extractor/      #   亮点挖掘
│   ├── blind-spot-navigation/    #   盲区导航
│   └── reverse-questioning-framework/  # 反问框架
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/chat/
│   │   │   └── route.ts          #   POST /api/chat — SSE 流式聊天接口
│   │   ├── globals.css           #   全局样式 + Design Token
│   │   ├── layout.tsx            #   根布局
│   │   ├── page.tsx              #   聊天主页（欢迎/对话/侧滑面板）
│   │   ├── admin/                #   Admin 后台（仪表板、知识库等）
│   │   ├── admin-demos/          #   Admin 演示页
│   │   └── favicon.ico
│   ├── components/
│   │   ├── chat/                 #   业务组件（聊天相关）
│   │   └── ui/                   #   shadcn/ui 基础组件
│   ├── hooks/                    #   自定义 Hooks
│   ├── lib/                      #   工具库
│   │   ├── rag.ts                #     RAG 检索（语义+稀疏+HyDE+混合排序）
│   │   ├── admin-stats.ts        #     Admin 统计数据
│   │   ├── coze-knowledge-api.ts #     扣子知识库 API 封装
│   │   ├── typo-correction.ts    #     错别字纠正
│   │   └── utils.ts              #     cn() 等工具
│   └── server.ts                 #   自定义服务器入口
├── scripts/                      # 工具脚本
│   ├── build.sh                  #   构建脚本
│   ├── dev.sh                    #   开发启动（端口 8080）
│   ├── start.sh                  #   生产启动
│   ├── prepare.sh                #   初始化准备
│   ├── validate.sh               #   校验脚本
│   └── count-tokens.mjs          #   Token 计数工具
├── next.config.ts                # Next.js 配置
├── tailwind.config / postcss.config.mjs
├── tsconfig.json
├── package.json
├── AGENTS.md                     # AI 协作约定（英文，给 AI 看）
├── README.md                     # 本文件（中文，给人看）
├── DESIGN.md                     # 设计规范详情
└── SPEC.md                       # 项目规格说明
```

---

## 核心功能模块

### 1. 后端聊天 API

**文件**：`src/app/api/chat/route.ts`

**职责**：接收前端 POST 请求，执行 RAG 检索 + LLM 流式生成，SSE 协议返回。

**核心流程**：

```
客户端 POST /api/chat
   ↓
解析 messages 数组
   ↓
RAG 检索：Knowledge 语义搜索 + 稀疏检索 + HyDE
   ↓
去重合并 → 注入 System Prompt
   ↓
LLMClient.stream() 流式生成
   ↓
SSE 推送：searching → generating → content chunks
   ↓
客户端 ReadableStream 实时渲染
```

**关键设计**：

- 使用 `coze-coding-dev-sdk` 的 `LLMClient.stream()` 方法
- 模型：`doubao-seed-2-0-pro-260215`
- SSE 状态流：先发 `{"status":"searching"}` → `{"status":"generating"}` → 增量内容
- `HeaderUtils.extractForwardHeaders` 必须用于转发请求头
- LLM SDK **仅在后端使用**，禁止客户端直接调用

### 2. RAG 检索模块

**文件**：`src/lib/rag.ts`

**职责**：根据用户 query 检索最相关的 Skill 文档，注入到 System Prompt。

**四重保障**：

| 阶段 | 方法 | 作用 |
|------|------|------|
| 1. 语义检索 | `KnowledgeClient.search()` 向量搜索，Top-K=5 | 捕捉语义相似度 |
| 2. 稀疏检索 | `EmbeddingClient.embedWithSparse()` BM25-like | 捕捉关键词匹配 |
| 3. HyDE 增强 | 让 LLM 先生成假设性回答，再用假设答案检索 | 提升召回率 |
| 4. 混合排序 | 语义分 + 稀疏分加权融合 + doc_id 去重 | 综合得分排序 |

### 3. 前端聊天界面

**文件**：`src/app/page.tsx`

**3 种状态**：

- **欢迎态**：居中布局 + 4 个高频场景胶囊按钮（晋升答辩、面试准备、能力盘点等）
- **对话态**：用户气泡（翡翠绿） + AI 气泡（4 板块 Markdown 渲染）
- **侧滑面板**：右侧抽屉，列出 8 个 Skills + 清空对话按钮

**交互细节**：

- 输入区：自适应高度 textarea，Enter 发送 / Shift+Enter 换行
- 流式渲染：`fetch` + `ReadableStream` 解析 SSE
- 状态指示器：检索中 / 生成中实时反馈
- 响应式：移动端 / 平板 / 桌面端适配

### 4. AI 回复 4 板块

每次 AI 回复固定包含 4 个板块，按顺序输出：

| 板块 | 作用 |
|------|------|
| 【我的分析】 | 列出关键判断点（肯定 / 否定），客观评估用户现状 |
| 【框架技能+原文知识点】 | Skill 胶囊标签 + 引用块，标注方法论出处 |
| 【底层心法】 | 一句话点透本质 |
| 【开始引导】 | 编号问题，引导用户继续深入 |

---

## 8 个 Skill 知识库

`skills/` 目录下维护 8 个核心 Skill 文档，每个 Skill 有自己的 SKILL.md：

| # | Skill | 分类 | 典型触发问题 |
|---|-------|------|--------------|
| 1 | 晋升底层逻辑 | 晋升 | "我绩效很好，为什么没晋升？" |
| 2 | 晋升三大原则 | 晋升 | "我该学什么技术？" |
| 3 | 能力三重境界 | 晋升 | "这个业务做了两年还能怎么提升？" |
| 4 | 领域专家演进 | 晋升 | "升了总监天天开会怎么办？" |
| 5 | 素质模型对齐 | 面试 | "怎么自我介绍？" |
| 6 | 亮点挖掘 | 面试 | "简历没亮点怎么办？" |
| 7 | 盲区导航 | 面试 | "面试被问住怎么圆？" |
| 8 | 反问框架 | 面试 | "面试最后问什么？" |

### 新增 Skill 的流程

1. 在 `skills/` 下新建文件夹 `<skill-name>/`
2. 编写 `SKILL.md`，结构建议：
   - 元信息（名称、分类、触发信号、目标用户）
   - 核心方法论（思维模型、原则、步骤）
   - 示例对话
   - 引用来源
3. 在 Admin 后台的"技能管理"中注册
4. 同步更新 `AGENTS.md` 的 Skills 列表

---

## 开发规范

### 包管理

- **必须**使用 pnpm（`preinstall` 钩子强制）
- 禁止使用 npm / yarn / bun
- 新增依赖：`pnpm add <pkg>`；开发依赖：`pnpm add -D <pkg>`

### TypeScript

- strict 模式开启，**禁止隐式 any**
- 公共 API 必须有显式类型注解
- 优先使用 `interface` 而非 `type`（除非需要联合类型等）
- 避免 `any`、避免 `as any` 断言

### 组件开发

- **优先复用** `src/components/ui/` 下的 shadcn/ui 组件
- 业务组件放 `src/components/<feature>/`
- Props 必须显式声明类型
- 使用 `cn()` 工具函数合并 className

### LLM 调用

- LLM SDK **仅在后端使用**（`src/app/api/` 或 `src/lib/`）
- 禁止客户端直接调用 LLM（会暴露 API key、绕过鉴权）
- 所有 LLM 调用必须用 `stream()` 流式输出
- 前端通过 SSE 协议消费

### 路由转发

- 调用后端 API 时必须用 `HeaderUtils.extractForwardHeaders` 转发用户请求头
- 不要自己手写 header 转发逻辑

### 代码风格

- ESLint 配置见 `eslint.config.mjs`
- 提交前跑 `pnpm validate`（= `ts-check` + `lint:build` 并行）
- 避免过度设计：单次操作不抽工具函数、不加配置开关

---

## 设计规范

### 色彩系统

| Token | 值 | 用途 |
|-------|-----|------|
| Primary | `#10b981`（翡翠绿） | 主色，按钮、强调、AI 状态 |
| Background | `#FFFFFF`（纯白） | 页面背景 |
| Text | 灰阶系 | 详情见 `globals.css` |

### 风格

- 极简、专业、干净利落
- 无渐变、无阴影过度使用
- 间距用 4/8 的倍数
- 圆角统一规范

### Design Token

完整 token 定义在 `src/app/globals.css` 中，使用 CSS Variables，支持亮色/暗色模式。

详见 [DESIGN.md](file:///Users/dengxiongshihao/Downloads/projects/DESIGN.md)。

---

## 脚本与工具

`scripts/` 目录下维护了一组 Bash 脚本和 Node 工具：

| 脚本 | 用途 |
|------|------|
| `scripts/build.sh` | 生产构建（调用 Next.js build） |
| `scripts/dev.sh` | 开发启动，监听 8080 端口，自动清理占用 |
| `scripts/start.sh` | 生产启动 |
| `scripts/prepare.sh` | 项目初始化准备（首次拉取后跑） |
| `scripts/validate.sh` | 校验脚本（CI 用） |
| `scripts/count-tokens.mjs` | Token 计数工具（基于 `tiktoken`） |

### Token 计数

```bash
pnpm tokens <file> [<file> ...]   # 多个文件自动汇总
node scripts/count-tokens.mjs <file>
```

使用 `tiktoken` 的 `cl100k_base` 编码（DeepSeek-V3 / GPT-4 兼容），**零网络调用、毫秒级返回**。可用于：

- 评估 System Prompt、Skill 文档注入 LLM 的成本
- 监控 RAG 检索后总 token 数，避免超上下文窗口
- 代码评审时量化"精简能省多少 token"

---

## 知识库 Wiki

项目在 `.qoder/repowiki/zh/` 维护了一份持续更新的 Wiki，涵盖十几个分类：

- API 服务架构 / 聊天 API 接口 / 系统测试 API
- Admin 管理后台 / RAG 参数配置 / 仪表板 / 提示词管理 / 模型配置 / 知识库管理
- RAG 引擎实现 / 查询路由与分类 / 检索算法 / 上下文管理 / 缓存与性能
- 专业技能模块 / 技能开发指南
- 前端应用详解 / UI 组件系统 / 响应式 / 样式主题
- 安全防护系统 / 幻觉检测 / 输入输出检测 / 风险评估
- 开发工具与脚本 / 代码质量 / 验证脚本
- 故障排除与维护 / 性能优化 / 系统监控
- 系统架构设计 / 前端架构 / 后端架构 / 数据流 / 系统集成
- 配置与部署 / 构建流程 / 环境配置 / 监控日志
- 项目概述 / 快速开始 / 技术栈 / 系统架构总览

**Wiki 是给 AI 协作工具（如 Cursor、Claude Code）按需加载的**，不要通读整个 Wiki。详细加载策略见 [AGENTS.md](file:///Users/dengxiongshihao/Downloads/projects/AGENTS.md) 的「Project Wiki (Load on Demand)」章节。

---

## AI 协作约定

项目使用 [AGENTS.md](file:///Users/dengxiongshihao/Downloads/projects/AGENTS.md) 作为 AI 协作工具（Cursor / Claude Code / Trae 等）的约定文件。**它是英文的、控制在 3000 tokens 以内**，由 AI 工具自动加载。

主要约定：

- **精简原则**：AGENTS.md 只写"是什么 / 怎么做"，原理/教程/工作流归 Wiki
- **按需加载**：Wiki 不要一次通读，按任务场景加载对应子目录
- **严禁事项**：不主动改其他文档、不写 emoji、不过度设计、Wiki 仅供参考以代码为准

如果你要让 AI 修改代码，建议直接说"参考 `AGENTS.md` 的约定 + `Wiki` 的相关章节"。

---

## 常见问题

### Q: 端口 8080 被占用怎么办？

修改 `scripts/dev.sh` 第 5 行的 `PORT=8080` 为其他端口（如 3000、4000），并同步更新 `AGENTS.md` 和 `README.md` 中的端口说明。

### Q: 如何新增一个 Skill？

1. 在 `skills/<skill-name>/` 下创建 `SKILL.md`
2. 在 Admin 后台注册（详见 Wiki）
3. 同步更新本 README 的 Skills 表格

### Q: 如何修改 AI 回复格式？

1. 修改 `src/app/api/chat/route.ts` 的 System Prompt
2. 修改 `src/app/page.tsx` 中 AI 气泡的渲染逻辑
3. 同步更新 AGENTS.md 和 Wiki

### Q: 如何切换 LLM 模型？

修改 `src/app/api/chat/route.ts` 中的 model 名称。详见 Wiki「模型配置」章节。

### Q: Type check / Lint 报错怎么办？

```bash
pnpm ts-check       # 看类型错误
pnpm lint           # 看代码规范错误
```

多数情况下是缺少类型注解或 unused import，按提示修复即可。

---

## 部署与发布

详见 [Wiki - 配置与部署](file:///Users/dengxiongshihao/Downloads/projects/.qoder/repowiki/zh/content/配置与部署/) 章节。

简要流程：

1. `pnpm validate` 确保 CI 全绿
2. `pnpm run build` 产出生产产物
3. `pnpm run start` 启动生产服务
4. 通过反向代理（Nginx / Caddy）暴露到公网

---

## 参考链接

### 官方文档

- [Next.js 16](https://nextjs.org/docs)
- [React 19](https://react.dev)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS 4](https://tailwindcss.com/docs)
- [React Hook Form](https://react-hook-form.com)
- [Zod](https://zod.dev)

### 项目内文档

- [AGENTS.md](file:///Users/dengxiongshihao/Downloads/projects/AGENTS.md) — AI 协作约定（英文）
- [DESIGN.md](file:///Users/dengxiongshihao/Downloads/projects/DESIGN.md) — 设计规范详情
- [SPEC.md](file:///Users/dengxiongshihao/Downloads/projects/SPEC.md) — 项目规格说明
- [Wiki](file:///Users/dengxiongshihao/Downloads/projects/.qoder/repowiki/zh/) — 知识库

---

## 重要提示

1. **必须使用 pnpm** — `preinstall` 钩子已强制，使用 npm/yarn 会报错
2. **优先复用 shadcn/ui** — 不要重复造基础组件
3. **LLM SDK 仅后端使用** — 客户端调用会暴露密钥、绕过鉴权
4. **AGENTS.md < 3000 tokens** — 修改后跑 `pnpm tokens AGENTS.md` 验证并更新自报数值
5. **Wiki 仅供参考** — 以代码实际行为为准
