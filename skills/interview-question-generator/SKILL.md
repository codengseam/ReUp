---
name: interview-question-generator
description: |
  当用户需要根据简历和 JD 生成面试题集、准备模拟面试、或想预判面试官会问什么时调用。
  该技能是面试题生成的执行入口（薄路由层），编排 6 类题型 + 4 级难度 + 答案引导模板 + 八股文 RAG 外挂接口，产出结构化题集供 AI 消费（RAG 检索 + system prompt 注入）或人阅读。
  语言信号："帮我出几道面试题"、"根据我的简历和 JD 模拟面试"、"预判面试官会问什么"、"生成面试题集"。
  不适用于：单纯刷八股文题库（用 RAG 直查即可）、简历润色、薪资谈判。
related_skills:
  - reverse-questioning-framework
  - jinsheng-dicing-luoji
  - jinsheng-san-yuanze
  - highlight-extractor
  - blind-spot-navigation
  - competency-model-alignment
tags: [interview, question-generation, simulation, rag-hook]
---

# 面试题生成执行入口（薄路由层）

## I — 方法论骨架 (Interpretation)

高质量面试题不是凭空编造的题海，而是基于"简历实际内容 + JD 实际要求 + 能力缺口"三者交集，按题型分类、按难度分级、配以答案引导的结构化题集。本 skill 是**执行入口与编排层**，本身不承载全部细则，而是路由到 `rules/` 与 `scripts/`，并编排现有 skills 协同产出。

方法论骨架由四个支柱构成（细则见 `rules/`）：

| 支柱 | 解决的问题 | 细则文件 |
|------|-----------|---------|
| 6 类题型分类 | 出什么类型的题 | `rules/question-taxonomy.md` |
| 4 级难度分级 | 出多难的题 | `rules/difficulty-grading.md` |
| 答案引导模板 | 每题配什么答案与追问 | `rules/answer-guidance-template.md` |
| 八股文 RAG 外挂 | 基础知识题从哪来 | `rules/rag-hook-spec.md` |

核心原则（源自白海飞《面试现场》考核逻辑）：面试官的问题之间是有逻辑关系的，分三层递进——表层事实（扫描经验面）→ 深度细节（探究能力高低与潜力）→ 感受和观点（考查动机与价值观）。生成的题集必须复现这种分层结构，而非扁平罗列。

边界与失败模式见 `rules/boundaries.md`。

---

## E — 执行入口 (Execution)

本 skill 作为薄路由层，激活后按以下流程编排，**不重复承载细则**，全部具体规则路由到对应文件：

### 步骤 1：输入校验与缺口定位
- 输入：简历 + JD + 缺口列表（可选）+ 难度偏好（可选）。
- 校验简历与 JD 的信息充分度；信息不足时按 `rules/boundaries.md` 判停，不出题。
- **[检查点]**：若简历/JD 缺关键字段（技术栈、项目细节、职级要求），暂停向用户索取，不臆造。

### 步骤 2：题型选择（路由 → `rules/question-taxonomy.md`）
- 根据 JD 要求与简历内容，从 6 类题型中选择本次题集的配比。
- 数量配比建议与触发条件见 `rules/question-taxonomy.md` 每类题型的"数量配比建议"。

### 步骤 3：难度定级（路由 → `rules/difficulty-grading.md`）
- 按目标职级映射难度：P5-P7 对应 L1-L3，P8+ 含 L4。
- 每级生成 1-2 题，判定标准见 `rules/difficulty-grading.md`。

### 步骤 4：编排现有 skills（协同产出）
- 各题型与现有 skills 的编排关系：

| 题型 | 编排的 skill | skill 职责 |
|------|-------------|-----------|
| 技术深挖题 | `highlight-extractor` | 从简历平淡经历榨取可深挖的技术点 |
| 项目追问题 | `highlight-extractor` + `competency-model-alignment` | 榨取项目亮点后按四层模型组织追问 |
| 系统设计题 | `jinsheng-san-yuanze` | 用价值原则筛选 JD 中值得设计的高价值方向 |
| 行为面试题 | `competency-model-alignment` | 按经验-技能-潜力-动机四层设计行为题 |
| 反向提问题 | `reverse-questioning-framework` | 直接编排三元交集模型生成反问 |
| 八股文题 | RAG 外挂（见步骤 5） | 基础知识题从题库检索 |
| 通用缺口防守 | `blind-spot-navigation` | 针对简历与 JD 的缺口生成盲区降维预案 |

### 步骤 5：八股文 RAG 检索（路由 → `rules/rag-hook-spec.md`）
- 八股文题调用 RAG 外挂接口：输入（技术栈 + 难度 + 数量）→ 输出（题目 + 答案 + 标签）。
- 题库未命中时按 fallback 策略 AI 生成并标记"未经题库验证"。
- 与现有 `src/server/rag/search.ts` 的对接方式见 `rules/rag-hook-spec.md`。

### 步骤 6：生成答案引导（路由 → `rules/answer-guidance-template.md`）
- 每题输出结构：题目 / 参考答案 / 回答引导（STAR + 关键追问 + 评分要点）/ 考察点 / 难度等级 / 常见错误回答。
- 不同题型的模板变体见 `rules/answer-guidance-template.md`。

### 步骤 7：输出题集（路由 → `scripts/generation-flow.md`）
- 完整生成流程图见 `scripts/generation-flow.md`。
- 题库集成与检索调优见 `scripts/question-bank-integration.md`。
- 结构化提示词（供 LLM 直接执行）见 `prompts/interview-questions.prompt.md`。

---

## B — 边界 (Boundary)

完整边界与失败模式见 `rules/boundaries.md`。关键红线：

- **不造题**：每题必须可溯源到简历或 JD 的实际段落，禁止凭空编造简历上没有的技术栈或项目。
- **信息不足不出题**：简历/JD 缺关键字段时判停，不补全不臆测。
- **不出歧视性/违规题**：不涉及婚育、户籍、宗教、健康等受保护属性。
- **与刷题库的区别**：本 skill 是"基于个人简历+JD 的定制题集"，不是通用八股文题海；纯刷题用 RAG 直查即可，不必走本 skill 编排。

---

## 相关 skills (编排关系)

- composes-with: `reverse-questioning-framework`（反向提问题直接编排）
- composes-with: `jinsheng-dicing-luoji`（用晋升底层逻辑对标 JD 职级要求，定难度）
- composes-with: `jinsheng-san-yuanze`（用价值原则筛选系统设计题方向）
- composes-with: `highlight-extractor`（从简历榨取技术深挖与项目追问的素材）
- composes-with: `blind-spot-navigation`（针对缺口生成盲区降维预案）
- composes-with: `competency-model-alignment`（行为面试题按四层模型设计）
- depends-on: `rag-hook-spec`（八股文题依赖 RAG 外挂接口，见 `rules/rag-hook-spec.md`）

---

## 审计信息

- **引用资料**: 见 `references/interview-refs.md`
- **验证通过**: V1 待验证（薄路由层，细则路由到 rules/）
- **蒸馏时间**: 2026-07-01
