---
name: jd-resume-matcher
description: |
  用户同时提供"简历文本"与"JD 文本"，要求给出"匹配度评分 + 差距分析 + 改进建议 + 面试题预生成"的完整组合诊断报告时调用。
  该技能是简历-JD 分析专栏的"功能三"组合执行入口，把简历侧评估（resume-evaluator）与 JD 侧解析（jd-decoder）组合起来，
  采用"刚性校验 → 弹性语义匹配 → 多维加权"三层混合匹配模型，下游接缺口分级与改进优先级，并触发 interview-question-generator 预生成面试题。
  语言信号："我的简历匹配这个 JD 吗"、"帮我看看差距在哪"、"按这个岗位改简历"、"这个岗位我能投吗"。
  不适用于：只分析简历（无 JD，走 resume-evaluator）、只解读 JD（无简历，走 jd-decoder）、纯面试题生成（走 interview-question-generator）。
tags: [resume, jd, matching, gap-analysis, interview]
related_skills:
  - resume-evaluator
  - jd-decoder
  - interview-question-generator
  - competency-model-alignment
  - highlight-extractor
  - blind-spot-navigation
  - p8-lingyu-zhuanjia
---

# 简历-JD 组合匹配诊断（薄路由层）

> 本文件是**编排入口**，不重复细则。所有评分逻辑、权重表、缺口分级、改进排序、边界均下沉到 `rules/` 与 `scripts/`，AI 必须严格按文件顺序加载执行。

## 概念 (Concept)

### I — 方法论骨架 (Interpretation)

简历-JD 匹配不是"关键词命中率统计"，也不是单点 LLM 主观打分。本 skill 采用**混合匹配模型（Hybrid Matching Model）**，融合向量空间模型（VSM）与 P-E Fit 理论，方法论骨架由四个不可替换的支柱组成：

1. **VSM 语义相似度**：把简历经历与 JD 要求分别嵌入同一向量空间，用余弦相似度衡量"语义层面的能力对齐"，而非字面重叠。用于弹性匹配层。
2. **多维加权评分**：把匹配拆为技能 / 经验 / 学历 / 软技能四个子维度，按 JD 类型给不同权重（见 `rules/dimension-weights.md`），加权聚合为 0-100 整体分。
3. **刚性-弹性混合**：刚性条件（学历 / 年限 / 必备证书）先做硬性闸门，不满足直接降级或淘汰；弹性条件（技能熟练度 / 软技能 / 经验相关性）走语义匹配。刚性是"一票否决区"，弹性是"加权补偿区"。
4. **缺口分级**：差距不混为一谈，按 Fatal / Important / Bonus 三级切分（见 `rules/gap-classification.md`），每级对应不同修复难度与措辞。

理论锚点：**P-J Fit（Person-Job Fit）的 Demands-Abilities 互补匹配**——JD 的 Demands 与简历的 Abilities 之间的互补程度决定匹配度，区别于 P-O Fit（文化匹配）。详见 `references/matcher-refs.md`。

---

## 解释 (Explanation)

### E — 可执行步骤 (Execution) ★ 编排入口

本 skill 是薄路由层，agent 激活后必须按下列顺序加载子文件并执行，**不得跳过任何一层**：

1. **输入校验**
   - 必须同时拿到：简历文本（结构化或半结构化均可）+ JD 文本。
   - 缺一不可：缺简历 → 转 `resume-evaluator` 流程；缺 JD → 转 `jd-decoder` 流程。
   - **[检查点]**：若任一输入为空或为纯岗位名（如"前端工程师"无正文），暂停向用户索取，不得自行编造 JD。

2. **编排简历侧：`resume-evaluator`**
   - 调用 `resume-evaluator` 输出简历结构化画像（教育 / 经历 / 技能 / 项目 / 软技能 / 量化指标）。
   - 复用 `highlight-extractor`（榨取亮点）、`competency-model-alignment`（四层素质对齐）的产出作为画像补充。

3. **编排 JD 侧：`jd-decoder`**
   - 调用 `jd-decoder` 输出 JD 结构化画像（刚性要求 / 弹性要求 / 隐含要求 / 加分项 / 岗位类型）。
   - 岗位类型判定结果将驱动权重选择（技术 / 管理 / 通用）。

4. **第一层刚性校验 → 按 `rules/matching-model.md` §刚性层**
   - 逐项比对学历 / 年限 / 必备证书。命中任一致命缺口即按 `rules/gap-classification.md` Fatal 规则处理，整体分封顶。

5. **第二层弹性语义匹配 → 按 `rules/matching-model.md` §弹性层**
   - 技能 / 经验 / 软技能三维做 VSM 余弦相似度 + 关键词覆盖双通道。

6. **第三层多维加权 → 按 `rules/dimension-weights.md`**
   - 依据 JD 类型选权重表，加权得 0-100 整体匹配分 + 分维度得分。

7. **缺口分级 → 按 `rules/gap-classification.md` + `scripts/gap-diagnosis.md`**
   - 逐项产出差距清单，标注 Fatal / Important / Bonus 与修复难度。

8. **改进建议排序 → 按 `rules/improvement-priorities.md`**
   - 按"影响 × 可行性"矩阵排 P0-P3，每条建议必须指向简历具体段落。

9. **触发面试题预生成 → `interview-question-generator`**
   - 基于识别出的 Important / Bonus 缺口与 JD 高频考点，触发 `interview-question-generator` 预生成针对性面试题（含预期考察点与作答方向）。

10. **输出完整报告 → 按 `prompts/jd-resume-match.prompt.md` 的 JSON Schema**
    - 整体匹配分 + 分维度得分 + 缺口分级列表 + 改进建议优先级排序 + 预生成面试题 + 置信度。
    - 完整执行流图见 `scripts/execution-flow.md`。

> 评分公式与示例计算见 `scripts/match-scoring.md`；逐项检查模板见 `scripts/gap-diagnosis.md`。

### B — 边界 (Boundary) ★

本 skill 的完整边界、失败模式、与 ATS 分的区别、何时不信任匹配分，统一收敛到 → `rules/boundaries.md`。agent 在输出报告前必须读取该文件并自检是否触发任一失败模式。

---

## 相关 skills

- composes-with: `resume-evaluator`（简历侧画像）、`jd-decoder`（JD 侧画像）、`interview-question-generator`（面试题预生成）
- composes-with (conditional): `p8-lingyu-zhuanjia`（P8+ 高阶岗位领域深度评估；触发条件：JD 职级 P8+ 时在弹性语义匹配阶段触发，评估领域专家纵深）
- reuses: `highlight-extractor`（亮点榨取）、`competency-model-alignment`（素质模型对齐）、`blind-spot-navigation`（盲区防守）
- contrasts-with: 现有 8 个 skills 均为"单一方法论"，本 skill 是"组合编排入口"，不新增独立方法论，只做路由与加权聚合

---

## 审计信息

- **文件清单**: SKILL.md · rules/{matching-model, dimension-weights, gap-classification, improvement-priorities, boundaries}.md · scripts/{match-scoring, gap-diagnosis, execution-flow}.md · references/matcher-refs.md · prompts/jd-resume-match.prompt.md
- **理论依据**: P-E Fit 元分析（Kristof-Brown 2005）+ VSM + McClelland 胜任力，详见 `references/matcher-refs.md`
- **创建时间**: 2026-07-01
- **状态**: 薄路由层 V1，细则可独立迭代
