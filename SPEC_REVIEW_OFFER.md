# 规格文档：面试复盘 + Offer 概率分析

> 文档目的：作为 AI 输入，生成开发计划与任务分解
> 适用项目：AI 面试提效平台（基于 ReUp 重构）
> 文档版本：v1.0
> 编写日期：2026-06-15

---

## 0. 文档使用说明

请把本文档整段作为提示词输入给 AI，让 AI 输出：
1. 完整的开发计划（分阶段 / 分模块）
2. 可执行的任务清单（带依赖、工期、责任人）
3. 技术选型与架构建议
4. 测试方案与验收标准
5. 风险识别与缓解措施

AI 输出要求：
- 必须引用本文档中的功能点
- 必须给出可落地的代码路径（基于现有 ReUp 项目结构 `src/lib/`、`src/app/api/`）
- 必须考虑与现有模块的复用（LLM Client、RAG、Skill Loader、Resume Parser）

---

## 1. 项目背景

### 1.1 既有项目

- **项目名**：ReUp v2（基于 Next.js 14 App Router）
- **项目类型**：Skill 驱动的垂直 AI Agent 平台（中国互联网人职级晋升 / 面试准备）
- **核心资产**：
  - LLM 客户端 `src/lib/llm-client.ts`（多 Provider 抽象）
  - RAG 引擎 `src/lib/rag/**`（含 Guard / Cache / ReRank）
  - Skill 体系 `data/skills.json`（8 个 Framework Skill）
  - 简历模块 `src/lib/resume/**`（完整解析 + STAR 润色 + 导出）
  - JD 模块 `src/lib/jd/**`（LLM + 规则回退）
  - Admin 后台 `src/app/admin/**`（8 Tab）
  - 知识源 `data/book-sources/面试现场/`（31 篇面试方法论）

### 1.2 目标产品

**AI 面试提效平台** — 让候选人从 JD 解析 → 简历优化 → 模拟面试 → 复盘 → 提升 → Offer 决策全流程提效。

### 1.3 本期范围

仅实现 **「面试复盘」** 与 **「Offer 概率分析」** 两个能力。

---

## 2. 用户故事

### 2.1 面试复盘用户故事

```
US-1: 作为刚完成模拟面试的用户，我希望看到整体评分与维度分析，
      知道自己的强弱项。
US-2: 作为用户，我希望看到每道题的具体反馈，
      知道哪答得好、哪答得差、应该怎么答。
US-3: 作为用户，我希望看到 Top 3 亮点与 Top 5 问题，
      按重要度排序。
US-4: 作为用户，我希望一键生成 7 天提升计划，
      知道接下来该做什么。
US-5: 作为用户，我希望对比同一职位多次面试的复盘，
      看到进步曲线。
US-6: 作为付费用户，我希望查看 AI 教练对回答的润色建议。
US-7: 作为 HR/求职教练（B 端，P2），我希望看到候选人对比报告。
```

### 2.2 Offer 概率分析用户故事

```
US-8: 作为用户，我希望上传 JD + 简历后看到 Offer 概率百分比。
US-9: 作为用户，我希望看到概率的拆解（哪些因子拉高、哪些拉低）。
US-10: 作为用户，我希望同时对比 3-5 个 JD 的概率，
       决定投递优先级。
US-11: 作为用户，我希望看到「从 X% 提升到 Y% 需做的 3 件事」。
US-12: 作为用户，复盘后希望看到「如果这场面试表现提升 N 分，
       Offer 概率会到多少」。
US-13: 作为用户，我希望看到历史预测的准确率（透明公式 + 校准）。
```

---

## 3. 功能需求

### 3.1 面试复盘（Interview Review）

#### 3.1.1 输入

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| sessionId | string | 是 | 关联 InterviewSession |
| userId | string | 是 | 用户 ID |
| 完整 transcript | array | 是 | InterviewQuestion 列表，含问答对 |
| JD 信息 | object | 否 | 关联的 JDDocument |
| 简历信息 | object | 否 | 关联的 ResumeDocument |
| 面试配置 | object | 是 | type / level / difficulty |

