---
name: jd-decoder
description: |
  当用户输入一段 JD（职位描述）文本，需要将其结构化拆解为岗位画像、构建能力矩阵、推断隐性要求与考察重点时调用。
  本 skill 是"简历-JD 分析专栏"的 JD 单独分析执行入口，产出物主要供 AI 消费（RAG 检索 + skills-loader 注入 system prompt），人可读为辅。
  语言信号："帮我分析这个 JD"、"这段 JD 看不懂"、"这个岗位到底要什么人"、"JD 里没明说但实际看重什么"。
  不适用于：已有目标简历、需要做简历-JD 双向匹配（应走 smart-matcher），或 JD 文本过短无法推断（见边界）。
related_skills: [jinsheng-san-yuanze, nengli-sanzhong-jingjie, competency-model-alignment]
tags: [jd, competency, career, analysis, parsing]
---

# JD 解码器 (jd-decoder)

> 本 skill 为薄路由层：概念骨架在此，执行细则路由到 `rules/`，输出模板与流程在 `scripts/`，引用资料在 `references/`，结构化提示词在 `prompts/`。

## I — 概念层 (Interpretation)

JD 不是一份"招聘广告"，而是一份岗位的**胜任力契约**。jd-decoder 用两套互补方法论把 JD 从自然语言解码为可被 AI 消费的结构化岗位画像：

1. **JD 结构化拆解**：把 JD 文本切成 8 个核心字段（职位名称 / 部门 / 职级 / 薪资范围 / 硬性要求 / 岗位职责 / 技能要求 / 考察重点）。规则见 `./rules/jd-structure-parsing.md`。
2. **能力矩阵构建**：基于 McClelland 胜任力理论 + Spencer 冰山模型，将 JD 要求拆为**显性胜任力（知识/技能，权重 60%）**与**隐性胜任力（社会角色/自我认知/特质/动机，权重 40%）**。规则见 `./rules/competency-matrix.md`。

在此之上做两层推断：
- **隐性要求推断**：从文本线索推断未明说的文化、团队、技术栈、业务阶段。规则见 `./rules/implicit-requirements.md`。
- **考察重点预测**：从 JD 反推面试官最可能深挖的 3-5 个维度。规则见 `./rules/focus-points-inference.md`。

### 编排现有 skills（职级映射 + 能力判级）

JD 拆解完成后，jd-decoder 不重复造轮子，而是编排两个已有 skill 完成职级与能力判级：

| 编排步骤 | 调用 skill | 作用 | 映射关系 |
|---------|-----------|------|---------|
| 职级推断 | `jinsheng-san-yuanze` | 用"主动/成长/价值"三原则把 JD 的职级信号（如"独立负责""带领团队""主导优化"）映射到晋升段位 | JD 职级描述 → 三原则行为特征 → 段位（P5/P6/P7 等） |
| 能力判级 | `nengli-sanzhong-jingjie` | 用"基础/熟练/精通"三境界给 JD 中每条技能要求标注达标线 | JD 技能要求（精通/熟悉/了解）→ 三境界 → 该岗位对这项技能的最低境界要求 |

编排顺序与数据流见 `./scripts/execution-flow.md`。

## E — 执行入口 (Execution)

本 skill 被激活后，按以下路由执行（细则在对应文件中）：

1. **结构化拆解** → 按 `./rules/jd-structure-parsing.md` 提取 8 个核心字段，处理中英文 JD 差异与模糊情况。
2. **能力矩阵构建** → 按 `./rules/competency-matrix.md` 计算显性/隐性胜任力权重，区分硬性条件与加分项。
3. **职级推断（编排）** → 调用 `jinsheng-san-yuanze` 把职级信号映射到晋升段位。
4. **能力判级（编排）** → 调用 `nengli-sanzhong-jingjie` 给每条技能要求标注最低境界。
5. **隐性要求推断** → 按 `./rules/implicit-requirements.md` 推断文化/团队/技术栈/业务阶段，并标注置信度。
6. **考察重点预测** → 按 `./rules/focus-points-inference.md` 输出 3-5 个面试深挖维度。
7. **输出岗位画像** → 套用 `./scripts/jd-profile-template.md` 的 JSON 结构输出。

直接消费 JD 文本时，可使用 `./prompts/jd-analysis.prompt.md` 的结构化提示词（含 JSON Schema 与 few-shot）。

## B — 边界 (Boundary)

完整边界与失败模式见 `./rules/boundaries.md`。要点：

- JD 文本过短（有效信息 < 80 字）时不做推断，只做字段提取并标注"信息不足"。
- 不做"成功画像建模"（无历史在职/绩效数据，禁止编造"什么样的人能成功"）。
- 与简历分析的区分：jd-decoder 只解码 JD 单侧，不做简历-JD 双向匹配（那是 `src/features/jd/smart-matcher.ts` 的职责）。

## 相关 skills

- composes-with: `jinsheng-san-yuanze`（职级信号 → 晋升段位映射）
- composes-with: `nengli-sanzhong-jingjie`（技能要求 → 三境界最低达标线）
- contrasts-with: `competency-model-alignment`（后者评估候选人四层素质，本 skill 评估岗位要求，二者方向相反但可拼成 P-J Fit）

## 审计信息

- **来源**: "简历-JD 分析专栏"项目功能二（JD 单独分析执行入口）
- **理论根基**: McClelland (1973) 胜任力理论 + Spencer & Spencer (1993) 冰山模型 + Kristof-Brown (2005) P-J Fit。详见 `./references/jd-decoder-refs.md`
- **蒸馏时间**: 2026-07-01
