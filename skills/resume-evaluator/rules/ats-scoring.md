# ATS 评分规则（执行细则）

> 本文件基于 2025 年主流 ATS 引擎（Workday / Greenhouse / Lever / Taleo）的实际匹配机制，结合 atsgrade.com 的 7 类匹配模型。AI 必须按本规则计算覆盖率与匹配分。

## 1. ATS 匹配机制概览

现代 ATS 引擎并非"关键词字面计数"，而是按 7 类维度做加权匹配：

| 类别 | 权重范围 | 说明 |
|------|---------|------|
| Skills（技能） | 30%-65% | 技术/工具/方法，权重最高，技术岗取上限 |
| Job Titles（职位头衔） | 10%-20% | 当前/过往头衔与 JD 岗位名匹配度 |
| Education（教育） | 5%-15% | 学历层次与专业匹配，校招取上限 |
| Certifications（认证） | 3%-10% | 行业认证（如 PMP/AWS/K8s 认证） |
| Management Level（管理层级） | 5%-15% | 管理范围/团队规模是否匹配 JD 层级 |
| Industries（行业经验） | 5%-15% | 所在行业与目标公司行业匹配 |
| Languages（语言） | 2%-10% | 外语能力（出海/外企岗位取上限） |

权重不是固定值，由 JD 类型决定：
- 技术研发岗：Skills 60% + Job Titles 15% + Education 10% + 其他 15%。
- 管理岗：Skills 35% + Management Level 25% + Job Titles 15% + Industries 15% + 其他 10%。
- 校招岗：Education 25% + Skills 40% + Job Titles 10% + 其他 25%。

## 2. 关键词提取规则

### 2.1 从 JD 提取关键词
1. **优先路径（LLM）**：调用 LLM 解析 JD，输出 `[{term, weight}]`，weight 取值 0-1，按重要性降序，Top-K 默认 20。
2. **回退路径（TF 词频）**：LLM 不可用时，对 JD 做分词（中文 bigram + 英文小写化），过滤停用词，按词频归一化为 weight。
3. 提取的关键词必须涵盖 7 类中至少 Skills / Job Titles / Education 三类。

### 2.2 关键词类型识别
| 类型 | 识别特征 | 路由到简历模块 |
|------|---------|---------------|
| 技能/工具 | 编程语言/框架/中间件/云服务 | skills + 经历 bullet |
| 软技能/管理 | 团队管理/沟通/owner/领导力 | basic（总结/基本信息） |
| 项目/架构 | 高并发/微服务/分布式/重构 | projects |
| 学历 | 本科/硕士/博士/985/211 | education |
| 行业 | 电商/金融/社交/出行 | experience（公司描述） |

### 2.3 关键词规范化
- 统一小写后再匹配（case-insensitive）。
- 保留中英文同义词对：Kubernetes/K8s、PostgreSQL/Postgres、Go/Golang。
- 缩写与全称都应出现（如 JD 写"K8s"时简历应同时含"Kubernetes"与"K8s"以覆盖不同 ATS 解析逻辑）。

## 3. 覆盖率计算公式

### 3.1 基础覆盖率（不加权）
```
基础覆盖率 = 命中关键词数 / 总关键词数 × 100%
```

### 3.2 加权覆盖率（实际采用）
```
hits = Σ(weight_i)  其中 i 遍历所有命中关键词
total = Σ(weight_j) 其中 j 遍历所有关键词
加权覆盖率(percentage) = hits / total × 100%   保留 1 位小数
```

匹配判定为命中：关键词 term 在简历全文（含 basic/experience/projects/skills/education/raw）中做大小写不敏感子串匹配，命中即计入 hits。

