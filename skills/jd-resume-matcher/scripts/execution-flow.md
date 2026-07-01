# execution-flow.md — 执行流程图

> 被 `../SKILL.md` 第 10 步引用。本文件是端到端执行流，AI 须按图顺序推进，每个阶段有明确的输入/产出/检查点。

## 1. 流程总览（文字版流程图）

```
[输入: 简历文本 + JD 文本]
        │
        ▼
[0. 输入校验] ──缺一→ 暂停索取 / 转单侧 skill
        │
        ▼
[1. 编排 resume-evaluator] ──产出→ 简历结构化画像
        │                   └─复用 highlight-extractor / competency-model-alignment
        ▼
[2. 编排 jd-decoder] ──产出→ JD 结构化画像（含 job_type / rigor / 隐含要求）
        │
        ▼
[3. 第一层: 刚性校验] (rules/matching-model.md §1)
        │
        ├── 命中 eliminate 或 ≥2 Fatal ──→ overall=0 → [终止: 建议放弃] → 输出报告
        ├── 命中 1 Fatal ───────────────→ 封顶 45 → 继续走完流程（报告置顶告警）
        └── 全 pass ───────────────────→ 继续
        │
        ▼
[4. 第二层: 弹性语义匹配] (rules/matching-model.md §2)
   skill / experience / soft_skill 三维双通道打分
        │
        ▼
[5. 第三层: 多维加权] (rules/dimension-weights.md)
   按 job_type 选权重 + 关键词密度动态调整 + 归一化 → overall 0-100
        │
        ▼
[6. 缺口诊断] (scripts/gap-diagnosis.md)
   六大类逐项检查 → gap 列表
        │
        ▼
[7. 缺口分级] (rules/gap-classification.md)
   每条 gap 终判 Fatal / Important / Bonus
        │
        ▼
[8. 改进建议排序] (rules/improvement-priorities.md)
   影响×可行性矩阵 → P0/P1/P2/P3，每条指向简历段落
        │
        ▼
[9. 触发 interview-question-generator]
   基于 Important/Bonus 缺口 + JD 高频考点 → 预生成面试题
        │
        ▼
[10. 失败模式自检] (rules/boundaries.md §5)
   逐项勾选，未过则回退修正
        │
        ▼
[11. 输出完整报告] (prompts/jd-resume-match.prompt.md JSON Schema)
   overall + dimension_scores + gaps + improvements + interview_questions + confidence
```

---

## 2. 阶段契约

### 阶段 0 输入校验
- 输入：简历文本 + JD 文本
- 产出：通过 / 暂停信号
- 检查点：任一为空或信息严重不足 → 暂停索取，不进入阶段 1

### 阶段 1 简历侧编排
- 输入：简历文本
- 产出：`resume_profile`（教育/经历/技能/项目/软技能/量化指标）
- 复用：`highlight-extractor` 榨取亮点、`competency-model-alignment` 素质对齐
- 检查点：若简历造假信号触发 → 直接跳阶段 10 自检失败处理

### 阶段 2 JD 侧编排
- 输入：JD 文本
- 产出：`jd_profile`（job_type / rigor / required_skills / responsibilities / soft_skill_reqs / keyword_density / 隐含要求）
- 检查点：JD 模糊 → 暂停索取；JD 内部矛盾 → 标 `jd_inconsistent`

### 阶段 3 刚性校验
- 输入：`resume_profile` + `jd_profile.rigor`
- 产出：`rigid_check`（passed / fatal_count / eliminate / fatal_gaps）
- 公式：见 `../rules/matching-model.md` §1
- 分支：eliminate 或 ≥2 Fatal → overall=0，跳阶段 9 后直接输出

### 阶段 4 弹性匹配
- 输入：`resume_profile` + `jd_profile` 弹性部分
- 产出：skill / experience / soft_skill 三维 0-100 分 + overreach flag
- 公式：见 `../rules/matching-model.md` §2

### 阶段 5 多维加权
- 输入：三维得分 + education 维度分 + job_type + keyword_density
- 产出：`overall_score`（0-100，已封顶）+ `dimension_scores` + `weight_adjustments`
- 公式：见 `../rules/dimension-weights.md` + `match-scoring.md`

### 阶段 6 缺口诊断
- 输入：`resume_profile` + `jd_profile` 全量
- 产出：gap 列表（含隐含要求挖掘）
- 模板：见 `gap-diagnosis.md`

### 阶段 7 缺口分级
- 输入：阶段 6 gap 列表
- 产出：每条 gap 标 Fatal/Important/Bonus + 修复难度 + 建议优先级
- 规则：见 `../rules/gap-classification.md`

### 阶段 8 改进建议排序
- 输入：分级后的 gap 列表
- 产出：P0-P3 改进建议，每条指向简历段落 + 关联 gap id + 预期提分
- 规则：见 `../rules/improvement-priorities.md`

### 阶段 9 面试题预生成
- 输入：Important/Bonus 缺口 + JD 高频考点 + 简历可被追问的薄弱点
- 产出：针对性面试题（含预期考察点 + 作答方向）
- 编排：调用 `interview-question-generator`
- 检查点：面试题必须可溯源到具体缺口或 JD 要求，不得泛泛出题

### 阶段 10 失败模式自检
- 输入：阶段 1-9 全部产出
- 产出：自检通过 / 回退信号
- 清单：见 `../rules/boundaries.md` §5

### 阶段 11 输出报告
- 输入：阶段 1-10 产出
- 产出：符合 `../prompts/jd-resume-match.prompt.md` JSON Schema 的完整报告
- 检查点：含"匹配分 ≠ 录用概率"声明；confidence < 0.5 置顶告警

---

## 3. 异常路径速查

| 异常 | 触发阶段 | 处置 |
|------|---------|------|
| 简历造假信号 | 阶段 1 | 判 Fatal，终止评分，报告标注，不输出匹配分 |
| 简历信息严重不足 | 阶段 0/1 | 暂停索取，不打分 |
| JD 模糊 | 阶段 0/2 | 暂停索取 |
| JD 内部矛盾 | 阶段 2 | 标 `jd_inconsistent`，按更严刚性校验 |
| 弹性层 overreach | 阶段 4 | 降权 0.5 倍重算，confidence 降为 0.7 |
| 改进建议预期提分超上限 | 阶段 8 | 降级部分建议至 P2/P3 |
| 自检未通过 | 阶段 10 | 回退到对应阶段修正，不输出报告 |

---

## 4. 引用关系

- 全部 rules → `../rules/`
- 评分公式 → `match-scoring.md`
- 报告格式 → `../prompts/jd-resume-match.prompt.md`
- 编排的 skills → `resume-evaluator` / `jd-decoder` / `interview-question-generator`
