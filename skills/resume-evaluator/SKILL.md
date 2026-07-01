---
name: resume-evaluator
description: |
  简历单独分析执行入口。当用户上传/粘贴简历需要全面诊断时调用。
  通过 8 维诊断（结构完整性 / 内容量化度 / STAR 叙事质量 / 时间线连续性 / 关键词密度 / 技能-经历一致性 / 错别字格式 / 差异化亮点）+ ATS 评分 + 胜任力对齐，产出结构化诊断报告与 STAR 重写建议。
  编排三个子 skill：highlight-extractor（亮点挖掘）/ competency-model-alignment（胜任力对齐）/ blind-spot-navigation（盲区规避）。
  语言信号："帮我看看这份简历"、"分析下我的简历"、"简历有什么问题"、"简历诊断"。
  不适用于：JD-简历匹配的深度匹配分析（走 jd-resume-matcher 主入口）、纯排版润色、简历造假包装。
related_skills: [highlight-extractor, competency-model-alignment, blind-spot-navigation]
tags: [resume, diagnostic, ats, star, competency]
---

# 简历八维诊断评估器（执行入口）

## 概念 (Concept)

### I — 方法论骨架 (Interpretation)

简历诊断不是"找错别字"，而是一次结构化的胜任力审计。本 skill 采用"8 维诊断 + ATS 评分 + 胜任力对齐"三层框架：

1. **结构完整性**：必备模块（基本信息 / 工作 / 项目 / 技能 / 教育）是否齐备且层次清晰。
2. **内容量化度**：bullet 中是否含可衡量数字（%/QPS/DAU/GMV 等）。
3. **STAR 叙事质量**：是否具备 Situation-Task-Action-Result 完整闭环。
4. **时间线连续性**：经历时段是否连续、有无无法解释的空窗。
5. **关键词密度**：核心技术/能力词是否覆盖目标岗位高频词。
6. **技能-经历一致性**：技能栏列出的技能是否在经历中有证据支撑。
7. **错别字/格式**：拼写、标点、排版规范性。
8. **差异化亮点**：是否有区别于同级别候选人的稀缺价值点。

8 维骨架细则见 `rules/diagnostics-8dim.md`；ATS 评分细则见 `rules/ats-scoring.md`；胜任力对齐细则见 `rules/competency-alignment.md`；STAR 重写细则见 `rules/star-rewrite.md`。

---

## 解释 (Explanation)

### E — 可执行步骤 (Execution)

本 SKILL.md 仅做路由编排，不承载细则。当 skill 被激活后，agent 应按 `scripts/execution-flow.md` 的流程图执行：

1. **解析输入**：接收简历文本，按 `scripts/diagnostic-checklist.md` 勾选式执行 8 维诊断。
2. **8 维评分**：对照 `rules/diagnostics-8dim.md` 逐维打分（0-10 分制）。
3. **ATS 评分**：若用户提供目标 JD，按 `rules/ats-scoring.md` 计算关键词覆盖率与匹配分；无 JD 时仅做通用关键词密度评估。
4. **编排子 skill**：
   - `highlight-extractor`：对"差异化亮点"维度得分低于 5 的经历，榨取高价值亮点素材。
   - `competency-model-alignment`：按 `rules/competency-alignment.md` 做显性/隐性胜任力识别与对齐。
   - `blind-spot-navigation`：对简历中暴露的能力盲区（技能栏声称但经历无证据），给出坦诚表述与降维话术。
5. **STAR 重写**：对叙事质量低下的 bullet，按 `rules/star-rewrite.md` 模板重写。
6. **综合评分**：按 `scripts/scoring-formula.md` 计算 8 维加权 + ATS 分 → 总分。
7. **输出报告**：按 `prompts/resume-analysis.prompt.md` 的 JSON Schema 产出结构化报告。

### B — 边界 (Boundary)

边界与失败模式详见 `rules/boundaries.md`。核心边界：
- 不用于 JD-简历匹配的深度匹配分析（那是 jd-resume-matcher 的职责）。
- 不替用户编造经历或夸大量化数据（诚信红线）。
- 简历为纯英文/海外岗位时，ATS 规则需切换至对应区域模型，本 skill 默认中文岗位。

---

## 原文 (Original Text)

### R — 原文 (Reading)

本 skill 为多源方法论整合，无单一原著。核心理论来源见 `references/resume-eval-refs.md`：
- McClelland (1973) 胜任力理论 → 支撑 8 维中"技能-经历一致性"与胜任力对齐。
- Spencer & Spencer (1993) 冰山模型 → 支撑显性/隐性胜任力分层。
- 白海飞《面试现场》经历包装章节 → 支撑 STAR 重写与差异化亮点。

---

## 场景 (Scenario)

### A2 — 触发场景 (Future Trigger)

#### 用户会在什么情境下需要这个 skill?

1. 用户粘贴一段简历文本，问"帮我看看这份简历有什么问题"。
2. 用户上传简历文件后，系统自动调用本 skill 做初筛诊断。
3. 用户问"我的简历能打几分"、"简历哪里需要改"。

#### 语言信号 (用户的话里出现这些就应激活)

- "帮我分析下简历"
- "简历诊断"
- "这份简历有什么问题"
- "简历能打几分"
- "看看我的简历写得怎么样"

#### 与相邻 skill 的区分

- 与 `highlight-extractor`：本 skill 是宏观诊断器，后者是被编排的微观亮点榨取工具。
- 与 `competency-model-alignment`：本 skill 评估简历整体，后者专注回答层次升华。
- 与 jd-resume-matcher：本 skill 不依赖 JD 做深度匹配，ATS 评分仅为可选增强项。

---

## 审计信息

- 蒸馏时间: 2026-07-01
- 编排依赖: highlight-extractor / competency-model-alignment / blind-spot-navigation
- 细则位置: rules/ + scripts/ + references/ + prompts/