### 3.3 匹配方式
- **exactly-match（精确匹配）**：term 作为子串原样出现。权重 100% 计入。
- **semantic-match（语义匹配）**：term 未原样出现，但出现其同义词/缩写/上下位词（如 JD "消息队列" 对应简历 "Kafka"）。权重按 0.6 计入（即语义匹配折损 40%）。
  - 同义词表需维护：{K8s: Kubernetes, Postgres: PostgreSQL, 消息队列: Kafka/RabbitMQ/RocketMQ, ...}。
  - 语义匹配必须有同义词表支撑，禁止 LLM 凭"感觉相似"判定，避免假阳性。
- **未命中**：term 既无精确也无语义匹配。权重 0%。

## 4. 放置位置权重

同一关键词出现在简历不同位置，对 ATS 评分贡献不同：

| 放置位置 | 权重系数 | 说明 |
|---------|---------|------|
| Work Experience（工作经历 bullet） | 1.0 | ATS 最看重，上下文最丰富 |
| Project（项目经历 bullet） | 0.9 | 次之，能体现应用场景 |
| Skills Section（技能栏） | 0.7 | 仅证明"知道"，不证明"用过" |
| Summary（个人总结） | 0.5 | 权重最低，易被视为堆砌 |
| Education | 0.6 | 仅对 Education 类关键词有效 |

> 规则：一个关键词若仅出现在 Skills Section 而无经历佐证，其贡献权重打 0.7 折；若同时在经历中出现，按 1.0 计（不重复累加，取最高）。

## 5. 评分阈值与分档

最终 ATS 匹配分 = 加权覆盖率（考虑放置位置后的修正值）。

| 匹配分 | 等级 | 含义 |
|--------|------|------|
| ≥ 85% | A（强匹配） | 几乎必然过 ATS 初筛，HR 主动联系概率高 |
| 75%-84% | B（匹配） | 大概率过初筛，进入人工 review |
| 60%-74% | C（弱匹配） | 可能被过滤，需补关键词 |
| 45%-59% | D（边缘） | 大概率被 ATS 淘汰 |
| < 45% | F（不匹配） | 几乎必然被 ATS 拒绝 |

**≥ 75% 为"强匹配"门槛**，低于此值诊断报告应将 ATS 列为待修复项。

## 6. 未命中关键词的修复建议

对每个未命中关键词，按 `suggestSectionForKeyword` 路由建议放置位置：
- 技术工具类 → skills 栏 + 在经历中补一条 bullet。
- 软技能/管理类 → basic（个人总结）+ 在工作经历中体现。
- 项目/架构类 → projects 补一条项目 bullet。
- 默认 → experience 工作经历 bullet。

建议话术模板：
- `JD 关键词「{term}」（权重 {weight}）在简历中未命中，建议在【{建议模块}】补充，预期可提升匹配分 {Δ}%。`

## 7. ATS 评分的特殊情况

### 7.1 无 JD 场景
当用户未提供 JD 时，不计算 ATS 匹配分，仅做通用关键词密度评估（维度 5）。诊断报告中 ATS 分标记为 `null`，综合评分按 `scripts/scoring-formula.md` 的无 JD 公式计算。

### 7.2 中英文岗位差异
- 中文岗位（国内）：中英文混合关键词，注意中文 bigram 分词。
- 英文岗位（海外/外企）：以英文关键词为主，注意 title 用语差异（如"高级工程师"对应"Senior Engineer"而非"High Engineer"）。

### 7.3 简历格式可解析性
若简历为图片化 PDF / 复杂表格 / 扫描件，ATS 无法解析文本，此时 ATS 分直接判 0 并提示用户改用纯文本/可解析 PDF。

## 8. 与代码实现的对齐

本规则与 `src/features/resume/ats.ts` 实现对齐：
- `extractJdKeywords(jd, {llmClient, topK})` → §2.1 关键词提取。
- `computeAtsCoverage(resume, jdKeywords)` → §3.2 加权覆盖率（case-insensitive 子串匹配）。
- `suggestSectionForKeyword(term)` → §6 路由建议。
- 代码当前仅实现 exactly-match（子串匹配），semantic-match（同义词折损 0.6）为本规则要求的增强项，AI 评估时可手动补充同义词判定。