#### 3.1.2 输出（InterviewReview 文档结构）

```typescript
interface InterviewReview {
  id: string;
  sessionId: string;
  userId: string;

  // 总评
  overallScore: number;              // 0-10
  overallVerdict: 'strong_hire' | 'hire' | 'lean_hire' | 'lean_no_hire' | 'no_hire' | 'strong_no_hire';
  summary: string;                   // 一句话总结（30 字内）

  // 维度评分（0-10）
  dimensions: {
    technicalDepth: number;          // 技术深度
    communication: number;           // 表达清晰度
    problemSolving: number;          // 思维 / 解决问题
    projectMastery: number;          // 项目掌握
    behavioralFit: number;           // 行为匹配
    systemDesign?: number;           // 系统设计（仅特定题）
  };

  // 维度权重（根据题目类型自动选择）
  dimensionWeights: Record<keyof dimensions, number>;

  // 亮点（最多 3 条）
  greatMoments: Array<{
    questionId: string;
    snippet: string;                 // 用户回答引用（不超过 100 字）
    why: string;                     // 为什么是亮点
  }>;

  // 问题（最多 5 条，按严重度排序）
  topIssues: Array<{
    questionId: string;
    severity: 'critical' | 'major' | 'minor';
    category: 'knowledge_gap' | 'communication' | 'depth' | 'edge_case' | 'tradeoff' | 'behavioral_red_flag';
    snippet: string;                 // 用户回答引用
    problem: string;                 // 问题描述
    suggestion: string;              // 改进建议（具体可执行）
    referenceAnswer?: string;        // 参考答案（如适用）
  }>;

  // 逐题反馈
  perQuestionFeedback: Array<{
    questionId: string;
    score: number;                   // 0-10
    evaluation: {
      accuracy: number;              // 准确性
      depth: number;                 // 深度
      clarity: number;               // 表达
      structure: number;             // 结构化
    };
    whatWentWell: string[];
    whatToImprove: string[];
    modelAnswer?: string;            // 参考答案
    followups?: string[];            // 可能的追问
  }>;

  // 行动建议
  actionableItems: Array<{
    title: string;
    description: string;
    priority: 'P0' | 'P1' | 'P2';
    estimatedHours: number;
    resources?: string[];            // 推荐学习资源（来自知识库）
  }>;

  // 元数据
  llmTrace: {
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    totalLatencyMs: number;
    ragChunksUsed: number;
  };

  createdAt: string;
  updatedAt: string;
}
```

#### 3.1.3 业务流程

```
[用户在模拟面试页点击"结束面试"]
       ↓
[系统锁定 InterviewSession, status = COMPLETED]
       ↓
[触发 Review Agent]
       ↓
[Step 1: 加载上下文]
  - InterviewSession + 全部 InterviewQuestion
  - 可选：JDDocument, ResumeDocument
  - 可选：用户历史 Review（用于纵向对比）
       ↓
[Step 2: 多维度评分（并行 5 个 LLM 调用）]
  - 技术深度评估
  - 表达清晰度评估
  - 思维结构评估
  - 项目掌握评估
  - 行为匹配评估
       ↓
[Step 3: 亮点 + 问题提取]
  - 从每题 feedback 聚合 greatMoments（取 Top 3）
  - 从每题 feedback 聚合 topIssues（取 Top 5）
       ↓
[Step 4: 行动建议生成]
  - 根据 topIssues 推荐 3-7 条可执行行动
  - 关联 RAG 检索的知识源（来自 data/book-sources/面试现场/）
       ↓
[Step 5: 总评与摘要]
  - 加权计算 overallScore
  - 根据阈值判定 overallVerdict
  - LLM 生成一句话 summary
       ↓
[Step 6: 持久化]
  - 写入 InterviewReview 表
  - 触发 ImprovementPlan 自动生成（可选）
       ↓
[Step 7: 通知用户]
  - SSE / WebSocket 推送
  - 跳转复盘页
```

