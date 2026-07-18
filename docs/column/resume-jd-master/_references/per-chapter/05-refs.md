# 05-refs.md — 05 质检标准 · 单篇引用展开

> 本文件是 [../../05-质检标准.md](../../05-质检标准.md) 的引用展开，存档不展示，供 AI RAG 检索消费。每条标注作者、年份、标题、来源、关键论点摘要。聚焦质量管理、反幻觉、AI 评估相关。

## 1. 胜任力可测量性 / 匹配可验证性

### 1.1 McClelland (1973)

- **作者**: David C. McClelland
- **年份**: 1973
- **标题**: Testing for Competence Rather than for Intelligence
- **来源**: American Psychologist, 28(1), 1-14
- **关键论点摘要**: 提出胜任力须有可观测行为佐证，主张用行为事例识别"冰山以下"动机/特质，而非依赖智力测试或学历等表面指标。核心原则是"可测量性"——任何声称的胜任力都必须能落到可观测行为上验证。
- **本篇支撑**: 支撑 05 第五节反幻觉检查"论断须有可溯源证据佐证"——胜任力须有可观测行为佐证，论断须有可溯源证据佐证，是同一条可测量性原则在质检上的延伸。

### 1.2 Kristof-Brown, Zimmerman & Johnson (2005)

- **作者**: Amy L. Kristof-Brown, Ryan D. Zimmerman, Erin C. Johnson
- **年份**: 2005
- **标题**: Consequences of Individuals' Fit at Work: A Meta-Analysis of Person-Job, Person-Organization, Person-Group, and Person-Supervisor Fit
- **来源**: Personnel Psychology, 58(2), 281-342
- **关键论点摘要**: 对 172 项独立研究做元分析，效应量可复现、可被后续研究核验。元分析的方法学价值正在于"可验证性"——结论不是单点主张，而是可被独立复现的统计综合。
- **本篇支撑**: 支撑 05 第五节"论断可被独立核验"的反幻觉要求——元分析效应量可复现，论断价值在于可被独立核验，这是匹配可验证性在质检上的延伸。

## 2. 行业实践（AI 招聘质量评估）

### 2.1 北森 AI 招聘质量评估实践

- **作者/机构**: 北森云计算（Beisen）人才管理研究院
- **年份**: 2022-2024
- **标题**: AI 招聘工具质量评估实践
- **来源**: 北森人才管理研究院公开报告 / 行业大会分享
- **关键论点摘要**: 对 AI 招聘工具从多维度做质量评估——准确率（推荐与实际录用一致性）、公平性（是否对受保护属性歧视）、可解释性（推荐理由是否可追溯）、稳定性（同一输入多次推理一致性）。强调评估须分维度打分并给出改进方向，而非单一"好/坏"判定；评估本身须可复现。
- **本篇支撑**: 支撑 05 第三节 QA 用例矩阵"分维度评估而非单一总分"的设计，以及第三节"测试 prompt 覆盖正常/边界/失败三类路径"的多维度评估思路。

### 2.2 resumeoptimizerpro.com — ATS 七类匹配模型

- **作者/机构**: ResumeOptimizerPro 团队
- **年份**: 访问 2026
- **标题**: How ATS Match Resume to Job Description（ATS 七维匹配）
- **来源**: https://resumeoptimizerpro.com （ATS 匹配维度说明文档）
- **关键论点摘要**: ATS 按七个可枚举维度（Skills / Job Titles / Education / Certifications / Management Level / Industries / Languages）做匹配过滤，每个维度的判定规则清晰、可机器化执行。ATS 的工程价值在于"字段匹配可验证"——每个判定都能落到具体字段比对上，无模糊空间。
- **本篇支撑**: 支撑 05 第二节 PM 验收清单"可机器化、可逐项勾选"的质检思路——质检项应像 ATS 七维那样清晰可枚举，二值判定，不存在"基本完整"。

## 3. 质量管理方法论

### 3.1 W. Edwards Deming (1986)《Out of the Crisis》

- **作者**: W. Edwards Deming
- **年份**: 1986
- **标题**: Out of the Crisis
- **来源**: MIT Center for Advanced Engineering Study（剑桥，麻省）
- **关键论点摘要**: 系统化推广 PDCA 循环（Plan-Do-Check-Act，计划-执行-检查-行动）作为持续质量改进的框架。质量改进不是一次性活动而是闭环：计划（定标准）→ 执行（按标准做）→ 检查（对照标准验）→ 行动（修复并固化）。强调质量须建立在过程之中而非末端检验，且改进须可复现、可回归。
- **本篇支撑**: 支撑 05 第六节专家团 loop 流程"PM 验收 → QA 用例 → Reviewer 缺陷 → 反幻觉 → 修复 → 复检"的闭环结构，以及"复检必须全量回归、防止修复引入新矛盾"的回归要求。
