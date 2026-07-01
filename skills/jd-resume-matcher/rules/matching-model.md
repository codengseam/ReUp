# matching-model.md — 匹配模型核心规则

> 被 `../SKILL.md` 第 4-6 步调用。本文件定义三层混合匹配机制的硬规则，AI 必须逐层执行，层间不可乱序、不可跳过。

## 0. 理论锚点

- **P-E Fit（Person-Environment Fit）**：个体与环境匹配的伞形理论，下分 P-J Fit（人-岗）、P-O Fit（人-组织）、P-G Fit（人-群）、P-V Fit（人-职业）。
- **P-J Fit 的两向**：
  - **Demands-Abilities（D-A）互补匹配**：JD 的要求（Demands）与简历的能力（Abilities）互补程度。**本 skill 只做 D-A 方向**，这是"能不能胜任"的核心。
  - **Needs-Supplies（N-S）匹配**：个体需要与组织供给的匹配（薪酬、成长）。本 skill 不做 N-S，归 `jd-decoder` 的"隐含要求"侧。
- 元分析证据：Kristof-Brown, Zimmerman & Johnson (2005) 对 172 项研究的元分析显示，P-J Fit 与工作绩效相关系数约 0.44-0.56，与离职意向负相关约 -0.30。引用见 `../references/matcher-refs.md`。
- **向量空间模型（VSM）**：把能力/要求表示为同一嵌入空间中的向量，用余弦相似度衡量语义对齐，优于字面关键词匹配（可识别"前端"≈"Web 开发"）。

---

## 1. 第一层：刚性条件校验（硬性闸门）

刚性条件是"一票否决区"，先于一切加权计算。命中任一致命缺口即进入 Fatal 流程。

### 1.1 校验项

| 刚性维度 | 数据来源（JD 侧） | 数据来源（简历侧） | 判定规则 |
|---------|------------------|------------------|---------|
| 学历 | `jd-decoder` 输出的 `rigor.education`（如"本科及以上"） | `resume-evaluator` 输出的 `education.degree` | 简历最高学位 ≥ JD 下限 → 通过；低一档 → Fatal；低两档及以上 → 淘汰 |
| 工作年限 | `jd-decoder` 输出的 `rigor.years`（如"3 年以上"） | 简历可考证工作年限（按 `resume-evaluator` 的时间线计算，扣除重叠与空窗合理期） | 简历年限 ≥ JD 下限 → 通过；差距 ≤ 1 年且 JD 含"优秀可放宽" → 降为 Important；否则 → Fatal |
| 必备证书 | `jd-decoder` 输出的 `rigor.certifications`（如" CPA / 法考 / 教师资格"且标注为必备） | 简历证书列表 | 必备证书缺失 → Fatal；加分证书缺失 → 转入 Bonus 缺口 |

### 1.2 刚性层输出

```
rigid_check:
  passed: boolean
  fatal_gaps: [ {dimension, jd_requirement, resume_actual, severity} ]   # severity = fatal | eliminate
  cap_note: "命中 N 项 Fatal，整体匹配分封顶至 45"   # 见 §3 封顶规则
```

### 1.3 硬规则

- 刚性层**只做布尔判定**，不打 0-100 分。
- 学历"低一档"判定示例：JD 要求硕士，简历本科 → 低一档 → Fatal（封顶 45）；JD 要求本科，简历大专 → 低一档 → Fatal（封顶 45）；简历高中及以下 → 淘汰。
- 年限计算以"可考证"为准：实习期按 0.5 倍折算，除非简历明确标注"全职实习"。空窗期 ≤ 3 个月不扣减。
- 证书"必备"判定以 `jd-decoder` 标注为准；若 JD 措辞为"优先"/"加分"，一律不升级为刚性。

---

## 2. 第二层：弹性语义匹配（加权补偿区）

弹性条件走 VSM 余弦相似度 + 关键词覆盖双通道，分三个子维度独立打分。

### 2.1 双通道设计

| 通道 | 公式 | 作用 | 权重（通道内） |
|------|------|------|--------------|
| 语义相似度（VSM） | `cos_sim(emb(resume_slice), emb(jd_slice))` | 识别能力对齐，容忍同义表达 | 0.6 |
| 关键词覆盖 | `|matched_keywords| / |jd_keywords|` | 保障硬性技能词不被语义通道稀释 | 0.4 |