#### 3.1.4 评分规则

**维度权重（按面试类型自动选择）**：

| 面试类型 | technicalDepth | communication | problemSolving | projectMastery | behavioralFit | systemDesign |
|---|---|---|---|---|---|---|
| TECHNICAL | 40% | 15% | 25% | 15% | 5% | - |
| BEHAVIORAL | 5% | 30% | 10% | 20% | 35% | - |
| CASE | 15% | 25% | 25% | 10% | 25% | - |
| SYSTEM_DESIGN | 20% | 15% | 25% | 10% | 5% | 25% |
| MIXED | 25% | 20% | 20% | 15% | 15% | 5% |

**overallVerdict 阈值**：

| 分数 | Verdict |
|---|---|
| ≥ 9.0 | strong_hire |
| 8.0 - 8.9 | hire |
| 7.0 - 7.9 | lean_hire |
| 5.0 - 6.9 | lean_no_hire |
| 3.0 - 4.9 | no_hire |
| < 3.0 | strong_no_hire |

#### 3.1.5 LLM Prompt 模板

**主 Prompt（Review Agent）**：

```
你是资深技术面试复盘教练，负责对候选人的模拟面试进行深度复盘。
请基于以下输入生成结构化复盘报告（严格 JSON 输出）：

## 候选人画像
- 级别：{level}
- 简历亮点：{resumeHighlights}
- 目标 JD：{jdSummary}

## 面试配置
- 类型：{type}
- 难度：{difficulty}/5
- 总题数：{totalQuestions}

## 完整 Transcript
{transcript}

## 面试方法论参考（来自知识库 RAG）
{ragChunks}

## 输出要求

请按以下 JSON 结构输出，字段名严格使用 snake_case：

{
  "summary": "一句话总结（30字内）",
  "overall_score": 0-10,
  "overall_verdict": "strong_hire|hire|lean_hire|lean_no_hire|no_hire|strong_no_hire",
  "dimensions": {
    "technical_depth": 0-10,
    "communication": 0-10,
    "problem_solving": 0-10,
    "project_mastery": 0-10,
    "behavioral_fit": 0-10,
    "system_design": 0-10  // 仅系统设计题
  },
  "great_moments": [
    {"question_id": "q1", "snippet": "引用用户原话", "why": "为什么好"}
  ],
  "top_issues": [
    {"question_id": "q1", "severity": "critical|major|minor", "category": "knowledge_gap|communication|depth|edge_case|tradeoff|behavioral_red_flag", "snippet": "引用", "problem": "问题", "suggestion": "建议", "reference_answer": "参考答案"}
  ],
  "per_question_feedback": [
    {
      "question_id": "q1",
      "score": 0-10,
      "evaluation": {"accuracy": 0-10, "depth": 0-10, "clarity": 0-10, "structure": 0-10},
      "what_went_well": ["..."],
      "what_to_improve": ["..."],
      "model_answer": "...",
      "followups": ["..."]
    }
  ],
  "actionable_items": [
    {"title": "行动项", "description": "具体怎么做", "priority": "P0|P1|P2", "estimated_hours": 2, "resources": ["book-source-url"]}
  ]
}

## 评分原则
- 严格：能用数据说话就引用数据，能给反例就给反例
- 建设性：所有批评必须配改进建议
- 平衡：技术深度与表达同等重要
- 透明：评分要有具体依据，不打模糊分

## 严禁
- 不要给空泛表扬（"回答得很好"）
- 不要忽略细节错误
- 不要复述原题
- 不要编造候选人没说过的话
```

#### 3.1.6 验收标准

- [ ] 5 道题面试，Review 生成时间 < 30s
- [ ] 维度评分与人工评分相关性 > 0.7
- [ ] topIssues 至少 3 条且 severity 标注准确
- [ ] actionableItems 全部可执行（含具体行动 + 时长）
- [ ] 输出 JSON 100% 通过 schema 校验
- [ ] 失败时降级到「基础复盘」（仅 overallScore + 简单 summary）
- [ ] 复盘页可分享（生成只读链接）

