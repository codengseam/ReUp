# matcher-refs.md — 本 skill 引用资料

> 被 `../SKILL.md` 与 `../rules/boundaries.md` 引用。本文件列出 jd-resume-matcher 所依据的学术文献与行业实践，每条标注作者、年份、标题、来源、关键论点摘要，确保可溯源。

## 1. 学术文献（P-E Fit / 胜任力理论）

### 1.1 Kristof-Brown, Zimmerman & Johnson (2005)

- **作者**: Amy L. Kristof-Brown, Ryan D. Zimmerman, Erin C. Johnson
- **年份**: 2005
- **标题**: Consequences of Individuals' Fit at Work: A Meta-Analysis of Person-Job, Person-Organization, Person-Group, and Person-Supervisor Fit
- **来源**: Personnel Psychology, 58(2), 281-342
- **关键论点摘要**: 对 172 项独立研究进行元分析，系统检验 P-J / P-O / P-G / P-V 四类匹配的工作后果。核心发现：
  - P-J Fit 与工作绩效（task performance）相关系数约 0.44-0.56，是四类匹配中对绩效预测最强的一类。
  - 各类匹配均与离职意向显著负相关（P-J 约 -0.30）。
  - Demands-Abilities（D-A）与 Needs-Supplies（N-S）两方向具有差异化后果，D-A 更预测绩效，N-S 更预测态度/留任。
- **对本 skill 的支撑**: 提供"刚性-弹性混合 + D-A 互补匹配"作为整体评分的理论合法性，以及"匹配分预测胜任度而非录用概率"的论据。详见 `../rules/matching-model.md` §0。

### 1.2 Kristof (1996)

- **作者**: Amy L. Kristof
- **年份**: 1996
- **标题**: Person-Organization Fit: An Integrative Review of Its Conceptualizations, Measurement, and Implications
- **来源**: Personnel Psychology, 49(1), 1-49
- **关键论点摘要**: 提出 P-O Fit 的整合框架，区分"补充性匹配（complementary fit）"与"互补性匹配（supplementary fit）"，并把 P-J（D-A/N-S）与 P-O 统一在 P-E Fit 伞形理论下。明确告诫 P-J 与 P-O 不可混测。
- **对本 skill 的支撑**: 支撑 `../rules/boundaries.md` §2.3"不做 P-O Fit 评分"的边界，避免把文化匹配混入岗位胜任度评分。

### 1.3 Edwards (1991)

- **作者**: Jeffrey R. Edwards
- **年份**: 1991
- **标题**: Person-Job Fit: A Conceptual Integration, Literature Review, and Methodological Critique
- **来源**: in Cooper & Robertson (Eds.), International Review of Industrial and Organizational Psychology, Vol.6, pp.283-357, Wiley
- **关键论点摘要**: 概念性整合 P-J Fit，明确 D-A 与 N-S 两向度的数学结构，指出线性差分（demands - abilities）与多项式回归两种建模方式，并指出简单差分会掩盖"过度资历"情形。
- **对本 skill 的支撑**: 支撑 `../rules/boundaries.md` §2.4"不做过度资历惩罚"的边界说明（缺数据标定过度资历-离职曲线，故当前版本不降分）。

### 1.4 Schneider (1987)

- **作者**: Benjamin Schneider
- **年份**: 1987
- **标题**: The People Make the Place
- **来源**: Personnel Psychology, 40(3), 437-453
- **关键论点摘要**: 提出 ASA（Attraction-Selection-Attrition）模型，论证组织内人员构成由"吸引-选择-摩擦"动态塑造，同质性随时间增强。意味着岗位的真实"画像"由在职者群体反推，而非 JD 静态描述。
- **对本 skill 的支撑**: 支撑 `../rules/boundaries.md` §2.1"不做成功画像建模"的边界——无历史录用/在职者数据，无法反推真实画像，故只做 JD 文本驱动的 D-A 匹配。

### 1.5 McClelland (1973)

- **作者**: David C. McClelland
- **年份**: 1973
- **标题**: Testing for Competence Rather than for Intelligence
- **来源**: American Psychologist, 28(1), 1-14
- **关键论点摘要**: 提出胜任力（competency）理论，主张用行为事例（BEI）识别"冰山以下"的动机/特质，而非依赖智力测试或学历等表面指标。胜任力须有可观测行为佐证。
- **对本 skill 的支撑**: 支撑 `../rules/matching-model.md` §2.3 软技能"必须有事实支撑，不接受空泛自评"的硬规则，以及软技能维度无 evidence 上限 40 的设计。

