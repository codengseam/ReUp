# resume-evaluator 引用资料

> 本文件列出 `resume-evaluator` skill 引用的全部理论来源与实践资料。每条标注作者、年份、标题、来源、关键论点摘要，确保可溯源。

## 1. 胜任力理论（核心理论基础）

### 1.1 McClelland (1973)
- **作者**：David C. McClelland
- **年份**：1973
- **标题**：Testing for Competence Rather than Intelligence
- **来源**：American Psychologist, Vol. 28(1), pp. 1-14
- **关键论点摘要**：
  - 传统智力测验（IQ）与学历不能有效预测工作绩效，应以"胜任力"替代。
  - 胜任力是能区分高绩效者与普通绩效者的可测量个人特征。
  - 胜任力需通过行为证据（关键事件法 critical incident）识别，而非自陈问卷。
  - 不同岗位的胜任力模型不同，需基于岗位定制。
- **对本 skill 的支撑**：`rules/competency-alignment.md` 的胜任力识别方法、`rules/diagnostics-8dim.md` 维度 6（技能-经历一致性，防止胜任力注水）。

### 1.2 Spencer & Spencer (1993)
- **作者**：Lyle M. Spencer Jr. & Signe M. Spencer
- **年份**：1993
- **标题**：Competence at Work: Models for Superior Performance
- **来源**：John Wiley & Sons（出版地：New York）
- **关键论点摘要**：
  - 提出冰山模型（Iceberg Model）：胜任力分水面以上的显性层（知识、技能）与水面以下的隐性层（社会角色、自我认知、特质、动机）。
  - 水上知识与技能易识别易培养；水下四层难识别但决定长期绩效。
  - 隐性胜任力是高潜力候选人的关键区分点。
  - 胜任力评估应通过行为事件访谈（BEI, Behavioral Event Interview）收集关键行为证据。
- **对本 skill 的支撑**：`rules/competency-alignment.md` 的 6 层冰山分类、显性 vs 隐性胜任力识别流程、证据强度判定。

### 1.3 Boyatzis (1982)
- **作者**：Richard E. Boyatzis
- **年份**：1982
- **标题**：The Competent Manager: A Model for Effective Performance
- **来源**：John Wiley & Sons（出版地：New York）
- **关键论点摘要**：
  - 将胜任力理论系统化应用于管理者绩效研究。
  - 提出有效绩效的胜任力模型需基于行为事件访谈（BEI）数据构建。
  - 高效管理者与普通管理者的差异主要体现在隐性胜任力（思维模式、成就动机等）。
- **对本 skill 的支撑**：`rules/competency-alignment.md` 中"行为证据替代 BEI 做简历层推断"的方法论依据——简历层无法做完整 BEI，但可提取行为证据做近似推断。

## 2. ATS 实践资料

### 2.1 atsgrade.com 2025 ATS 关键词指南
- **作者**：atsgrade.com 编辑团队
- **年份**：2025
- **标题**：ATS Keyword Matching Guide (7-Category Model)
- **来源**：https://atsgrade.com（ATS 优化实践指南）
- **关键论点摘要**：
  - 现代 ATS 引擎按 7 类维度做加权匹配：Skills / Job Titles / Education / Certifications / Management Level / Industries / Languages。
  - Skills 类权重最高（30%-65%），技术岗取上限。
  - 关键词放置位置影响匹配权重：Work Experience > Skills Section > Summary。
  - exactly-match（精确匹配）权重高于 semantic-match（语义/同义词匹配）。
- **对本 skill 的支撑**：`rules/ats-scoring.md` 的 7 类匹配模型、放置位置权重表、exactly vs semantic 匹配规则、≥75% 强匹配阈值。

### 2.2 Resume.io / Jobscan ATS 关键词优化实践
- **作者**：Resume.io 编辑团队 / Jobscan 编辑团队
- **年份**：2024-2025
- **标题**：ATS Resume Optimization Best Practices
- **来源**：https://resume.io 、 https://www.jobscan.co（简历优化实践博客）
- **关键论点摘要**：
  - 简历应使用标准模块标题（Work Experience / Skills / Education），避免创意标题导致 ATS 无法解析。
  - 关键词应自然嵌入工作经历上下文，而非堆砌在技能栏。
  - 中英文同义词应都出现（如 K8s + Kubernetes）以覆盖不同 ATS 解析逻辑。
  - 图片化 PDF / 复杂表格 / 特殊符号 ATS 无法解析，应使用可解析的纯文本或标准 PDF。
- **对本 skill 的支撑**：`rules/ats-scoring.md` §2.3 关键词规范化、`rules/diagnostics-8dim.md` 维度 7 的格式可解析性检查、维度 5 的孤立关键词扣分。

## 3. 简历优化方法论（中文实践）

### 3.1 白海飞《面试现场》
- **作者**：白海飞
- **年份**：2021（极客时间课程）
- **标题**：《面试现场》
- **来源**：极客时间（https://time.geekbang.org/column/interview）
- **关键章节**：
  - 04 讲：公司到底想要什么样的人（经验-技能-潜力-动机四层模型）
  - 12 讲：经历没有亮点可讲你需要做份详历（四维亮点挖掘法）
  - 24 讲：被面试官问住了怎么办（盲区降维平移策略）
  - 经历包装与简历优化章节
- **关键论点摘要**：
  - 简历不应是项目数量与技术名词的堆砌，应做减法只留经得起推敲的价值点。
  - 亮点挖掘四维：价值（解决谁的痛点）、结果（数字变好了）、创新（新工具/简化流程）、动机（挑战与驱动力）。
  - STAR 法则用于结构化叙事，但 Action 段最关键。
  - 经历包装是无中生有的造假，亮点挖掘是寻找未被察觉的真实价值——两者本质不同。
- **对本 skill 的支撑**：
  - `rules/star-rewrite.md` 的 STAR 重写规范与失败模式（流水账/无量化/团队泛泛而谈）。
  - 维度 8（差异化亮点）触发 `highlight-extractor` 子 skill 的编排。
  - `rules/boundaries.md` 中"造假包装"红线与"亮点挖掘"的区分。

## 4. 引用使用映射

| skill 文件 | 主要引用 |
|-----------|---------|
| `rules/competency-alignment.md` | McClelland (1973) / Spencer & Spencer (1993) / Boyatzis (1982) |
| `rules/ats-scoring.md` | atsgrade.com (2025) / Resume.io & Jobscan (2024-2025) |
| `rules/star-rewrite.md` | 白海飞《面试现场》(2021) |
| `rules/diagnostics-8dim.md` 维度 6/8 | McClelland (1973) / 白海飞《面试现场》(2021) |
| `rules/boundaries.md` | 白海飞《面试现场》(2021) 亮点挖掘 vs 包装区分 |

## 5. 引用规范说明

- 本 skill 所有理论断言必须可溯源至上述引用之一，不得无来源断言。
- 引用时标注"作者（年份）"格式，如"(McClelland, 1973)"。
- 若引用为实践指南（如 atsgrade.com），标注其作为"实践资料"而非学术文献，避免混淆证据等级。
- 学术文献（McClelland/Spencer/Boyatzis）为高证据等级，实践指南为中等证据等级，中文课程为经验性证据。