---

### 3.2 Offer 概率分析（Offer Probability Analysis）

#### 3.2.1 输入

```typescript
interface OfferPredictionInput {
  userId: string;
  jdId?: string;                   // 关联 JD（已解析）
  resumeId?: string;               // 关联简历
  rawJDText?: string;              // 或原始 JD 文本
  rawResumeText?: string;          // 或原始简历文本
  interviewSessionId?: string;     // 关联模拟面试（可选）
  level: '校招' | 'P5' | 'P6' | 'P7' | 'P8';  // 用户自报
  yearsOfExperience: number;       // 工作年限
  expectedSalary?: number;         // 期望薪资
  companyInfo?: {                  // 可选公司情报
    name: string;
    tier: 'BAT/TMD' | '独角兽' | '中型' | 'Startup' | '外企';
    fundingStage?: string;
  };
}
```

#### 3.2.2 输出（OfferPrediction 文档结构）

```typescript
interface OfferPrediction {
  id: string;
  userId: string;
  jdId?: string;
  resumeId?: string;
  interviewSessionId?: string;

  // 概率
  probability: number;             // 0-1
  confidence: number;              // 0-1，模型对自己有多确定
  predictionInterval: {            // 区间估计
    low: number;
    high: number;
  };

  // 拆解因子（按权重从大到小排序）
  breakdown: Array<{
    factor: string;                // 因子名
    category: 'qualification' | 'match' | 'market' | 'performance' | 'compensation';
    weight: number;                // 0-1
    score: number;                 // 0-1
    contribution: number;          // weight * score
    evidence: string;              // 依据（具体数字 / 引用）
    status: 'positive' | 'neutral' | 'negative';
  }>;

  // Top 拉低因子
  topRisks: Array<{
    risk: string;
    impact: number;                // 影响概率下降的百分点
    howToMitigate: string;         // 怎么缓解
  }>;

  // Top 拉高因子
  topStrengths: Array<{
    strength: string;
    impact: number;
  }>;

  // 行动建议（提升 Offer 概率）
  improvementActions: Array<{
    action: string;
    potentialLift: number;          // 实施后概率可能提升的百分点
    difficulty: 'easy' | 'medium' | 'hard';
    estimatedHours: number;
  }>;

  // 校准（实际结果回填后）
  actualResult?: 'offer' | 'rejected' | 'pending' | 'withdrawn';
  actualResultAt?: string;
  calibrationDelta?: number;       // 预测 - 实际

  // 元数据
  modelVersion: string;            // 'rule-v1' / 'ml-v1'
  llmTrace: object;
  createdAt: string;
}
```

#### 3.2.3 概率模型设计

**方案 A：规则版（MVP，P0 推荐）**

```
probability = 0
  + 0.35 * match_score             // 简历-JD 匹配分（0-1）
  + 0.25 * interview_score         // 模拟面试分（0-1）转 0-1
  + 0.15 * level_fit               // 级别匹配度
  + 0.10 * company_tier_score      // 公司档次
  + 0.10 * market_factor           // 市场行情（默认 0.5）
  + 0.05 * experience_factor       // 经验匹配
```

**各因子计算规则**：

| 因子 | 范围 | 计算方式 |
|---|---|---|
| `match_score` | 0-1 | 来自 ResumeJDMatch.overallScore / 10 |
| `interview_score` | 0-1 | 来自 InterviewReview.overallScore / 10；无面试则取 0.6 默认 |
| `level_fit` | 0-1 | 见下方表 |
| `company_tier_score` | 0-1 | 见下方表 |
| `market_factor` | 0-1 | 当前默认 0.5（市场中性），P1 可接入实时招聘数据 |
| `experience_factor` | 0-1 | 经验偏离 JD 要求年数 → sigmoid |

**level_fit 映射**：