---

## 2. 行业实践（ATS / 人岗匹配产品）

### 2.1 resumeoptimizerpro.com — ATS 七类匹配模型

- **作者/机构**: ResumeOptimizerPro 团队
- **年份**: 访问 2026（产品文档持续更新）
- **标题**: How ATS Match Resume to Job Description（ATS 七维匹配）
- **来源**: https://resumeoptimizerpro.com （ATS 匹配维度说明文档）
- **关键论点摘要**: 主流 ATS 系统按七个维度做简历-JD 匹配过滤：
  1. **Skills**（技能关键词命中）
  2. **Job Titles**（过往职位名称匹配）
  3. **Education**（学历字段匹配）
  4. **Certifications**（证书匹配）
  5. **Management Level**（管理层级匹配）
  6. **Industries**（行业背景匹配）
  7. **Languages**（语言能力匹配）
  ATS 以字面关键词 + 同义词词典为主，多数不做语义嵌入。
- **对本 skill 的支撑**: 支撑 `../rules/boundaries.md` §3"与 ATS 分的区别"——本 skill 增加了 VSM 语义通道、改进建议、缺口分级，而 ATS 侧重字段可解析性与字面命中。提示用户优化后仍需保证 ATS 可解析。

### 2.2 智联招聘 × 通义千问 — 人岗匹配实践

- **作者/机构**: 智联招聘 × 阿里通义千问团队
- **年份**: 2023-2024（持续迭代）
- **标题**: AI 赋能人岗匹配实践（基于大模型的简历-JD 智能匹配）
- **来源**: 智联招聘技术博客 / 通义千问行业实践案例
- **关键论点摘要**: 采用"JD 结构化解析 → 简历结构化解析 → 多维向量召回 → 重排序"的工程链路；强调硬性条件（学历/年限）做前置硬筛，软性条件做向量相似度匹配；引入 rerank 模型对召回结果精排。指出纯语义匹配易出现"语义漂移导致虚高"，需关键词覆盖率兜底。
- **对本 skill 的支撑**: 支撑 `../rules/matching-model.md` §2"双通道（语义 0.6 + 关键词覆盖 0.4）"设计与 overreach 保护机制。

### 2.3 前程无忧 — AI 招聘助手七维测评

- **作者/机构**: 前程无忧（51job）AI 招聘助手团队
- **年份**: 2023-2024
- **标题**: AI 招聘助手候选人七维测评
- **来源**: 前程无忧招聘科技产品文档 / 行业分享
- **关键论点摘要**: 对候选人从七个维度做测评画像：专业能力、工作经验、教育背景、通用素质、职业稳定性、发展潜力、岗位匹配度。其中"岗位匹配度"作为综合维度，前六维为输入。强调测评须给出"分维度得分 + 改进建议"，而非单一总分。
- **对本 skill 的支撑**: 支撑 `../rules/matching-model.md` §3.4"输出整体分 + 分维度得分"的设计，以及 `../rules/improvement-priorities.md`"每条建议指向段落 + 预期提分"的可执行改进导向。

---

## 3. 引用使用规范

- 本 skill 所有 rules/scripts/prompts 在引用理论依据时，须回指本文件具体条目（如"依据 `matcher-refs.md` §1.1"）。
- 学术文献的论点摘要为二次概括，AI 不得在报告中声称"直接引用原文"，应表述为"基于 Kristof-Brown 等 (2005) 元分析结论"。
- 行业实践条目为公开产品/案例的二次整理，AI 不得声称"与某产品官方合作"，仅表述为"参考某产品公开做法"。

---

## 4. 待补充（非占位，标注为未来扩展方向）

> 本节列出可增强本 skill 的未来数据源，当前不可用，AI 不得假装已获取。

- 企业历史录用数据集（用于做"成功画像建模"，当前缺，对应 `../rules/boundaries.md` §2.1）。
- 行业离职率-过度资历曲线（用于做过度资历惩罚，当前缺，对应 §2.4）。
- 中国本土 P-J Fit 实证元分析（当前仅有西方样本为主，跨文化适用性待验证）。
