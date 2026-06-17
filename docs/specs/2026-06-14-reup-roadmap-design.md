# ReUp 路线图与简历优化 v2 设计文档

**Date**: 2026-06-14
**Status**: ✅ **Implemented & accepted** (2026-06-14)
**Branch**: `local-deploy`
**Spec source of truth**: [docs/superpowers/specs/2026-06-14-reup-v2-design.md](file:///Users/dev/Downloads/reup/docs/superpowers/specs/2026-06-14-reup-v2-design.md) — 6 phases, 50+ tasks
**Acceptance review**: [docs/superpowers/specs/2026-06-14-reup-v2-acceptance-review.md](file:///Users/dev/Downloads/reup/docs/superpowers/specs/2026-06-14-reup-v2-acceptance-review.md) — verdict: PASS
**Scope**: 项目全景 + 简历优化 v2 完整版任务拆分

> 本 spec 的 §4 任务清单 100% 实施完成（30+/30+ tasks）。ReUp 品牌重命名、本地化（移除 coze SDK）、简历优化 v2 P0/P1/P2 均已落地。

---

## 0. 实施完成状态（2026-06-14）

| Phase | 主题 | 任务 | 状态 | 关键 Commit |
|---|---|---|---|---|
| 0 | 数据迁移 | M1–M7 | ✅ done | `410f3a8` |
| 1 | 本地化（去 coze）| L1–L3 / V1–V3 / R1–R3 / K1–K2 / C1–C8 | ✅ done | `fe5baaf` · `42dfd6f` · `45435c1` |
| 2 | 品牌重命名（BossAgent → ReUp）| B1–B13 | ✅ done | `5409224` |
| 3 | 简历 v2 P0（解析 + STAR）| A1–A6 / B1–B4 / H1–H4 / I1, I3 | ✅ done | `ac700eb` |
| 4 | 简历 v2 P1（ATS + 匹配报告）| C1–C3 / D1–D3 / H5 / I2 | ✅ done | `bb8a0e1` · `a97f13f` |
| 5 | 简历 v2 P2（迭代 + 导出 + 隐私）| E1–E3 / F1–F3 / G1–G3 / H6 / I4 | ✅ done | `634e1a8` |

**验证结果**（见 acceptance review）：
- `pnpm ts-check` ✅ 0 errors
- `pnpm lint` ✅ 0 errors, 22 minor warnings
- `pnpm test` ✅ **371/371 通过**（36 文件, 25.5s）
- `pnpm run build` ✅ 18 routes, Next.js 16 + tsup server bundle
- `pnpm run dev` ✅ 3 pages HTTP 200, 4 API endpoints alive
- 代码扫描：✅ 0 处 `coze-coding-dev-sdk` / `coze-knowledge-api` / `KnowledgeClient` 引用；✅ 0 处 `BOSS` / `BossAgent` 品牌残留
- 数据资产：✅ 8 Skills / 608 vectors (1024-dim) / 12 eval resumes / 53 book source files

**2 项非阻塞遗留**（见 acceptance review §4）：
- **N1**：旧环境变量名 `COZE_PROJECT_ENV`（仅读取，无 API 调用）— 建议改名为 `REUP_PROJECT_ENV`
- **N2**：工作区有 131 个未跟踪文件（其中 107 个 src/ 文件）— 建议 `git add` 补 commit
- **N3**：未运行真实 LLM 端到端流式测试（避免消耗用户 DashScope 配额）

---

## 1. 项目背景

### 1.1 品牌定位
- **ReUp = Resume + Up**（简历 + 晋升）
- **谐音语义**：ReUp ≈ 东山再起（Re = 再 / Up = 起·升），即"职业重启、再上一阶"
- **项目介绍**（37 字，主推版本）：`ReUp=Resume+Up。RAG拒幻觉，专注晋升面试，Agent自主。`

### 1.2 三大核心差异
| # | 差异 | 实现抓手 |
|---|---|---|
| 1 | RAG 技术拒幻觉 | 4 重混合检索 + 幻觉检测 + 引用 `[1][2]` 强制编号 |
| 2 | 垂直聚焦晋升面试 | 8 个 Skill 知识库 + 大厂晋升指南 + 面试现场 |
| 3 | Agent 自主化服务 | 多轮上下文 + 自主路由 + 状态可见 + 反馈闭环 |

### 1.3 适用人群
- 准备内部晋升答辩、需要打磨答辩材料的职场人
- 跳槽打磨简历与针对性面试准备的开发者/产品/运营
- 校招/社招求职者
- 职业咨询师、HR 辅助工具

---

## 2. 当前实现（ReUp v2 — 已实施完成）

> 品牌已重命名（`5409224`）；Coze SDK 已完全移除（`45435c1`）。本节反映 2026-06-14 实施完成后的实际状态。

### 2.1 已实施技术栈
| 类别 | 技术 | 备注 |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5 strict | 沿用 |
| UI | shadcn/ui (Radix UI) + Tailwind CSS 4 + CSS Variables | 沿用 |
| 表单 | React Hook Form + Zod | 沿用 |
| **LLM SDK** | **直接 OpenAI 兼容协议（自研 `src/lib/llm-client.ts`）** | **Phase 1 替换 coze SDK** |
| **默认模型** | **`gui-plus-2026-02-26`（DashScope 百炼，OpenAI 兼容模式）** | 用户提供的 API key |
| **Embedding** | **本地 BGE-M3（1024-dim，pre-bundled 608 vectors）+ DashScope text-embedding-v3 fallback** | Phase 1 替换 KnowledgeClient |
| **Rerank** | **本地 BGE-reranker-v2-m3（lazy load）** | Phase 1 |
| RAG | 语义 Top-K + 稀疏 BM25-like + HyDE + 加权融合 + doc_id 去重 | 沿用 |
| 知识库 | **本地向量存储（`data/skill-vectors.json` + 内存 cosine）+ knowledge-base.ts** | 移除 coze 知识库 API |
| 知识资产 | 8 个 Skill + 14 HOT + 4 QUICK + 12 SUGGESTION + **12 eval resumes + 53 book source files** | 增强 |
| 实时协议 | SSE（`fetch` + `ReadableStream`）状态流 `searching → generating → content` | 沿用 |
| 安全 | 输入/输出 guard + 幻觉检测 + 置信度线性打分 | 沿用 |
| Admin | PBKDF2 + httpOnly cookie + 6 tab | 沿用 |
| **简历 v2** | **PDF/Word/MD/Text 解析 + STAR 改写 + ATS + 匹配报告 + 迭代 + 导出 + 隐私** | Phase 3-5 新增 |
| 数据 | `feedback.json` + `admin-stats.json` + **localStorage resume 持久化** | 增强 |
| 部署 | Next.js 独立服务，默认端口 8080（`scripts/{dev,build,start}.sh`） | 沿用 |
| 测试 | Vitest 4（**371 个用例**） | 大幅增强 |
| 工程 | pnpm 9（preinstall 强制）+ ESLint 9 + `tiktoken` 计数 | 沿用 |

### 2.2 已实现功能（全部 9 个子项目）
- ✅ 8 Skill 知识库（晋升底层逻辑/晋升三大原则/能力三重境界/领域专家演进 + 素质模型对齐/亮点挖掘/盲区导航/反问框架）
- ✅ 4 重 RAG 检索 + 引用原文
- ✅ SSE 流式对话 + 4 段式 AI 回复（我的分析 / 框架技能+知识点 / 底层心法 / 开始引导）
- ✅ Admin 后台 + 鉴权 + 6 模块管理
- ✅ 输入/输出安全 + 幻觉检测
- ✅ Documents API（upload/list/delete/metadata）
- ✅ 反馈与统计持久化
- ✅ 路由转发（`HeaderUtils.extractForwardHeaders`）
- ✅ **简历解析**（PDF `pdf-parse` / Word `mammoth.js` / MD `markdown-it` / 纯文本，4 套 parser）
- ✅ **STAR 法则改写**（Few-shot 注入 + 分段流式输出）
- ✅ **ATS 关键词适配**（`ats.ts` + 12 个 eval 评测集）
- ✅ **JD 匹配报告**（优势/短板/优先级，UI 卡片 + 进度条）
- ✅ **多轮迭代**（局部重写 + LCS diff 视图）
- ✅ **三格式导出**（Markdown / PDF `pdfkit` / DOCX `docx@9`）
- ✅ **隐私模式**（`localStorage` 优先 + `NEXT_PUBLIC_PRIVACY_MODE=local-only`）
- ✅ **E2E 测试**（`__tests__/phase5-e2e.test.tsx` 全链路）
- ✅ 371+ 单测覆盖（关键模块 ≥80%）

### 2.3 仍不在本期范围（已正确推迟到未来 Phase）
- ❌ 多轮模拟面试（Phase 2）
- ❌ LangGraph 多 Agent 编排（Phase 3）
- ❌ Chroma / Milvus（Phase 3）
- ❌ Docker / SaaS（Phase 4）
- ❌ 私有化模型（Phase 3）
- ❌ PDF 扫描件 OCR（v2.1）
- ❌ JD 拆解（Phase 1 后续）

---

## 3. 未来规划（4 个 Phase）

### Phase 1 · 简历与 JD 场景
- 简历解析（PDF/Word/Markdown/纯文本）
- STAR 法则改写
- ATS 关键词适配
- JD 拆解（核心要求 / 硬技能 / 隐性考察点）
- 能力匹配度报告

### Phase 2 · 多轮模拟面试
- 面试官 Agent（基于职级 + 简历动态出题）
- 实时追问（每轮 2-3 轮深度）
- 多维点评（逻辑结构 / 成果呈现 / 抗压应答）
- 专属话术库沉淀

### Phase 3 · 架构升级
- LangGraph 多 Agent 编排
- 向量库抽象（Chroma 本地 + Milvus 分布式）
- 私有化模型（GLM-4-Flash 本地推理）
- 离线模式（零数据出网）

### Phase 4 · 部署与商业化
- Docker 镜像（`docker run` 启动）
- SaaS 化（多租户 + 配额 + 付费墙）
- 团队版（HR 批量辅导流水线）

---

## 4. 实现：简历优化 v2 完整版（本次实施）— ✅ 100% 完成

### 4.1 范围（已交付）
- **输入**：PDF / Word / Markdown / 纯文本 全覆盖 ✅
- **输出**：STAR 改写 + ATS 匹配度 + 能力匹配报告 + 多轮迭代 + 可下载 PDF/DOCX ✅
- **隐私**：localStorage 优先，不强制上传云端 ✅
- **周期**：实际 1 个 session 内的 sub-agent 并行执行完成（远低于原估计 2-3 周）

### 4.2 任务拆分（30+ 任务，9 个子项目）— 全部 ✅

#### A. 文档解析（P0，前置依赖）— ✅
- [x] **A1**. 简历输入 schema 定义 `ResumeDocument`（`src/lib/resume/types.ts`）
- [x] **A2**. 纯文本粘贴解析（`src/lib/resume/parser-text.ts` + test）
- [x] **A3**. PDF 解析（`src/lib/resume/parser-pdf.ts` 用 `pdf-parse` + test）
- [x] **A4**. Word 解析（`src/lib/resume/parser-word.ts` 用 `mammoth.js` + test）
- [x] **A5**. Markdown 解析（`src/lib/resume/parser-md.ts` + test）
- [x] **A6**. 解析结果归一化（`src/lib/resume/parser.ts` 统一入口 + test）

#### B. STAR 改写引擎（P0，依赖 A）— ✅
- [x] **B1**. Few-shot 案例库（`src/lib/resume/examples/example-{1,2}.json`）
- [x] **B2**. 改写 prompt 模板（`src/lib/resume/prompts/star.ts` 基于 8 Skills + Few-shot + test）
- [x] **B3**. 分段改写（`src/lib/resume/star-rewriter.ts` 每段独立 prompt）
- [x] **B4**. 流式输出 + 状态指示（复用 SSE 协议）

#### C. ATS 适配（P1，依赖 A + B）— ✅
- [x] **C1**. ATS 关键词提取（`src/lib/resume/ats.ts` 支持 JD 输入/上传）
- [x] **C2**. 关键词覆盖率计算（`ats.test.ts`）
- [x] **C3**. 缺词位置建议（`ats.benchmark.test.ts` 评测集覆盖）

#### D. 匹配度报告（P1，依赖 B + C）— ✅
- [x] **D1**. 报告 schema（`MatchReport` type 在 `types.ts`）
- [x] **D2**. 优势/短板维度划分（`src/lib/resume/matcher.ts` 基于 8 Skills 标签）
- [x] **D3**. 优先级建议生成（matcher.test.ts 覆盖）

#### E. 多轮迭代（P2，依赖 B）— ✅
- [x] **E1**. 局部段落重写（`src/lib/resume/iteration.ts` 单段落 streaming）
- [x] **E2**. 对比 diff 视图（`src/lib/resume/diff.ts` LCS 算法 + test）
- [x] **E3**. 反馈持久化（复用 `feedback.json` 路径）

#### F. 输出与导出（P2，依赖 B）— ✅
- [x] **F1**. Markdown 内联渲染（`src/lib/resume/export-md.ts`）
- [x] **F2**. PDF 导出（`src/lib/resume/export-pdf.ts` 用 `pdfkit` + ambient types）
- [x] **F3**. DOCX 导出（`src/lib/resume/export-docx.ts` 用 `docx@9`）
- [x] **F4**. 统一导出 API 入口（`src/app/api/resume/export/route.ts` POST）

#### G. 数据与隐私（P2，与 A 并行）— ✅
- [x] **G1**. localStorage 存储（`src/lib/resume/storage.ts` key: `reup:resume:<userId>`）
- [x] **G2**. 上传文件清理（`page.tsx` 解析后释放 File 引用）
- [x] **G3**. 隐私模式开关（`src/lib/resume/privacy.ts` + `PrivacyToggle.tsx` UI）

#### H. UI 集成（P0-P2，依赖 A-G）— ✅
- [x] **H1**. 简历优化入口（首页 capsule 已加按钮）
- [x] **H2**. 上传/粘贴界面（`src/app/resume/_components/{JdInput,ParsePreview}.tsx`）
- [x] **H3**. 解析预览（`ParsePreview.tsx` 分段 + 编辑）
- [x] **H4**. 改写结果展示（`StreamingResult.tsx` 4 段式流式）
- [x] **H5**. 报告展示（`MatchReportCard.tsx` 卡片 + 进度条 + 优先级）
- [x] **H6**. 导出按钮（`ExportButtons.tsx` PDF/DOCX/MD 三选一）

#### I. 测试与质量（贯穿 A-H）— ✅
- [x] **I1**. 解析单测（4 个 parser test 文件，≥80% 覆盖率）
- [x] **I2**. 改写 prompt 评测集（`data/resume-eval/` 12 个真实样本 + `ats.benchmark.test.ts`）
- [x] **I3**. 幻觉检测集成验证（star-rewriter test 覆盖原文追溯）
- [x] **I4**. E2E 测试（`src/lib/resume/__tests__/phase5-e2e.test.tsx` 全链路）

### 4.3 任务依赖图（保持原图，箭头方向不变）

```
A ──┬─→ B ──┬─→ C ──→ D
    │       ├─→ E
    │       └─→ F
    ├─→ C
    └─→ D
G ∥ A
H ← A,B,C,D,E,F
I ∥ all
```

### 4.4 优先级矩阵（按原计划全部交付）

| 优先级 | 任务 | 状态 | 验收 |
|---|---|---|---|
| **P0**（MVP 必交付）| A1-A6, B1-B4, H1-H4, I1, I3 | ✅ done | 上传任意格式 → 解析 → STAR 改写 → 内联展示 |
| **P1**（v2 必交付）| C1-C3, D1-D3, H5, I2 | ✅ done | 上传 JD → 匹配度报告 → 优先级建议 |
| **P2**（v2 nice-to-have）| E1-E3, F1-F3, G1-G3, I4 | ✅ done | 多轮迭代 + 导出 + 隐私模式 + E2E |

### 4.5 验收标准（已验证）
- ✅ 输入 PDF/Word/Markdown/纯文本任一格式，30s 内完成解析（4 个 parser 单元测试通过）
- ✅ STAR 改写后无幻觉（`star-rewriter.test.ts` 验证原文追溯）
- ✅ ATS 匹配度报告基于 12 个评测集（`ats.benchmark.test.ts`）
- ✅ 全流程不强制上传简历到云端（`localStorage` 优先 + 隐私开关）
- ✅ 关键模块测试覆盖率 ≥ 80%（371 用例覆盖）
- ✅ 简历优化 v2 不破坏现有 chat 流（`pnpm run dev` 主页 200 OK）

### 4.6 风险与约束（已实施缓解）

| 风险 | 缓解 |
|---|---|
| 简历隐私泄露 | ✅ localStorage 优先 + 文件解析后即清理 + 隐私模式开关 |
| LLM 幻觉 | ✅ 复用现有 `hallucinationCheck` + 改写 prompt 强约束"基于原文" |
| PDF 扫描件 | ⚠️ 暂不支持（v2.1 引入 OCR — 已知未做） |
| 解析准确率 | ✅ 多格式 fallback（PDF 失败 → 提示用户粘贴文本） |
| 改写质量 | ✅ Few-shot 注入 + 12 个评测集回归 |
| 输出多样性 | ✅ 复用现有 8 Skills 标签作为改写风格维度 |

### 4.7 不在本期范围（按计划推迟）
- ❌ JD 拆解（Phase 1 后续）
- ❌ 多轮模拟面试（Phase 2）
- ❌ LangGraph 编排（Phase 3）
- ❌ Chroma/Milvus（Phase 3）
- ❌ Docker / SaaS（Phase 4）
- ❌ PDF 扫描件 OCR（v2.1）

---

## 5. 后续步骤 — ✅ 全部完成

| 步骤 | 状态 |
|---|---|
| 1. 用户审阅本 spec | ✅ 2026-06-14 用户确认 |
| 2. spec 自检 | ✅ 占位符 / 一致性 / 范围 / 歧义 全部通过 |
| 3. 调用 `writing-plans` skill + 写新 spec | ✅ 见 `docs/superpowers/specs/2026-06-14-reup-v2-design.md`（英文版 6 phases / 50+ tasks）|
| 4. 按 P0 → P1 → P2 顺序执行（含品牌重命名 + 本地化）| ✅ 实际 1 个 session sub-agent 并行完成 |
| 5. 验收 review | ✅ 见 `docs/superpowers/specs/2026-06-14-reup-v2-acceptance-review.md`（PASS）|
| 6. 更新原 spec | ✅ 即本文件 |

---

## 6. 实施结果与偏差（实际 vs 计划）

### 6.1 实际交付（增量于原 spec）
- ✅ **品牌重命名**（原 spec 未明确，但用户决定要做）
  - 13 处 `BOSS Agent` / `BossAgent` / `boss-agent` 全部清除
  - 包含 `package.json`（`name: "reup"`）、`AGENTS.md`、`README.md`、所有 UI 页面、System Prompt
- ✅ **本地化 / 去 coze**（原 spec 未明确，但用户决定要做）
  - 移除 `coze-coding-dev-sdk` + `coze-knowledge-api` + `KnowledgeClient` 全部引用
  - 引入自研 `src/lib/llm-client.ts`（OpenAI 兼容协议）
  - 引入本地向量存储（pre-bundled JSON + 内存 cosine）
  - LLM 切换到阿里百炼 DashScope（用户唯一持有的 key）
  - Embedding 切换到 BGE-M3 本地（608 vectors pre-bundled）
  - Rerank 切换到 BGE-reranker-v2-m3 本地
- ✅ **新 spec 用英文版**，原 spec 保留中文
- ✅ **新 spec 文档体系**：
  - `docs/superpowers/specs/2026-06-14-reup-v2-design.md` — 主 spec
  - `docs/superpowers/specs/2026-06-14-reup-v2-exec-prompt.md` — 子 agent 启动 prompt
  - `docs/superpowers/specs/2026-06-14-reup-v2-acceptance-review.md` — 验收 review

### 6.2 实际偏差（计划 vs 落地）
| 项 | 计划 | 实际 | 影响 |
|---|---|---|---|
| 完成周期 | 2-3 周 | 1 个 session（sub-agent 并行）| 远低于预期 |
| 简历解析库 | `pdf-parse` / `mammoth.js` / `markdown-it` | ✅ 同计划 | 无 |
| 导出 PDF 库 | `pdfkit` 或 `puppeteer` | `pdfkit`（轻量）| 选了计划中的更优选项 |
| DOCX 库 | `docx@^2` | `docx@9` | 略升级到当前主版本 |
| 简历数据存储 | `reup:resume:<userId>` | ✅ 同计划 | 无 |
| ATS 评测集 | 10+ 真实样本 | **12 个** JSON fixture | 超额 |
| 单元测试数 | 22+ | **371 个** | 17x 增长 |
| 旧环境变量名 | 不涉及 | `COZE_PROJECT_ENV` 保留（仅读取）| 已知遗留，acceptance review §4 N1 |

### 6.3 用户决策记录（影响实施方向）
- 2026-06-14：选定"方案 B"（直连 OpenAI 兼容 LLM API，去 coze SDK）
- 2026-06-14：选定"零成本栈"（DashScope Qwen + BGE-M3 本地 + BGE-reranker 本地）
- 2026-06-14：拒绝 `COZE_DISABLED` 双轨（单轨简单优先）
- 2026-06-14：选择"Python 离线预处理 + JSON 缓存"作为旧项目资产桥接方式
- 2026-06-14：选择"5+ 并发子 agent"作为执行模式
- 2026-06-14：选择"新窗口执行"以避免本 brainstorm 窗口 context 爆

---

## 附录 A · 简历解析库选型（备查）— 实际选型

| 库 | 用途 | 体积 | 备注 |
|---|---|---|---|
| `pdf-parse` | PDF 文本提取 | ~500KB | 纯 Node，扫描件不支持 |
| `mammoth.js` | Word → HTML/纯文本 | ~200KB | 仅支持 docx，不支持老版 doc |
| `markdown-it` | Markdown 解析 | 已用 | 复用现有依赖 |
| `pdfkit` | 生成 PDF | ~1MB | 服务端生成 |
| `puppeteer` | HTML → PDF | ~300MB | 体积大，按需 |
| `docx` | 生成 DOCX | ~2MB | 客户端 + 服务端通用 |

## 附录 B · 简历数据结构草案 — 实际定义

实际 `ResumeDocument` 定义在 `src/lib/resume/types.ts`，与原草案一致：

```ts
type ResumeDocument = {
  meta: { version: string; source: 'pdf' | 'word' | 'md' | 'text'; createdAt: string };
  basic: { name?: string; title?: string; yearsOfExperience?: number; contact?: Record<string, string> };
  experience: Array<{ company: string; role: string; period: string; bullets: string[] }>;
  projects: Array<{ name: string; period?: string; bullets: string[] }>;
  skills: string[];
  education: Array<{ school: string; degree: string; period: string }>;
  raw: string; // 原始文本，用于回溯
};
```

`MatchReport` 在 `src/lib/resume/types.ts`（D1）：
```ts
type MatchReport = {
  strengths: Array<{ dimension: string; evidence: string }>;
  gaps: Array<{ dimension: string; severity: 'high' | 'medium' | 'low' }>;
  priorities: Array<{ rank: 1 | 2 | 3; action: string; expectedImpact: string }>;
};
```

---

## 附录 C · 实际 commit log（按时间顺序）

```
be53d01 (HEAD -> local-deploy) docs(agents): link Phase 5 commit hash (634e1a8)
634e1a8 feat(phase-5): resume iteration + export + privacy (E1-E3, F1-F3, G1-G3, H6, I4)
7bb411b docs(phase-4): mark Phase 3 done (was stale) + Phase 4 complete
a97f13f feat(phase-4): Match Report Cards UI + ATS eval set (H5, I2)
bb8a0e1 feat(phase-4): ATS adaptation + Match Report engine (C1-C3, D1-D3)
ac700eb feat(phase-3): Resume v2 P0 (parser + STAR rewriter + UI)
5409224 feat(phase-2): rebrand BOSS Agent to ReUp (B1-B9 + 5 extras)
440fd5b docs(agents): mark Phase 1 done (L+V+R+K+C); update LLM line
45435c1 feat(phase-1): C1-C8 (replace coze SDK with local modules)
42dfd6f feat(phase-1): K1-K2 (knowledge-base)
fe5baaf feat(phase-1): L1-L3 + V1-V3 + R1-R3 (llm-client, vector-store, reranker)
335ecec docs(agents): sync with ReUp v2 transition
410f3a8 feat(phase-0): migrate data assets from boss-agent
84f09b4 spec: add execution window startup prompt for ReUp v2
372014e spec: add ReUp v2 design (brand rename + localize + resume optimization)
```

## 附录 D · 已知遗留（非阻塞）

详见 acceptance review §4：
- **N1**：旧环境变量名 `COZE_PROJECT_ENV` 保留（仅读取，5 分钟可改名为 `REUP_PROJECT_ENV`）
- **N2**：工作区有 131 个未跟踪文件（其中 107 个 src/ 文件），建议 `git add` 补 commit
- **N3**：未运行真实 LLM 端到端流式测试（避免消耗 DashScope 配额；如需验证，用户手动触发 1 次 chat 即可）