| 用户报级别 | JD 隐含级别（P5/P6/P7） | level_fit |
|---|---|---|
| P5 | P5 | 1.0 |
| P5 | P6 | 0.5（可冲） |
| P6 | P5 | 0.7（屈就） |
| P6 | P6 | 1.0 |
| P6 | P7 | 0.4 |
| P7 | P6 | 0.7 |
| P7 | P7 | 1.0 |
| 校招 | 校招 | 1.0 |
| 校招 | P5 | 0.5 |

**company_tier_score**（候选人投递公司档次 vs 自己背景）：

| 候选人背景 | 投递公司档次 | score |
|---|---|---|
| P7+ | BAT/TMD | 0.9 |
| P5-P6 | BAT/TMD | 0.7 |
| P5-P6 | 独角兽 | 0.85 |
| 校招优秀 | BAT/TMD | 0.75 |
| 社招一般 | 独角兽 | 0.7 |
| 校招 | Startup | 0.5 |

#### 3.2.4 置信度

```
confidence = 0.4                              // 基础
  + 0.2 if has_resume                         // 有简历
  + 0.2 if has_jd                             // 有 JD
  + 0.2 if has_interview                      // 有面试分
  - 0.1 if missing_company_info               // 缺公司情报
  - 0.1 if self_reported_level_only           // 仅自报级别
```

**置信度解释**：
- `> 0.8`：高置信，预测可作为重要参考
- `0.5 - 0.8`：中等，建议人工复核
- `< 0.5`：低，仅作为大致参考

#### 3.2.5 LLM Prompt（解释 + 行动建议）

```
你是 Offer 概率分析专家。基于以下结构化数据，输出通俗易懂的解释与行动建议。

## 输入数据
- 整体概率：{probability}
- 置信度：{confidence}
- 拆解因子：{breakdown}
- Top 拉低：{topRisks}
- Top 拉高：{topStrengths}

## 输出要求（JSON）

{
  "summary": "一句话解释（30字内）",
  "probability_explanation": "为什么是这个概率（100字内）",
  "key_insights": ["3-5 条关键洞察"],
  "improvement_actions": [
    {"action": "具体行动", "potential_lift": "5-10 个百分点", "difficulty": "easy|medium|hard", "estimated_hours": 4}
  ],
  "scenario_analysis": {
    "if_interview_improves_to_8": "概率将提升到 X%",
    "if_salary_reduces_10pct": "概率将提升到 X%"
  }
}

## 严禁
- 编造数据
- 给出绝对承诺（"一定能拿到 offer"）
- 忽视负面信号
```

#### 3.2.6 业务流程

```
[用户在 Offer 页点击"开始分析"]
       ↓
[Step 1: 收集输入]
  - 选择简历（DB Resume）
  - 选择 JD（DB JobDescription）
  - 选择模拟面试（DB InterviewSession，可选）
  - 填写级别、工作年限、期望薪资
       ↓
[Step 2: 加载依赖数据]
  - JDDocument（结构化）
  - ResumeDocument（结构化）
  - ResumeJDMatch（匹配分）
  - InterviewReview（面试分）
       ↓
[Step 3: 计算各因子]
  - match_score = match.overallScore / 10
  - interview_score = review.overallScore / 10 || 0.6
  - level_fit, company_tier_score, ...
       ↓
[Step 4: 概率计算]
  - probability = Σ(weight * factor)
  - 限制在 [0.05, 0.95]
  - 计算 confidence
       ↓
[Step 5: LLM 生成解释与建议]
  - 调用 LLM 解释
  - 检索 RAG 知识源
       ↓
[Step 6: 持久化]
  - 写入 OfferPrediction 表
       ↓
[Step 7: 渲染 UI]
  - 概率仪表盘
  - 因子拆解图
  - Top 风险与优势
  - 行动建议
  - 对比功能（可加多个 JD）
```

#### 3.2.7 UI 需求

- **主页面** `/offer`
  - 输入卡片（选简历 / JD / 面试）
  - 概率仪表盘（大数字 + 区间）
  - 因子拆解柱状图（正向绿色、负向红色）
  - Top 3 风险 + Top 3 优势
  - 行动建议清单（含预期提升）
  - "对比模式"：可加 3-5 个 JD 横比

