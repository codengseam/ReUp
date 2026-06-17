# BOSS Agent 项目规格文档

> 本文档旨在帮助 AI 快速理解项目结构、技术栈和各模块功能，以便更准确地进行代码修改和维护。

---

## 一、项目背景

### 1.1 项目简介

**BOSS Agent** 是一款以"资深 HR + 总裁视角"为特色的职场顾问智能体，专注于**晋升指导**和**面试辅导**两大场景。用户通过网页聊天即可获得结构化、有深度的职场建议。

### 1.2 核心价值

- **知识驱动**: 基于《大厂晋升指南》（李运华）、《面试现场》（白海飞）等专业书籍构建知识库
- **引导式对话**: 不直接给答案，通过提问引导用户思考
- **RAG 增强**: 结合检索增强生成技术，确保回答有据可依
- **安全可控**: 多层安全门禁，防止越狱攻击和不当内容

### 1.3 目标用户

- 职场人士（寻求晋升指导）
- 求职者（面试准备、简历优化）
- 技术管理者（团队管理、职业发展）

---

## 二、技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **框架** | Next.js (App Router) | 16.1.1 |
| **核心** | React | 19.2.3 |
| **语言** | TypeScript | 5.x |
| **UI 组件** | shadcn/ui (Radix UI) | - |
| **样式** | Tailwind CSS | 4.x |
| **LLM SDK** | coze-coding-dev-sdk | 0.7.24 |
| **表单** | React Hook Form + Zod | 7.70.0 / 4.3.5 |
| **图表** | Recharts | 2.15.4 |
| **包管理器** | pnpm | 9.0.0+ |

---

## 三、目录结构

```
/Users/dengxiongshihao/Downloads/projects/
├── src/                          # 源代码目录
│   ├── app/                      # Next.js App Router 目录
│   │   ├── page.tsx              # 主聊天页面（欢迎态 + 对话态 + 侧滑面板）
│   │   ├── layout.tsx            # 根布局组件
│   │   ├── globals.css           # 全局样式 + Design Token
│   │   ├── admin/                # 管理后台页面
│   │   │   ├── page.tsx          # 后台管理主页（6个Tab）
│   │   │   ├── _components/      # 后台组件
│   │   │   │   ├── dashboard-tab.tsx    # 概览Tab
│   │   │   │   ├── knowledge-tab.tsx    # 知识库Tab
│   │   │   │   ├── prompt-tab.tsx       # 提示词Tab
│   │   │   │   ├── model-tab.tsx        # 模型配置Tab
│   │   │   │   ├── rag-tab.tsx          # RAG参数Tab
│   │   │   │   └── metadata-tab.tsx     # 元数据Tab
│   │   │   └── _lib/
│   │   │       └── types.ts      # 后台类型定义
│   │   ├── admin-demos/          # 管理演示页面
│   │   │   └── page.tsx
│   │   └── api/                  # API 路由
│   │       └── chat/
│   │           └── route.ts      # POST /api/chat - SSE流式聊天接口
│   │
│   ├── components/               # React 组件目录
│   │   ├── chat/                 # 聊天相关组件
│   │   │   ├── types.ts          # 类型定义（Message, Citation, ModelConfig等）
│   │   │   ├── ChatMessage.tsx   # 消息气泡组件
│   │   │   ├── ChatInput.tsx     # 输入框组件
│   │   │   ├── WelcomeScreen.tsx # 欢迎页组件
│   │   │   └── CitationDrawer.tsx# 引文溯源侧边栏
│   │   └── ui/                   # shadcn/ui 基础组件库
│   │       ├── button.tsx        # 按钮组件
│   │       ├── card.tsx          # 卡片组件
│   │       ├── dialog.tsx        # 对话框组件
│   │       ├── drawer.tsx        # 抽屉组件
│   │       ├── input.tsx         # 输入框组件
│   │       ├── tabs.tsx          # 标签页组件
│   │       ├── table.tsx         # 表格组件
│   │       └── ...               # 其他UI组件
│   │
│   ├── hooks/                    # 自定义 React Hooks
│   │   ├── use-debounce.ts       # 防抖 Hook
│   │   └── use-mobile.ts         # 移动端检测 Hook
│   │
│   └── lib/                      # 工具函数库
│       ├── utils.ts              # cn() 等工具函数
│       ├── rag.ts                # RAG检索模块（核心引擎）
│       ├── coze-knowledge-api.ts # Coze知识库API封装
│       └── typo-correction.ts    # 错别字纠正
│
├── public/                       # 静态资源
│   ├── file.svg
│   ├── globe.svg
│   └── ...
│
├── scripts/                      # 构建脚本
│   ├── dev.sh                    # 开发环境启动
│   ├── build.sh                  # 生产构建
│   ├── start.sh                  # 生产启动
│   └── validate.sh               # 代码校验
│
├── 任务/                         # 任务文档
│   └── BOSS_Agent_RAG_v3_真实化改造.md
│
├── .next/                        # Next.js 构建输出（自动生成）
├── dist/                         # 自定义服务器编译输出
├── node_modules_副本/            # 依赖备份
│
├── package.json                  # 项目依赖配置
├── tsconfig.json                 # TypeScript 配置
├── next.config.ts                # Next.js 配置
├── tailwind.config.ts            # Tailwind CSS 配置
├── components.json               # shadcn/ui 配置
├── README.md                     # 项目说明文档
├── AGENTS.md                     # Agent 详细说明
├── DESIGN.md                     # 设计规范
└── SPEC.md                       # 本规格文档
```

