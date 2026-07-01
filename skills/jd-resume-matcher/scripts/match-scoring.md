# match-scoring.md — 匹配评分计算脚本

> 被 `../SKILL.md` 第 5-6 步与 `../rules/matching-model.md` §3 调用。本文件给出可执行的评分公式与端到端示例计算，AI 须按此公式产出分数，不得主观赋值。

## 1. 输入契约

```
inputs:
  resume_profile:        # 来自 resume-evaluator
    education: {degree, school, major, graduation_year}
    experience_years: number
    skills: [{name, level, evidence}]
    projects: [{title, role, bullets, metrics, domain}]
    soft_skills: [{name, evidence}]
  jd_profile:            # 来自 jd-decoder
    job_type: tech | management | general
    rigor: {education, years, certifications[]}
    required_skills: [{name, must_have: boolean}]
    responsibilities: []
    soft_skill_reqs: []
    keyword_density: {skill, experience, education, soft_skill}   # ‰
```

---

## 2. 第一层刚性校验（伪代码）

```
function rigid_check(resume, jd):
  fatal_count = 0
  eliminate = false
  gaps = []

  # 学历
  if degree_level(resume.education.degree) < degree_level(jd.rigor.education):
     diff = degree_level(jd.rigor.education) - degree_level(resume.education.degree)
     if diff >= 2: eliminate = true
     else: fatal_count += 1
     gaps.append({dim: education, severity: diff>=2 ? eliminate : fatal})

  # 年限
  if resume.experience_years < jd.rigor.years:
     gap = jd.rigor.years - resume.experience_years
     if jd.has_relax_clause and gap <= 1:
        gaps.append({dim: years, severity: important})   # 降级
     else:
        fatal_count += 1
        if gap > 3: eliminate = true
        gaps.append({dim: years, severity: fatal})

  # 必备证书
  for cert in jd.rigor.certifications where must_have:
     if cert not in resume.certifications:
        fatal_count += 1
        gaps.append({dim: certificate, severity: fatal})

  return {passed: fatal_count==0 and not eliminate, fatal_count, eliminate, gaps}
```

`degree_level` 映射：高中=1，大专=2，本科=3，硕士=4，博士=5。

---

## 3. 第二层弹性匹配（双通道）

### 3.1 单维度打分公式

```
function dimension_score(resume_slice, jd_slice, jd_keywords):
  sem = cosine_similarity(embed(resume_slice), embed(jd_slice))   # 0-1
  if sem < 0.3: sem_score = sem * 100 * 0.5   # 限速：低于 0.3 折半
  else: sem_score = sem * 100

  cov = |intersection(resume_keywords, jd_keywords)| / |jd_keywords|   # 0-1
  cov_score = cov * 100

  score = 0.6 * sem_score + 0.4 * cov_score

  # overreach 保护
  if cov == 0 and sem > 0.7:
     score = score * 0.5
     flag = semantic_overreach
  return {score, flag}
```

### 3.2 三维切片

| 维度 | resume_slice | jd_slice |
|------|-------------|----------|
| skill | skills 拼接 + projects 中的技术栈 | required_skills + responsibilities 中的技术词 |
| experience | projects 的 bullets + metrics + domain | responsibilities + 行业要求 |
| soft_skill | soft_skills 的 evidence（须有事例） | soft_skill_reqs |

### 3.3 软技能上限规则

若 resume 的 soft_skills 全部无 evidence（只有"沟通能力强"无事例），soft_skill 维度得分上限 40。

### 3.4 教育维度得分（与刚性层联动）

```
education_score:
  if rigid eliminate: 0
  elif rigid fatal (低一档): 50
  elif pass: 100
```

---

## 4. 第三层多维加权

### 4.1 权重选取

按 `jd_profile.job_type` 查 `../rules/dimension-weights.md` §1 基础表，再按 `keyword_density` 触发动态调整（§2），归一化得 `W_final`。

### 4.2 聚合

```
overall = Σ dimension_score[i] * W_final[i]
```

### 4.3 刚性封顶

```
if rigid.eliminate: overall = 0
elif rigid.fatal_count >= 2: overall = 0
elif rigid.fatal_count == 1: overall = min(overall, 45)
```

---

## 5. 端到端示例计算

### 5.1 案例输入

- 简历：本科，3.5 年经验，技能 React/TS/Node，项目"电商前台重构 QPS +40%"，软技能无具体事例。
- JD：技术岗，本科及以上，3 年以上，必备 React/TS，加分 K8s。技能词密度 9‰，经验词密度 7‰。

### 5.2 刚性层

- 学历：本科 ≥ 本科 → pass
- 年限：3.5 ≥ 3 → pass
- 证书：无必备证书 → pass
- `rigid_check.passed = true`，无封顶。

### 5.3 弹性层（假设嵌入得以下分数）

| 维度 | sem | sem_score | cov | cov_score | score |
|------|-----|-----------|-----|-----------|-------|
| skill | 0.82 | 82 | 0.67（React/TS 命中，K8s 缺） | 67 | 0.6×82+0.4×67=76 |
| experience | 0.70 | 70 | 0.60 | 60 | 0.6×70+0.4×60=66 |
| soft_skill | 0.55 | 55 | 0.40 | 40 | 0.6×55+0.4×40=49 → 上限 40（无 evidence）→ 40 |
| education | pass → 100 | - | - | - | 100 |

### 5.4 权重（技术岗 + 动态调整）

技能密度 9‰≥8‰ 触发，经验密度 7‰≥6‰ 触发：

```
W_adjusted = (60, 35, 10, 15)   # skill +10, exp +10
Σ = 120
W_final = (50.0%, 29.2%, 8.3%, 12.5%)
```

### 5.5 聚合

```
overall = 76×0.500 + 66×0.292 + 100×0.083 + 40×0.125
        = 38.0 + 19.3 + 8.3 + 5.0
        = 70.6 → 71
```

### 5.6 分数段语义

71 落在 70-84「较匹配」，建议投递前补 P0 改进项（K8s 加分项可补 side project，软技能补事例）。

### 5.7 置信度

```
confidence = 1.0(简历完整) × 1.0(JD完整) × 1.0(无造假) × 1.0(无overreach) × 0.85(量化数据少)
           = 0.85
```

---

## 6. 边界情形速查

| 情形 | 处置 |
|------|------|
| 简历无技能区，技能只在项目中体现 | resume_slice 用 projects 技术栈，cov 分母用 JD 必备技能数 |
| JD 无年限要求 | 年限项 pass，不参与刚性校验 |
| 管理岗无管理经历 | management_exp_score = 0，experience 维度按 §3 合成大幅拉低 |
| 候选人跨行（领域不匹配） | experience 的 sem 偏低，触发 Important 缺口，不自动判 Fatal |

---

## 7. 引用关系

- 公式依据 → `../rules/matching-model.md`
- 权重表 → `../rules/dimension-weights.md`
- 缺口判定 → `../rules/gap-classification.md`
- 失败模式自检 → `../rules/boundaries.md` §5