- **历史页** `/offer/history`
  - 时间线
  - 校准图（预测 vs 实际）
  - 模型准确率展示

#### 3.2.8 验收标准

- [ ] 输入完整时，预测耗时 < 5s
- [ ] 概率计算有公式说明（用户可看）
- [ ] 每个因子有依据（evidence）
- [ ] 行动建议至少 3 条，每条含预期提升
- [ ] 支持 3-5 个 JD 横向对比
- [ ] 实际结果可回填，用于后续校准
- [ ] 校准功能在 ≥ 30 个样本后开放

---

## 4. 非功能需求

### 4.1 性能

| 指标 | 目标 |
|---|---|
| 复盘生成时间（5 道题） | P95 < 30s |
| 复盘生成时间（10 道题） | P95 < 60s |
| Offer 预测时间 | P95 < 5s |
| 并发支持 | 100 QPS |
| 数据库查询 | P95 < 100ms |

### 4.2 可靠性

- 复盘 / 预测必须**幂等**
- LLM 调用失败 → 降级到「基础版」（仅 overallScore）
- 持久化失败 → 重试 3 次后报警
- 所有 LLM 调用有 trace（model、tokens、latency）

### 4.3 可观测性

- 每次生成记录：
  - 输入 hash
  - 输出 hash
  - LLM model
  - Token 消耗
  - 延迟分阶段（prompt / completion）
  - 失败原因（如有）

### 4.4 安全与合规

- 用户数据隔离（userId 强制校验）
- 简历 / JD 内容加密存储
- LLM 调用前 PII 检测（手机号 / 身份证 / 邮箱可选脱敏）
- 输出内容 Guard（防 prompt injection 泄露系统 prompt）

### 4.5 成本控制

- 每个 Review 上限 30k tokens
- 每个 Prediction 上限 10k tokens
- 月度按用户限额（Free 3 次 / Pro 30 次 / Premium 无限）

---

## 5. 数据模型

### 5.1 新增表

```prisma
model InterviewReview {
  id              String   @id @default(cuid())
  sessionId       String   @unique
  userId          String

  // 总评
  overallScore    Float
  overallVerdict  String   // 'strong_hire' | ...
  summary         String

  // 维度
  dimensions      Json     // {technicalDepth, communication, ...}
  dimensionWeights Json

  // 详细
  greatMoments    Json     // []
  topIssues       Json     // []
  perQuestionFeedback Json
  actionableItems Json     // []

  // 关联
  llmTrace        Json
  modelVersion    String

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([userId, createdAt])
}

model OfferPrediction {
  id                  String   @id @default(cuid())
  userId              String
  jdId                String?
  resumeId            String?
  interviewSessionId  String?

  probability         Float
  confidence          Float
  predictionInterval  Json     // {low, high}

  breakdown           Json     // [{factor, weight, score, ...}]
  topRisks            Json
  topStrengths        Json
  improvementActions  Json

  modelVersion        String
  llmTrace            Json

  // 校准
  actualResult        String?  // 'offer' | 'rejected' | 'pending' | 'withdrawn'
  actualResultAt      DateTime?
  calibrationDelta    Float?

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([userId, createdAt])
  @@index([actualResult])
}
```

### 5.2 索引建议

- `InterviewReview(userId, createdAt DESC)` — 用户历史
- `InterviewReview(sessionId)` — 会话查询
- `OfferPrediction(userId, createdAt DESC)` — 用户历史
- `OfferPrediction(actualResult)` — 校准聚合

---

## 6. 与现有模块的复用

### 6.1 复用清单

