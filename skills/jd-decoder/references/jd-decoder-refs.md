# jd-decoder 引用资料

> 本文件列出 jd-decoder 引用的理论根基与行业实践。每条标注：作者、年份、标题、来源、关键论点摘要。返回上层路由见 `../SKILL.md`。

引用分两类：学术理论根基（4 条，可溯源至原始论文/著作）与行业实践（3 条，可溯源至公开产品/案例）。

---

## 一、学术理论根基

### 1. McClelland (1973) — 胜任力理论奠基

- **作者**: David C. McClelland
- **年份**: 1973
- **标题**: Testing for Competence Rather than for Intelligence
- **来源**: American Psychologist, 28(1), 1-14
- **关键论点摘要**:
  - 传统智力测验（IQ）与学历不能有效预测工作绩效，应改用"胜任力（competency）"评估。
  - 胜任力指"能区分高绩效者与普通绩效者的可观测行为特征"，需通过行为事件访谈（BEI）提取。
  - 提出"冰山"隐喻雏形：表层知识与技能易测量但预测力弱，深层动机与特质难测量但预测力强。
- **jd-decoder 应用**: `../rules/competency-matrix.md` 显性/隐性二分法的理论源头。JD 要求拆为可培训的显性层与难培养的隐性层，权重 60/40 即呼应"深层预测力更强但表层不可偏废"。

### 2. Spencer & Spencer (1993) — 冰山模型

- **作者**: Lyle M. Spencer Jr. & Signe M. Spencer
- **年份**: 1993
- **标题**: Competence at Work: Models for Superior Performance
- **来源**: John Wiley & Sons（专著）
- **关键论点摘要**:
  - 将胜任力结构化为冰山六层：知识（Knowledge）、技能（Skill）、社会角色（Social Role）、自我认知（Self-Image）、特质（Trait）、动机（Motive）。
  - 前两层（知识、技能）在水面之上，显性、可培训、易替换；后四层在水面之下，隐性、难培养、决定长期绩效。
  - 提供各层的行为指标与 BEI 提取方法，是胜任力模型建设的标准操作手册。
- **jd-decoder 应用**: `../rules/competency-matrix.md` 的 6 层分层表直接取自冰山模型。`../rules/implicit-requirements.md` 推断的 4 类隐性要求对应冰山下 4 层（社会角色/自我认知/特质/动机）。

### 3. Kristof-Brown et al. (2005) — P-J Fit 元分析

- **作者**: Amy L. Kristof-Brown, Ryan D. Zimmerman, Erin C. Johnson
- **年份**: 2005
- **标题**: Consequences of Individuals' Fit at Work: A Meta-Analysis of Person–Job, Person–Organization, Person–Group, and Person–Supervisor Fit
- **来源**: Personnel Psychology, 58(2), 281-342
- **关键论点摘要**:
  - 对 21 世纪以来的 P-E Fit（人-环境匹配）研究做元分析，证实 Person-Job Fit（P-J Fit，人-岗匹配）与工作绩效、满意度、留任率显著正相关。
  - P-J Fit 分两子类：Demands-Abilities Fit（岗位要求 vs 候选人能力）与 Needs-Supplies Fit（候选人需求 vs 岗位供给）。
  - 隐性匹配（价值观、动机层）对留任的预测力高于显性匹配（技能层）。
- **jd-decoder 应用**: jd-decoder 解码 JD 侧的"Demands"（岗位要求），供下游 `src/features/jd/smart-matcher.ts` 与简历侧的"Abilities"拼合成 P-J Fit。`../rules/boundaries.md` 明确"不做成功画像建模"也呼应此文——Fit 研究基于大样本元分析，单条 JD 无样本量支撑。

### 4. Edwards (1991) — P-J Fit 概念整合

- **作者**: Jeffrey R. Edwards
- **年份**: 1991
- **标题**: Person-Job Fit: A Conceptual Integration, Literature Review, and Methodological Critique
- **来源**: in Cooper & Robertson (Eds.), International Review of Industrial and Organizational Psychology, Vol.6, pp.283-357, Wiley
- **关键论点摘要**:
  - 整合并澄清了 P-J Fit 的两种方向：Demands-Abilities（D-A，岗位对人的要求 vs 人的能力）与 Needs-Supplies（N-S，人的需求 vs 岗位供给）。
  - 强调 Fit 是"双向"概念，单侧评估（只看人或只看岗）不构成 Fit，必须双侧对照。
  - 提出 Fit 的测量应区分"显性要求匹配"与"隐性要求匹配"，二者对结果变量影响不同。