---

## 四、核心模块详解

### 4.1 前端聊天界面 (`src/app/page.tsx`)

**职责**: 主聊天页面，包含欢迎态、对话态、侧滑面板

**核心功能**:
- **欢迎态**: 居中布局 + 4个快捷入口胶囊按钮
- **对话态**: 用户气泡(翡翠绿) + AI气泡(4板块Markdown渲染)
- **侧滑面板**: 8个Skills列表 + 模型配置 + 清空对话
- **输入区**: 自适应高度textarea + Enter发送/Shift+Enter换行
- **流式渲染**: 通过 `fetch` + `ReadableStream` 实时增量渲染AI回复
- **RAG状态提示**: 检索中/生成中状态指示器
- **语音输入**: Web Speech API 支持
- **sessionStorage持久化**: 对话历史保存

**关键状态**:
```typescript
const [messages, setMessages] = useState<Message[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [status, setStatus] = useState<string>('');
const [sidebarOpen, setSidebarOpen] = useState(false);
const [modelConfig, setModelConfig] = useState<ModelConfig>(...);
```

---

### 4.2 后端 API (`src/app/api/chat/route.ts`)

**职责**: SSE流式聊天接口，处理RAG检索 + LLM生成

**请求格式**:
```typescript
POST /api/chat
{
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  model?: string,  // 模型ID
  customProvider?: {  // 自定义模型配置
    providerType: string;
    endpoint: string;
    apiKey: string;
    modelId: string;
  },
  ragParams?: Record<string, unknown>,  // RAG参数
  customPrompt?: string  // 自定义System Prompt
}
```

**响应格式** (SSE):
```
data: {"status": "understanding"}
data: {"status": "searching"}
data: {"thinkingStep": {...}}
data: {"status": "generating"}
data: {"meta": {"citations": [...], "strategy": "..."}}
data: {"content": "文本片段"}
data: {"confidence": "high", "confidenceReason": "..."}
data: [DONE]
```

**核心流程**:
1. 输入门禁检查 (`inputGuard`)
2. RAG检索 (`retrieve`)
3. 话题越界检测
4. 构建Grounded System Prompt
5. LLM流式生成
6. 输出门禁检查 (`outputGuard`)
7. 幻觉校验 (`hallucinationCheck`)
8. 置信度评估 (`assessConfidence`)

**模型白名单**:
```typescript
const ALLOWED_MODELS = [
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260215',
  'doubao-seed-2-0-mini-260215',
  'deepseek-v3-2-251201',
  'kimi-k2-5-260127',
  'glm-4-7-251222',
  'glm-5-0-260211',
  'minimax-m2-5-260212',
  'qwen-3-5-plus-260215',
];
```

---

### 4.3 RAG 检索引擎 (`src/lib/rag.ts`)

**职责**: 知识库语义检索 + 混合检索 + 重排序

**核心函数**:

| 函数 | 功能 | 说明 |
|------|------|------|
| `retrieve()` | 主检索函数 | 完整RAG流程入口 |
| `semanticSearch()` | 语义检索 | KnowledgeClient.search() 向量搜索 |
| `hybridSearch()` | 混合检索 | 语义 + 关键词并行，RRF融合 |
| `rerankResults()` | LLM重排序 | 用LLM对候选文档重新排序 |
| `generateHydeAnswer()` | HyDE生成 | LLM生成假想答案用于检索 |
| `rewriteQueryViaLLM()` | 查询重写 | 口语化转标准化查询 |
| `routeQueryViaLLM()` | 查询路由 | 决定检索策略(direct/multiquery/hyde) |
| `inputGuard()` | 输入门禁 | 安全检测（越狱/话题越界） |
| `outputGuard()` | 输出门禁 | 输出安全检测 |
| `hallucinationCheck()` | 幻觉校验 | LLM-as-Judge 检测幻觉 |

**检索策略**:
- **direct**: 简单明确问题，直接检索
- **multiquery**: 复杂问题，分解为多个子问题
- **hyde**: 模糊问题，先生成假想答案再检索

**缓存系统**:
- LRU缓存，最大500条
- 默认TTL: 5分钟

---

### 4.4 知识库 API (`src/lib/coze-knowledge-api.ts`)

**职责**: 封装 Coze Open API 知识库操作

**核心函数**:

| 函数 | 功能 |
|------|------|
| `listKnowledgeBases()` | 列出知识库 |
| `createKnowledgeBase()` | 创建知识库 |
| `deleteKnowledgeBase()` | 删除知识库 |
| `uploadDocument()` | 上传文档 |
| `listDocuments()` | 列出文档 |
| `deleteDocument()` | 删除文档 |
| `getDocumentStatus()` | 获取文档处理状态 |
| `getDocMetadata()` | 获取文档元数据 |
| `setDocMetadata()` | 设置文档元数据 |

**元数据结构**:
```typescript
interface DocMetadata {
  tags: string[];
  category: 'promotion' | 'interview' | 'general';
  skillName?: string;
  sourceBook?: string;
  author?: string;
  chapter?: string;
}
```

---

### 4.5 管理后台 (`src/app/admin/`)

**职责**: 后台管理界面，6个功能模块

| Tab | 功能 |
|-----|------|
| **概览** | 系统状态、使用统计 |
| **知识库** | 知识库管理、文档上传 |
| **提示词** | System Prompt 编辑 |
| **模型配置** | 默认模型设置 |
| **RAG 参数** | 检索参数调整 |
| **元数据** | 文档元数据管理 |

---

### 4.6 UI 组件库 (`src/components/ui/`)

**职责**: shadcn/ui 基础组件，基于 Radix UI

**常用组件**:
- **表单**: `button`, `input`, `textarea`, `select`, `checkbox`, `switch`, `slider`
- **布局**: `card`, `separator`, `tabs`, `accordion`, `scroll-area`
- **反馈**: `alert`, `dialog`, `toast`, `sonner`, `spinner`
- **导航**: `dropdown-menu`, `menubar`, `sidebar`
- **数据展示**: `table`, `avatar`, `badge`, `tooltip`, `popover`

---

## 五、8 个 Skills 定义

| # | 名称 | 分类 | 触发信号 | 来源 |
|---|------|------|---------|------|
| 1 | 晋升底层逻辑 | 晋升类 | "我绩效很好，为什么没晋升？" | 《大厂晋升指南》 |
| 2 | 晋升三大原则 | 晋升类 | "我该学什么技术？" | 《大厂晋升指南》 |
| 3 | 能力三重境界 | 晋升类 | "这个业务做了两年还能怎么提升？" | 《大厂晋升指南》 |
| 4 | 领域专家演进 | 晋升类 | "升了总监天天开会怎么办？" | 《大厂晋升指南》 |
| 5 | 素质模型对齐 | 面试类 | "怎么自我介绍？" | 《面试现场》 |
| 6 | 亮点挖掘 | 面试类 | "简历没亮点怎么办？" | 《面试现场》 |
| 7 | 盲区导航 | 面试类 | "面试被问住怎么圆？" | 《面试现场》 |
| 8 | 反问框架 | 面试类 | "面试最后问什么？" | 《面试现场》 |

