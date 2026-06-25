# Phase 2 Spec: JD 解析增强 + Chat-Resume 联动

**日期**: 2026-06-15  
**目标**: 深化 JD 理解能力，打通 Chat 与 Resume 数据联动。  
**依赖**: Phase 1 全部完成。

---

## 1. 需求背景

### 1.1 JD 解析现状

当前 ATS 模块仅从 JD 文本中提取关键词（TF/LLM 双路径），做简单的子串匹配覆盖率计算。这存在明显局限：
- 无法区分"硬性要求"和"加分项"
- 无法理解 JD 中的条件逻辑（如"3 年以上经验 或 硕士学历"）
- 无法提取 JD 结构（职位名称、薪资范围、汇报线、团队规模）

### 1.2 Chat-Resume 割裂

当前 Chat 模块（RAG 4 层检索）可以回答通用职业问题，但无法引用用户已上传的简历内容。用户需要手动复制粘贴简历内容到聊天框，体验差。

**Phase 2 目标**：
1. **JD 结构解析**：从 JD 文本中提取结构化信息
2. **智能对比**：不仅关键词匹配，还做语义层面的对比分析
3. **Chat 引用简历**：聊天中自动引用已解析的简历内容
4. **简历问答**："我的技能匹配度如何？""我还缺什么？"

---

## 2. 功能需求

### 2.1 JD 结构解析

#### 输入
JD 纯文本（用户粘贴或上传）。

#### 输出（JDDocument）

```typescript
interface JDDocument {
  meta: {
    source: 'text' | 'llm';
    parsedAt: string;
  };
  title: string;           // 职位名称
  department?: string;     // 部门
  level?: string;          // 职级（P5/P6/高级/资深）
  location?: string;       // 工作地点
  salary?: {               // 薪资范围
    min?: number;
    max?: number;
    currency?: string;
  };
  hardRequirements: Array<{    // 硬性要求（必须满足）
    category: '学历' | '经验' | '技能' | '证书' | '其他';
    description: string;
    priority: 'must' | 'preferred';
  }>;
  responsibilities: string[];   // 岗位职责
  skills: Array<{               // 技能要求（带权重）
    name: string;
    level: '精通' | '熟悉' | '了解';
    required: boolean;
  }>;
  team?: {                      // 团队信息
    size?: string;
    structure?: string;
    culture?: string[];
  };
  raw: string;
}
```

#### 解析路径

1. **主路径（LLM）**：调用 LLM 提取结构化 JD 信息
2. **兜底路径（Rule-based）**：正则提取标题、薪资、经验年限等

#### 与现有 ATS 的集成

- `ats.ts` 中 `extractKeywords` 优先使用 `JDDocument.skills` + `JDDocument.hardRequirements`
- 当 `JDDocument` 不可用时，回退到现有 TF/LLM 关键词提取

### 2.2 智能对比

#### 对比维度

| 维度 | 简历数据 | JD 数据 | 对比方式 |
|------|----------|---------|----------|
| 技能匹配 | `skills` | `skills` | 名称匹配 + 语义相似度 |
| 经验匹配 | `experience` | `hardRequirements` | 年限计算 + 行业匹配 |
| 学历匹配 | `education` | `hardRequirements` | 层级映射 |
| 职级匹配 | `title` + `yearsOfExperience` | `level` | 经验年限映射 |
| 职责匹配 | `experience.bullets` | `responsibilities` | 语义相似度 |

#### 输出（SmartMatchResult）

```typescript
interface SmartMatchResult {
  overallScore: number;        // 0-100
  dimensionScores: Array<{
    dimension: string;
    score: number;             // 0-100
    resumeEvidence: string;
    jdRequirement: string;
    gap?: string;
  }>;
  redFlags: string[];          // 硬性要求不满足
  greenFlags: string[];        // 显著优势
  suggestions: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    targetSection: 'basic' | 'experience' | 'projects' | 'skills';
  }>;
}
```

### 2.3 Chat 引用简历

#### 触发方式