| 现有模块 | 复用方式 |
|---|---|
| `src/lib/llm-client.ts` | 直接复用，多 LLM 切换 |
| `src/lib/rag/**` | 检索面试方法论语料 |
| `src/lib/skills-loader.ts` | 注册 review-agent / offer-agent Skill |
| `data/skills.json` | 加 2 个新 Skill |
| `src/lib/admin-auth.ts` | Admin 权限 |
| `src/lib/admin-stats.ts` | 统计计数 |
| `src/lib/embedder.ts` | Offer 因子向量化（可选） |
| `src/lib/vector-store.ts` | 历史 Review 相似检索（推荐） |
| `src/lib/jd/types.ts` | JDDocument 结构 |
| `src/lib/resume/types.ts` | ResumeDocument 结构 |
| `src/lib/url-safety.ts` | 防 SSRF |
| `src/lib/error-classifier.ts` | LLM 错误分类 |

### 6.2 新增模块

```
src/lib/review/
├── index.ts                  # 主入口
├── types.ts                  # InterviewReview 类型
├── prompt.ts                 # 主 Prompt 模板
├── scoring.ts                # 维度加权 + 阈值
├── per-question.ts           # 单题评估
├── aggregate.ts              # 多题聚合
├── actions.ts                # 行动建议生成
├── fallback.ts               # 降级方案
└── llm-trace.ts              # 调用追踪

src/lib/offer/
├── index.ts                  # 主入口
├── types.ts                  # OfferPrediction 类型
├── factors.ts                # 因子计算
├── formula.ts                # 概率公式
├── confidence.ts             # 置信度
├── explainer.ts              # LLM 解释生成
├── calibration.ts            # 校准
└── compare.ts                # 多 JD 对比
```

### 6.3 新增 API

```
POST   /api/interview/:sessionId/review     # 触发复盘
GET    /api/interview/:sessionId/review     # 获取复盘
GET    /api/reviews                          # 用户历史复盘
POST   /api/offer/predict                    # 触发预测
GET    /api/offer/predictions                # 用户历史预测
GET    /api/offer/compare?ids=a,b,c          # 多 JD 对比
POST   /api/offer/:id/feedback               # 回填实际结果
```

### 6.4 新增页面

```
/interview/[id]/review        # 复盘详情
/reviews                       # 复盘历史
/offer                         # Offer 概率主页
/offer/history                 # 预测历史
/offer/compare                 # 多 JD 对比
```

---

## 7. 失败处理

| 场景 | 降级策略 |
|---|---|
| LLM 主调用失败 | 重试 1 次 → 切备用模型 → 返回「基础复盘」 |
| 某维度 LLM 失败 | 该维度标记为 N/A，整体仍可输出 |
| RAG 检索失败 | 跳过 RAG，仅靠 Prompt |
| 数据库写入失败 | 重试 3 次 → 报警 → 返回错误给用户 |
| Schema 校验失败 | 重试 1 次（更严格 prompt）→ 仍失败则降级 |
| Token 超限 | 截断 transcript（保留最近 N 题）|

---

## 8. 监控与指标

### 8.1 业务指标

- 复盘生成成功率（> 99%）
- 复盘生成平均耗时
- Offer 预测校准误差（MAE）
- 用户对复盘的反馈评分（👍 / 👎）
- 复盘 → 提升计划转化率
- Offer 预测 → 实际投递转化率

### 8.2 技术指标

- LLM 调用 P50 / P95 / P99 延迟
- Token 消耗（按用户、按模型）
- 失败率（按错误类型）
- 缓存命中率

---

## 9. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 复盘评分不准确 | 高 | 收集人工反馈，持续校准 Prompt |
| Offer 概率被用户过度依赖 | 高 | 明确告知「仅供参考」，提供置信度 |
| LLM 成本失控 | 中 | 限流 + 缓存 + 限额 |
| 校准数据不足（冷启动） | 中 | 启动期用规则 + 透明公式 |
| 用户上传虚假面试结果 | 中 | 服务端生成，不允许用户自填 |
| 数据隐私 | 高 | PII 检测 + 加密 + 审计日志 |

---

## 10. 开发任务要求（给 AI 的输出格式）

请 AI 按以下结构输出开发计划：