- **jd-decoder 应用**: `../rules/boundaries.md`"与简历分析的区分"段落据此强调——jd-decoder 只解码 JD 单侧（D-A 中的 Demands），不做双侧 Fit 判断，Fit 由 `smart-matcher` 完成。`../rules/implicit-requirements.md` 的显性/隐性区分也呼应 Edwards 的两层匹配论。

---

## 二、行业实践

### 5. 北森 AI 招聘实践 — 岗位画像 + 人岗匹配 + 冰山上下 7 维度评估

- **作者/机构**: 北森人才管理研究院（Beisen）
- **年份**: 2020-2024（持续迭代）
- **标题**: 北森一体化人才管理平台 / AI 招聘解决方案
- **来源**: 北森官网及公开白皮书（https://www.beisen.com/）
- **关键论点摘要**:
  - 招聘智能化的核心是把 JD 结构化为"岗位画像"：显性维度（学历/经验/硬技能）+ 隐性维度（基于冰山模型的胜任力评估）。
  - 北森将冰山上下细化为 7 维度评估（知识、技能、社会角色、自我认知、特质、动机、价值观），通过测评 + AI 推断构建候选人画像，与岗位画像做人岗匹配。
  - 强调"硬性条件做红线一票否决，软性维度做加权评分"的两级匹配策略。
- **jd-decoder 应用**: `../rules/competency-matrix.md` 的 `red_lines`（一票否决）+ `competency_matrix`（加权评分）两级策略直接借鉴此实践。`../scripts/jd-profile-template.md` 的画像结构参考北森岗位画像范式。

### 6. Moka HR 智能招聘 — JD 结构化解析

- **作者/机构**: Moka（北京希瑞亚斯科技）
- **年份**: 2021-2024
- **标题**: Moka 智能招聘 / JD 智能解析
- **来源**: Moka 官网及公开案例（https://www.mokahr.com/）
- **关键论点摘要**:
  - 用 NLP 对非结构化 JD 文本做字段抽取：职位名、部门、职级、薪资、硬性要求、职责、技能，输出标准化岗位画像。
  - 处理中英文 JD 混排、程度词归一（精通/熟悉/了解映射）、硬性 vs 加分项区分。
  - 解析结果用于后续关键词匹配、JD 质量诊断、相似岗位推荐。
- **jd-decoder 应用**: `../rules/jd-structure-parsing.md` 的 8 字段抽取、中英文 JD 差异表、程度词映射表均参考 Moka 的 JD 解析实践，并与本项目 `src/features/jd/parser.ts` 的字段定义对齐。

### 7. 智联招聘 × 通义千问 — AI 人岗匹配实践

- **作者/机构**: 智联招聘 × 阿里通义千问
- **年份**: 2023-2024
- **标题**: 智联招聘 AI 人岗匹配 / 通义千问大模型招聘场景应用
- **来源**: 智联招聘官方公告及通义千问行业案例公开报道
- **关键论点摘要**:
  - 用大模型对 JD 与简历做双向语义理解，超越关键词匹配，捕捉隐性要求与软性能力。
  - 强调"JD 里没明说但实际看重"的推断（如"抗压""拥抱变化"→加班文化；"带领"→管理维度考察），并标注推断置信度。
  - 输出可解释的匹配报告：每条匹配结论附 JD 原文证据与候选人简历证据，可溯源。
- **jd-decoder 应用**: `../rules/implicit-requirements.md` 的隐性推断 + 置信度标注、`../rules/focus-points-inference.md` 的 source 溯源字段，均参考此"可解释 + 可溯源"实践。整体设计遵循本项目 AGENTS.md 的 RAG 拒幻觉与引用标注 `[1][2]` 原则。

---

## 引用使用说明

- 本 skill 的 `../rules/competency-matrix.md` 与 `../rules/implicit-requirements.md` 直接引用条目 1-4 的理论。
- `../rules/jd-structure-parsing.md` 的工程化字段抽取参考条目 6-7 的行业实践。
- `../rules/boundaries.md` 的"禁止成功画像建模"依据条目 3-4 的样本量与单侧评估约束。
- 所有引用均可溯源至公开论文/著作/产品官网，无未公开内部资料。
