# gap-diagnosis.md — 缺口诊断执行清单

> 被 `../SKILL.md` 第 7 步调用。本文件是逐项检查模板，AI 须按清单逐条核对 JD 要求与简历实际，产出结构化缺口列表，再交 `../rules/gap-classification.md` 分级。

## 1. 使用方式

1. 从 `jd-decoder` 输出取 JD 结构化画像（刚性 / 弹性 / 隐含 / 加分）。
2. 从 `resume-evaluator` 输出取简历结构化画像。
3. 按下表六大类逐项比对，每条产出一条 gap 记录（无差距的项也记录为 `no_gap`，便于审计）。
4. 对每条 gap 调用 `../rules/gap-classification.md` 判级。

---

## 2. 逐项检查模板

### 2.1 学历类

| 检查项 | JD 来源 | 简历来源 | 判定问题 |
|--------|--------|---------|---------|
| 学历下限 | `rigor.education` | `education.degree` | 简历最高学位是否 ≥ JD 下限？低几档？ |
| 院校层次（若 JD 标注 985/211） | `rigor.education_extra` | `education.school` | 是否满足？不满足是 Fatal 还是 Bonus？（默认 Bonus，除非 JD 硬标） |
| 专业要求（若 JD 标注） | `rigor.major` | `education.major` | 专业是否对口？不对口是否有相关经历补偿？ |

### 2.2 年限类

| 检查项 | JD 来源 | 简历来源 | 判定问题 |
|--------|--------|---------|---------|
| 总工作年限 | `rigor.years` | `experience_years` | 是否达下限？差距多少年？JD 是否含"优秀可放宽"？差距 > 3 年且无放宽 → 淘汰（整体分 = 0，见 `matching-model.md` §1.3） |
| 相关领域年限（若 JD 标注） | `rigor.domain_years` | 相关领域项目时长合计 | 相关年限是否达标？ |
| 管理年限（管理岗） | `rigor.management_years` | 管理经历时长 | 是否达标？团队规模是否达 JD 要求？ |

### 2.3 证书类

| 检查项 | JD 来源 | 简历来源 | 判定问题 |
|--------|--------|---------|---------|
| 必备证书 | `rigor.certifications` where must_have | `certifications` | 是否齐全？缺哪个？ |
| 加分证书 | `rigor.certifications` where optional | `certifications` | 是否有？无则记 Bonus。 |

### 2.4 技能类

| 检查项 | JD 来源 | 简历来源 | 判定问题 |
|--------|--------|---------|---------|
| 必备技能 | `required_skills` where must_have | `skills` + 项目技术栈 | 是否覆盖？level 是"了解/熟悉/精通"？有无项目佐证？ |
| 加分技能 | `required_skills` where optional | `skills` + 项目技术栈 | 是否有？ |
| 技能深度 | JD 隐含（如"主导"/"精通"措辞） | 项目中体现的深度 | 简历是否仅"了解"层级但 JD 要求"精通"？ |

### 2.5 经验类

| 检查项 | JD 来源 | 简历来源 | 判定问题 |
|--------|--------|---------|---------|
| 领域相关性 | `responsibilities` + 行业 | `projects.domain` | 领域是否相关？相关度（0-100%）？ |
| 项目复杂度 | JD 隐含（用户量/规模信号） | `projects.metrics` | 简历项目规模是否匹配 JD 暗示的量级？ |
| 量化产出 | JD 强调"数据驱动/结果" | `projects.metrics` | 是否有量化指标？几个项目有？ |
| 业务场景匹配 | JD 业务场景（如"支付/风控/推荐"） | `projects` 业务场景 | 是否有同场景项目？ |

### 2.6 软技能类

| 检查项 | JD 来源 | 简历来源 | 判定问题 |
|--------|--------|---------|---------|
| 沟通协作 | `soft_skill_reqs` | `soft_skills` evidence | 有无具体事例？还是空泛自评？ |
| 抗压/驱动 | `soft_skill_reqs` | `soft_skills` evidence | 同上 |
| 领导力（管理岗） | `soft_skill_reqs` | 管理经历 + soft_skills evidence | 有无带团队/跨部门事例？ |
| 学习/创新 | `soft_skill_reqs` | `soft_skills` evidence | 有无学习新技能/优化流程事例？ |

---

## 3. gap 记录模板

每条检查产出一条记录：

```
- check_id: EDU-1
  category: education | years | certificate | skill | experience | soft_skill
  jd_requirement: "本科及以上，计算机相关专业"
  resume_actual: "本科，软件工程"
  status: no_gap | gap
  gap_detail: "无差距" 或 "专业不完全对口，但相关经历充分补偿"
  suggested_level: fatal | important | bonus | none   # 交 gap-classification 终判
  target_paragraph: "简历第 N 段「教育背景」"
```

---

## 4. 隐含要求挖掘清单

JD 中的隐含要求常未明写，AI 须主动追问/推断并纳入检查：

- [ ] JD 提及"从 0 到 1" → 隐含需要 0-1 项目经历
- [ ] JD 提及"高并发/大流量" → 隐含需要性能优化经验
- [ ] JD 提及"跨团队/跨部门" → 隐含需要协作事例
- [ ] JD 提及"快速迭代/敏捷" → 隐含需要敏捷协作经验
- [ ] JD 提及"线上事故/稳定性" → 隐含需要故障排查经验

每条隐含要求若简历无对应，按 Important 记 gap（除非 JD 明标"加分"）。

---

## 5. 汇总输出

诊断完成后产出 gap 列表交分级规则：

```
diagnosis_output:
  total_checks: N
  gaps: [ ... ]              # status=gap 的记录
  no_gaps: [ ... ]           # status=no_gap 的记录（审计用）
  hidden_reqs_found: [ ... ] # 隐含要求挖掘结果
```

随后由 `../rules/gap-classification.md` 对每条 gap 终判级别，再由 `../rules/improvement-priorities.md` 排优先级。

---

## 6. 引用关系

- 分级规则 → `../rules/gap-classification.md`
- 优先级排序 → `../rules/improvement-priorities.md`
- 数据来源 → `resume-evaluator` + `jd-decoder` 输出
- 失败模式（如简历信息不足无法诊断） → `../rules/boundaries.md` §1