```
## 总体计划
- 总工期：X 周
- 团队配置：X 人
- 关键里程碑：M1 / M2 / M3

## 任务分解（按依赖排序）

### Phase 1: 数据层（X 天）
- T1.1: Prisma Schema 设计（InterviewReview / OfferPrediction）
  - 工期：0.5 天
  - 依赖：无
  - 交付：schema.prisma 完整字段
  - 验收：prisma migrate dev 通过
- T1.2: 数据库迁移
  ...

### Phase 2: Review Agent（X 天）
- T2.1: 类型定义 src/lib/review/types.ts
- T2.2: 评分规则 src/lib/review/scoring.ts
- T2.3: 主 Prompt src/lib/review/prompt.ts
- T2.4: 单题评估 src/lib/review/per-question.ts
- T2.5: 聚合 src/lib/review/aggregate.ts
- T2.6: 行动建议 src/lib/review/actions.ts
- T2.7: 降级方案 src/lib/review/fallback.ts
- T2.8: API POST /api/interview/:id/review
- T2.9: API GET /api/interview/:id/review
- T2.10: 复盘页 UI /interview/[id]/review
- T2.11: 单元测试（每个模块）
- T2.12: 集成测试（端到端）

### Phase 3: Offer Agent（X 天）
- T3.1: ...
...

### Phase 4: UI（X 天）
...

### Phase 5: 测试（X 天）
...

### Phase 6: 上线（X 天）
- 灰度 10% → 50% → 100%
- 监控面板
- 报警规则

## 技术选型建议
- LLM 模型：...
- 数据库：...
- 缓存：...
- 前端图表库：...

## 测试方案
- 单元测试：vitest
- 集成测试：vitest + supertest
- E2E：playwright
- 评估集：50 份人工标注样本

## 风险与缓解
- 风险 1：... → 缓解：...
- 风险 2：... → 缓解：...
```

---

## 11. 验收标准（DoD）

### 11.1 复盘功能 DoD

- [ ] 所有 API 返回符合 schema
- [ ] 5 道题 Review P95 < 30s
- [ ] 10 道题 Review P95 < 60s
- [ ] 失败降级方案可用
- [ ] 单元测试覆盖率 > 80%
- [ ] 至少 20 份人工评估样本，相关性 > 0.7
- [ ] 复盘页 UI 完整
- [ ] 历史复盘可查看、可对比

### 11.2 Offer 概率功能 DoD

- [ ] 概率公式透明可查
- [ ] 5 个因子全部实现
- [ ] 置信度计算合理
- [ ] 行动建议含预期提升
- [ ] 至少 30 个样本后校准可用
- [ ] 多 JD 对比可用
- [ ] 实际结果可回填
- [ ] 单元测试覆盖率 > 80%

### 11.3 通用 DoD

- [ ] 文档完整（API / DB / Prompt）
- [ ] 监控埋点完整
- [ ] 限流 / 缓存到位
- [ ] 安全审计通过
- [ ] Admin 后台可见数据
- [ ] 移动端可访问

---

## 12. 附录

### 12.1 参考资料

- 现有 RAG 文档：`src/lib/rag/index.ts`
- 现有 LLM Client：`src/lib/llm-client.ts`
- 现有 Admin：`src/app/admin/_components/dashboard-tab.tsx`
- 面试知识源：`data/book-sources/面试现场/*.md`
- 简历类型：`src/lib/resume/types.ts`
- JD 类型：`src/lib/jd/types.ts`

### 12.2 术语表

| 术语 | 含义 |
|---|---|
| Review | 面试复盘 |
| Prediction | Offer 概率预测 |
| Calibration | 校准（实际结果回填后调整） |
| Verdict | 总评结论 |
| Factor | 概率影响因子 |
| Confidence | 置信度 |
| Transcript | 完整面试问答记录 |
| Improvement Action | 可执行改进行动 |

---

**文档结束。**

> AI 输出要求重申：
> 1. 必须引用本文档章节号
> 2. 必须给出可落地代码路径
> 3. 必须复用现有 ReUp 模块
> 4. 必须包含测试方案
> 5. 必须包含风险与缓解
> 6. 任务粒度到 0.5 天
> 7. 总工期不超过 6 周