用户聊天消息中提及简历相关内容时，自动注入简历上下文：
- "我的简历怎么样？"
- "我缺什么技能？"
- "帮我看看匹配度"
- 任何包含"简历"、"我"、"我的"的消息

#### 上下文注入格式

```
[系统提示]
用户已上传简历，以下是简历摘要：
- 姓名：{name}
- 职位：{title}
- 工作年限：{years} 年
- 技能：{skills.join(', ')}
- 最近经历：{experience[0].company} - {experience[0].role}

用户问题：{userMessage}
```

#### 隐私保护

- `privacyMode === true` 时不注入简历上下文
- 仅注入摘要，不注入完整原始文本
- 用户可随时清除聊天上下文

### 2.4 简历问答 Agent

#### 意图识别

在现有 `intent-classifier.ts` 中新增意图：
- `RESUME_QA`：简历相关问题
- `MATCH_ANALYSIS`：匹配度分析
- `GAP_ANALYSIS`：差距分析

#### 回答模板

**匹配度分析**：
```
您的简历与目标职位的整体匹配度为 {score}%。

优势：
{greenFlags}

需要注意：
{redFlags}

建议优化：
{suggestions}
```

**差距分析**：
```
对比目标 JD，您当前简历的差距主要在：
1. {gap1} — 建议在 {section} 中补充
2. {gap2} — 建议在 {section} 中补充
...
```

---

## 3. 技术方案

### 3.1 架构

```
JD 文本输入
    ↓
parseJD() ──LLM 路径──→ JDDocument
    ↓
SmartMatcher.compare(resume, jdDocument) → SmartMatchResult
    ↓
Chat 模块
    ↓
IntentClassifier 识别 RESUME_QA / MATCH_ANALYSIS
    ↓
注入简历上下文 + RAG 检索 → 流式回答
```

### 3.2 新增文件

| 文件 | 职责 |
|------|------|
| `src/lib/jd/parser.ts` | JD 文本解析为 JDDocument |
| `src/lib/jd/types.ts` | JDDocument / SmartMatchResult 类型 |
| `src/lib/jd/smart-matcher.ts` | 简历与 JD 智能对比 |
| `src/lib/chat/resume-context.ts` | 简历上下文注入 |
| `src/lib/intent-classifier.ts` | 扩展意图分类（修改） |

### 3.3 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/lib/resume/ats.ts` | `extractKeywords` 优先使用 JDDocument |
| `src/app/api/chat/route.ts` | 注入简历上下文 |
| `src/app/resume/page.tsx` | 新增 JD 解析入口 |

---

## 4. 验收标准

### 4.1 JD 解析

- [ ] 标准 JD 文本解析为 JDDocument，字段完整度 >= 80%
- [ ] 解析时间 < 3s（LLM 路径）
- [ ] 解析失败时回退到 rule-based，不抛错

### 4.2 智能对比

- [ ] 技能匹配准确率 >= 85%（名称 + 语义）
- [ ] 经验年限计算正确（支持"3 年以上"、"1-3 年"等）
- [ ] 输出包含 redFlags / greenFlags / suggestions

### 4.3 Chat 联动

- [ ] 聊天中提及简历时自动注入上下文
- [ ] privacyMode 下不注入
- [ ] 回答引用简历具体字段（如"您有 5 年 Java 经验"）

### 4.4 测试

- [ ] `src/lib/jd/parser.test.ts` >= 10 个测试用例
- [ ] `src/lib/jd/smart-matcher.test.ts` >= 8 个测试用例
- [ ] `src/lib/chat/resume-context.test.ts` >= 5 个测试用例
- [ ] 全量测试无回归

---

## 5. 风险

| 风险 | 缓解 |
|------|------|
| JD 格式差异大 | 支持多种格式（招聘网站、HR 手写、图片 OCR） |
| LLM 解析 JD 成本高 | 缓存解析结果，相同 JD 不重复解析 |
| Chat 上下文过长 | 仅注入摘要，控制 token 数 |
| 隐私泄露 | privacyMode 强制跳过；用户可清除上下文 |
