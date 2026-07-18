# ReUp 项目开发协作流程规则

本规则用于指导 Agent 在 Trae IDE 中与用户进行 **ReUp 职业晋升与简历顾问** 协作时的默认行为。
详细项目背景见 [AGENTS.md](../../AGENTS.md) 与 [docs/superpowers/specs/2026-06-14-reup-v2-design.md](../../docs/superpowers/specs/2026-06-14-reup-v2-design.md)。

ReUp 是以 "资深 HR + CEO" 视角的职业顾问: 晋升辅导、面试准备、简历优化。Web 聊天 + 流式 RAG 答复。

## 零、适用范围与边界声明

### 1. 适用场景

本规则 **仅适用于 ReUp 开发协作对话** —— 即用户在 Trae 中讨论 ReUp 功能开发、RAG 调优、Prompt 管理、Skill 编写、Bug 修复、部署优化、方案评审等工程类任务时。

**不适用于**: Trae IDE 本身的产品功能咨询、与 ReUp 开发无关的纯技术问答。这些由 Trae 内置能力或对应 Skill 负责, 本规则不干预。

### 2. Trae Skill 能力边界 (必须如实遵守)

| 能力 | Skill 是否支持 |
|---|---|
| 识别用户意图、加载规范、引导 Agent 行为 | 支持 |
| 让 Agent 调用 RunCommand / Read / Edit 等内置工具 | 支持 (通过 Prompt 引导) |
| **创建 / 调度 sub-agents** | **不支持** |
| **直接调用 MCP tools** | **不支持** |
| 执行代码、保存文件、维护状态 | **不支持** |

**重要**: 当用户提到"启用多个 agent""专家团并行""多 Agent 评审"时, 不要假装 Skill **文件本身**可以调度子 Agent。可行路径有三条:
- **路径 C (主路径)**: 主 Agent 经 Skill 引导, 用 Trae `Task` 工具 (`subagent_type` 参数) 在**当前会话内**启动多个 subagent 并行执行, 主 Agent 汇总。无需外部依赖。调度纪律见 `.trae/skills/dispatching-parallel-agents/SKILL.md`。
- **路径 A**: 由单个 Agent 串行切换视角 (架构师 → 测试 → 规则), 伪并行。仅当 Task 工具不可用时降级使用。
- **路径 B**: Skill 触发本地脚本 (如 `scripts/*.mjs`)。仅用于确定性批量任务, 不用于需要 LLM 推理的环节。

## 一、开发前准备

1. **读 AGENTS.md**: 技术栈、约定、禁令、模块清单全在里面, 不读就动手等于违规。
2. **读 spec**: 当前阶段的权威设计在 `docs/superpowers/specs/` 下, 不在 reply 里复述大段 spec。
3. **确认工具链**: pnpm 9 only; TS strict; Vitest 4; Next.js 16 App Router。
4. **确认环境**: `.env.local` 含 `DASHSCOPE_API_KEY`; `data/skill-vectors.json` (27MB, 608 chunks) 已在仓库。

## 二、并行 sub-agent 调度纪律 (路径 C)

用户偏好 **5+ 并行 sub-agent per batch** (见 AGENTS.md), 仅用于多步 / 可并行工作:

1. **任务拆分**: 每个任务自包含, 给出 goal / context / files / tests / acceptance / return-format。
2. **subagent_type 选择**:
   - `search`: 代码库探索、概念搜索、连接发现
   - `general_purpose_task`: 跨层改动、多步骤实现、产出大量 token 的任务
3. **不重复劳动**: 若已委托 subagent 做研究, 主 Agent 不再自己搜同一内容。
4. **汇总去重**: subagent 返回后, 主 Agent 去重 + 合并, 不原样转发。
5. **独立任务并行发**: 在同一条消息里发多个 Task 工具调用, 不要串行等待。

## 三、编码约定 (强制)

| 约定 | 要求 |
|---|---|
| 包管理器 | pnpm 9 only, `preinstall` 强制 only-allow pnpm |
| TS | strict, no implicit `any`, Zod 校验外部数据 |
| LLM SDK | server-side only, 所有 LLM 调用用 `stream()`, 客户端消费 SSE |
| Header 转发 | `HeaderUtils.extractForwardHeaders` 必须调用 |
| 测试 | TDD first on new modules, Vitest 4, 新模块 >=80% coverage, mock `fetch` for HTTP |
| 文档 | AGENTS.md 是 "what / how-to-use" only, < 2000 tokens; 不创建 README/DESIGN/SPEC 除非明确要求 |
| 禁令 | 不在代码/文档/reply 用 emoji (除非用户要求); 不在完成前未验证就声称完成 |

## 四、RAG / Skill 开发约定

1. **RAG 管线** (`src/lib/rag/`): semantic + sparse + HyDE → weighted fusion → doc_id dedup, Top-K=5。改动后跑 `pnpm test`。
2. **Skill 目录** (`skills/`): 每个 Skill 含 `SKILL.md` + `test-prompts.json`。新增 Skill 后跑 `pnpm tokens` 确认 AGENTS.md token 数。
3. **agent-skills 目录** (`agent-skills/` → `.trae/skills`): 开发流程 Skill (autoplan / brainstorming / qa / review 等) + 前端开发 Skill (frontend-design / frontend-skill / web-dev / theme-factory / slides)。这些是项目级 Skill 副本, 不随 Trae 内置版本漂移。
4. **向量索引** (`data/skill-vectors.json`): 27MB, 1024-dim BGE-M3, 已 bake 进镜像。改动 Skill 后需 `pnpm rebuild-vectors` 重建。

## 五、部署与发布

1. **本地开发**: `pnpm run dev` (port 8080, HMR)。
2. **Docker**: `make up PROD=1` (生产) / `make up` (开发, 自动加载 override)。
3. **魔搭空间同步**: push 到 `master` 触发 `.github/workflows/sync-to-modelscope.yml`。
   - 同步策略三级降级: fast-forward → force-with-lease → merge unrelated histories
   - 端口 7860 (魔搭健康检查强制), compose/fly 用 5000 覆盖
4. **pre-push hook**: `bash scripts/install-git-hooks.sh` 安装。push 前跑 ts-check + lint + test + 提交信息校验。严格模式 `REUP_STRICT_MASTER_GUARD=1` 禁止直推 master。
5. **发布前自检**: 见 `.trae/checklists/dev-checklist.md`。

## 六、Git 合并纪律

1. **不 force push master/main**: 永远。功能分支可 force-with-lease, 但必须先 explain why。
2. **合并流程**: 见 `docs/git-merge-prompt.md`。核心: rebase master → 本地验证 → push 功能分支 → PR → squash merge。
3. **提交信息**: 中文, 标题 <=72 字符, 正文说明"为什么改"。`python3 scripts/validate_commit_messages.py origin/master..HEAD` 校验。
4. **敏感文件**: 不提交 `.env` / `.env.local` / `*.db` / `data/.runtime-config.json`。

## 七、LoopAgent 沉淀 (每次开发完成后必做)

- 本次改动是否暴露了开发流程的新共性问题?
- 是否需要更新 `.trae/rules/` 下的规则文件?
- 是否需要更新 `.trae/checklists/dev-checklist.md`?
- 是否需要在 `docs/superpowers/plans/` 追加一条开发沉淀记录?
- 本次无新沉淀时, 明确说明"本次无新沉淀"。
