# Spec 01: JD 解析 + 简历分析 + JD 匹配 (P0)

## 目标

建立一个完整的「简历分析工作台」，用户上传 JD 和简历后，一站式完成三件事：
1. JD 结构化解析（职位、要求、薪酬、考察重点）
2. 简历完整分析（结构化展示、ATS 评分、强项弱项诊断、错别字/格式/时间冲突检测）
3. JD vs 简历匹配度分析（匹配分、缺什么、怎么补）

## 现状

| 模块 | 文件 | 状态 |
|------|------|------|
| JD 解析 | `features/jd/parser.ts` (141行) | 已实现 LLM + 规则引擎双路径，但缺少「考察重点」字段 |
| 简历解析 | `features/resume/parser-text.ts` (884行) | 已实现，但展示内容过于精简，不展示原始文本对照 |
| ATS 评分 | `features/resume/ats.ts` (375行) | 已实现关键词提取+覆盖率计算，但缺少「强项弱项诊断」 |
| JD 匹配 | `features/resume/matcher.ts` (280行) | 已实现维度评分+优先级建议，但分开展示，未整合 |
| 智能匹配 | `features/jd/smart-matcher.ts` | 已实现 LLM 匹配，但输出格式与前端脱节 |

## 用户故事

### US-1: JD 解析
> 作为求职者，我粘贴或上传 JD 文本后，系统自动提取职位名称、部门、职级、薪资范围、硬性要求、岗位职责、技能要求、**考察重点（面试官可能关注什么）**，并以结构化卡片展示。

**验收标准**：
- 粘贴纯文本 JD，LLM 解析成功输出结构化 JSON
- 上传 PDF/Word JD，先提取文本再解析
- 「考察重点」字段：LLM 从 JD 中推断面试官可能重点考察的 3-5 个维度（如：系统设计能力、团队管理经验、高并发经验）
- 解析失败时规则引擎兜底，不阻塞流程

### US-2: 简历分析
> 作为求职者，我上传简历后，系统展示**完整结构化内容（与源文档一致，不省略）**，同时给出 ATS 评分、强项、弱项、以及文本质量诊断（错别字、格式问题、时间线冲突、前后矛盾）。

**验收标准**：
- 简历解析结果展示**所有字段**：姓名、职位、联系方式、工作经历（每条完整 bullet）、项目经历（每条完整 bullet）、技能列表、教育背景
- 展示原始文本与解析结果的**左右对照视图**（左侧原文高亮，右侧结构化卡片）
- ATS 评分：基于 JD 关键词覆盖率的百分比
- 强项诊断：JD 关键词中已覆盖的项（绿色标记）
- 弱项诊断：JD 关键词中未覆盖的项 + 缺少的板块（如：没有量化数据、没有项目经历）
- 文本质量诊断：
  - 错别字检测（如：明显的同音错字）
  - 格式问题（如：日期格式不统一）
  - 时间线冲突（如：工作经历时间重叠）
  - 前后矛盾（如：技能列表有 Python 但工作经历从未提及）

### US-3: JD 匹配度分析
> 作为求职者，系统自动对比我的简历和目标 JD，给出匹配分数、各维度分项得分、缺失项、以及可执行的改进建议。

**验收标准**：
- 整体匹配分（0-100）
- 分维度得分（技能匹配、经验匹配、学历匹配、软技能匹配等）
- 缺失项列表（JD 要求但简历中找不到的）
- 改进建议（按优先级排序，每条建议指向具体简历段落）
- 支持一键跳转到 STAR 改写（Phase 2 功能）

## 技术方案

### 新增/修改的 API 路由

```
POST /api/resume/analyze
  - 合并当前 parse + ats + match-report 三个 API
  - 输入: resumeFile + jdText
  - 输出: { resume: ResumeDocument, jd: JDDocument, ats: ATSResult, match: MatchReport, diagnostics: DiagnosticResult }
  - 约束: ≤80 行（薄壳，调 service）
```

### 新增/修改的 Service 模块

```
features/resume/diagnostics.ts          # 新增：文本质量诊断（错别字、格式、时间冲突、矛盾）
features/resume/diagnostics/typo.ts     # 新增：错别字检测
features/resume/diagnostics/timeline.ts # 新增：时间线冲突检测
features/resume/diagnostics/format.ts   # 新增：格式一致性检测
features/resume/diagnostics/contradiction.ts # 新增：前后矛盾检测
features/jd/parser.ts                   # 修改：增加「考察重点」字段
features/jd/types.ts                    # 修改：JDDocument 增加 focusPoints 字段
```

### 新增/修改的 UI 组件

```
components/shared/resume/ResumeAnalyzer.tsx    # 新增：分析工作台主组件
components/shared/resume/ResumeRawCompare.tsx  # 新增：原文 vs 结构化左右对照
components/shared/resume/DiagnosticsPanel.tsx  # 新增：诊断结果面板
components/shared/jd/JdCard.tsx                # 新增：JD 结构化卡片
components/shared/resume/MatchGauge.tsx        # 新增：匹配度仪表盘
```

### 数据流

```
用户上传简历 + JD
  → /api/resume/analyze
    → parseResume(file)       → ResumeDocument
    → parseJD(jdText)         → JDDocument
    → extractJdKeywords(jd)   → JdKeyword[]
    → computeAtsCoverage()    → ATSResult
    → classifyDimensions()    → DimensionMap
    → generatePriorities()    → priorities
    → runDiagnostics(resume)  → DiagnosticResult
  → 返回完整分析结果
  → 前端渲染：工作台左右分栏
```

## 测试要求

| 类型 | 覆盖目标 | 关键用例 |
|------|----------|----------|
| 单元测试 | diagnostics 模块 ≥80% | 错别字检测中文/英文、时间冲突多种场景、格式不一致检测 |
| 集成测试 | /api/resume/analyze | 完整流程: 上传→解析→诊断→匹配，mock LLM |
| 性能测试 | 解析耗时 | 884行 parser-text 解析 ≤500ms，全流程 ≤3s |

## 验收检查清单

- [ ] JD 粘贴后 3 秒内完成解析，展示结构化卡片
- [ ] 简历上传后展示完整内容（不省略任何字段）
- [ ] 原文 vs 结构化左右对照视图可用
- [ ] ATS 评分正确显示
- [ ] 文本质量诊断覆盖错别字/格式/时间冲突/矛盾 4 类
- [ ] JD 匹配度正确显示，改进建议可执行
- [ ] `pnpm ts-check && pnpm lint && pnpm test` 全绿