子维度得分 = `0.6 × semantic_score + 0.4 × keyword_coverage`，归一化到 0-100。

### 2.2 三个弹性子维度

| 子维度 | resume_slice | jd_slice | 说明 |
|--------|-------------|----------|------|
| 技能（Skill） | 简历技能清单 + 项目中体现的技术栈 | JD 技能要求 + 隐含技术栈 | 区分"必备技能"与"加分技能"，必备缺失在缺口层升级为 Important |
| 经验（Experience） | 项目职责 + 量化结果 + 行业领域 | JD 职责描述 + 行业要求 + 业务场景 | 用 STAR 结构对齐，量化数据加权 |
| 软技能（Soft Skill） | `competency-model-alignment` 输出的潜力/动机层 + 简历中的领导/协作证据 | JD 软技能要求（沟通、抗压、带团队等） | 软技能必须有事实支撑，不接受空泛自评 |

### 2.3 弹性层硬规则

- 语义相似度低于 0.3 的子维度，直接判该维度 ≤ 30 分，避免"语义漂移导致虚高"。
- 关键词覆盖为 0 但语义相似度 > 0.7 时，触发人工复核标记（`flag: semantic_overreach`），降权 0.5 倍后重算——防止 LLM 把无关经历硬解释为匹配。
- 软技能子维度若简历无任何事实证据（只有"沟通能力强"等空话），该维度得分上限 40。

---

## 3. 第三层：多维加权聚合

### 3.1 聚合公式

```
overall_score = Σ ( dimension_score_i × weight_i )
```

权重表见 `dimension-weights.md`，按 `jd-decoder` 判定的岗位类型选取。

### 3.2 刚性封顶规则（与第一层联动）

- 命中 1 项 Fatal（学历/年限/证书）→ 整体分封顶 45，且报告必须置顶"刚性不达标"告警。
- 命中 ≥ 2 项 Fatal 或任一 eliminate → 整体分 = 0，建议直接放弃该 JD（措辞见 `gap-classification.md` Fatal 模板）。
- 未命中 Fatal → 整体分按加权原值输出，区间 0-100。

### 3.3 分数段语义

| 分数段 | 语义 | 建议动作 |
|--------|------|---------|
| 85-100 | 高度匹配 | 直接投递，重点准备面试而非改简历 |
| 70-84 | 较匹配 | 投递前补 P0 改进项 |
| 55-69 | 部分匹配 | 投递前补 P0+P1，或寻找同团队更匹配岗位 |
| 45-54 | 刚性勉强 / 弹性较弱 | 谨慎投递，必须补 Important 缺口 |
| 0-44 | 刚性不达标或差距过大 | 放弃该 JD 或转方向 |

### 3.4 输出结构

```
match_result:
  overall_score: number          # 0-100，已应用封顶
  rigid_cap_applied: boolean
  dimension_scores:
    skill: number                # 0-100
    experience: number
    education: number            # 刚性层联动：通过=100，低一档=50，淘汰=0
    soft_skill: number
  confidence: number             # 0-1，见 boundaries.md 置信度规则
```

---

## 4. P-J Fit 理论说明（给 AI 的解释）

D-A 互补匹配的关键不是"简历越强越好"，而是"Abilities 与 Demands 的契合曲线"。一个过度资历的简历（Abilities 远超 Demands）匹配分也可能不高——因为用人单位会担心"留不住/要价高"。本 skill 当前版本**不做过度资历惩罚**（缺历史录用数据，见 `boundaries.md`），但 AI 在措辞时应提示：当 experience 维度得分远高于 JD 要求时，建议在求职信中说明"为什么愿意降级匹配"。

P-J Fit 与 P-O Fit 不可混淆：本 skill 评分只反映"岗位胜任度"，不反映"企业文化适配度"。若 JD 含明显文化信号（如"狼性/奋斗者文化"），AI 应在报告中单列"文化适配提示"，但不计入整体匹配分。

---

## 5. 与其他文件的引用关系

- 权重选取 → `dimension-weights.md`
- 缺口如何分级 → `gap-classification.md`
- 改进建议如何排序 → `improvement-priorities.md`
- 计算示例与公式演练 → `../scripts/match-scoring.md`
- 逐项检查模板 → `../scripts/gap-diagnosis.md`
- 失败模式与边界 → `boundaries.md`