---

## 六、开发规范

### 6.1 包管理

```bash
# ✅ 必须使用 pnpm
pnpm install
pnpm add package-name
pnpm add -D package-name

# ❌ 禁止使用 npm 或 yarn
```

### 6.2 组件开发

- **优先使用 shadcn/ui 组件** (`src/components/ui/`)
- **使用 TypeScript** 定义 Props 类型
- **使用 `@/` 路径别名** 导入模块

### 6.3 样式开发

- **使用 Tailwind CSS v4**
- **使用 cn() 工具函数** 合并类名
- **主题变量** 定义在 `src/app/globals.css`

### 6.4 LLM 调用规范

- **仅在后端使用** LLM SDK，禁止客户端直接调用
- **使用 stream() 流式输出**，前端使用 SSE 消费
- **HeaderUtils.extractForwardHeaders** 必须用于转发请求头

---

## 七、构建和运行命令

```bash
# 开发环境启动
pnpm run dev          # 端口 5000，支持 HMR

# 类型检查
pnpm ts-check

# 代码检查
pnpm lint

# 构建
pnpm run build

# 生产启动
pnpm run start

# 完整校验
pnpm run validate
```

---

## 八、设计规范

- **主色**: 翡翠绿 `#10b981`
- **背景**: 纯白 `#FFFFFF`
- **风格**: 极简、专业、干净利落
- **Design Token**: 见 `src/app/globals.css`

---

## 九、环境变量

```bash
# Coze API 配置
COZE_API_KEY=your_api_key
COZE_API_BASE_URL=https://api.coze.cn
```

---

## 十、相关文档

- [README.md](file:///Users/dengxiongshihao/Downloads/projects/README.md) - 项目说明
- [AGENTS.md](file:///Users/dengxiongshihao/Downloads/projects/AGENTS.md) - Agent 详细说明
- [DESIGN.md](file:///Users/dengxiongshihao/Downloads/projects/DESIGN.md) - 设计规范
- [任务/BOSS_Agent_RAG_v3_真实化改造.md](file:///Users/dengxiongshihao/Downloads/projects/任务/BOSS_Agent_RAG_v3_真实化改造.md) - RAG改造任务

---

## 十一、快速定位指南

| 需求 | 文件位置 |
|------|---------|
| 修改聊天界面 | [src/app/page.tsx](file:///Users/dengxiongshihao/Downloads/projects/src/app/page.tsx) |
| 修改API逻辑 | [src/app/api/chat/route.ts](file:///Users/dengxiongshihao/Downloads/projects/src/app/api/chat/route.ts) |
| 修改RAG检索 | [src/lib/rag.ts](file:///Users/dengxiongshihao/Downloads/projects/src/lib/rag.ts) |
| 修改知识库API | [src/lib/coze-knowledge-api.ts](file:///Users/dengxiongshihao/Downloads/projects/src/lib/coze-knowledge-api.ts) |
| 修改管理后台 | [src/app/admin/page.tsx](file:///Users/dengxiongshihao/Downloads/projects/src/app/admin/page.tsx) |
| 修改类型定义 | [src/components/chat/types.ts](file:///Users/dengxiongshihao/Downloads/projects/src/components/chat/types.ts) |
| 修改UI组件 | [src/components/ui/](file:///Users/dengxiongshihao/Downloads/projects/src/components/ui/) |
| 修改全局样式 | [src/app/globals.css](file:///Users/dengxiongshihao/Downloads/projects/src/app/globals.css) |
| 修改System Prompt | [src/app/api/chat/route.ts](file:///Users/dengxiongshihao/Downloads/projects/src/app/api/chat/route.ts) (SYSTEM_PROMPT常量) |

---

## 十二、近期架构变更（2026-06-13）

详见 [docs/superpowers/specs/2026-06-13-architecture-optimization-design.md](../docs/superpowers/specs/2026-06-13-architecture-optimization-design.md)。

核心变化：`rag.ts` 拆 8 文件 / LLM 调用 4→1 合并 / Skill 配单 JSON / Admin 鉴权后端化 / Citation 强制编号 / 反馈持久化。

---

*文档生成时间: 2026-06-12；2026-06-13 追加 §12 架构变更*
