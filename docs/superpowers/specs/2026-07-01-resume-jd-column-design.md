# 简历-JD 分析专栏设计（AI 消费优先）

> 日期：2026-07-01 · 作者：专家团（Orchestrator+PM+Architect+QA+Reviewer）
> 状态：已批准执行 · 关联：ReUp v2 简历评估模块

## 一、第一性原理

AI 产出质量 = 提示词约束力 × 外挂知识密度 × 执行框架结构化度。
当前实现"不理想"的根因：三者皆弱（模型一般 + skills 太少 + 框架松散）。
本专栏目标：把三者一次性补齐到"超一流"，产出物主要给 AI 消费，人可读为辅。

## 二、核心决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 专栏形态 | 混合三层：SKILL.md（AI 入口）+ docs/column（人可读）+ skill 内 prompts | 单一形态补不齐三要素 |
| 与现有 8 skills | 编排复用 + 补强缺口 | 复用 highlight-extractor 等 + 新建 4 个形成闭环 |
| JD 分析深度 | 岗位画像 + 能力矩阵 + 隐性要求推断 | 喂给功能三，不做成功画像建模（无历史数据） |
| 引用规则 | 单篇引用放文末、专栏视图隐藏、全局引用单独存档、提示词全保留 | 严格按用户原话 |
| 文件组织 | 每个 skill 自包含 rules/scripts/references/prompts | SKILL.md 仅做薄路由 |
| 前端可见性 | 专栏文章可选展示，聚焦"可分析/建设的规则"给人看 | 引用与提示词不展示只存档 |

## 三、目录结构

```
skills/
├── resume-evaluator/                      # 功能一：简历单独分析
│   ├── SKILL.md                           # 薄路由：编排现有 skills + 指向 rules
│   ├── rules/
│   │   ├── diagnostics-8dim.md            # 8 维诊断标准
│   │   ├── ats-scoring.md                 # ATS 评分规则
│   │   ├── star-rewrite.md                # STAR 重写规范
│   │   ├── competency-alignment.md        # 胜任力对齐规则
│   │   └── boundaries.md                  # 边界与失败模式
│   ├── scripts/
│   │   ├── diagnostic-checklist.md        # 诊断执行清单
│   │   ├── scoring-formula.md             # 评分公式
│   │   └── execution-flow.md              # 执行流程图
│   ├── references/
│   │   └── resume-eval-refs.md            # 该 skill 专属引用
│   └── prompts/
│       └── resume-analysis.prompt.md      # 结构化提示词模板
├── jd-decoder/                            # 功能二：JD 单独分析
│   ├── SKILL.md
│   ├── rules/
│   │   ├── jd-structure-parsing.md        # JD 结构化拆解规则
│   │   ├── competency-matrix.md           # 能力矩阵权重表
│   │   ├── implicit-requirements.md       # 隐性要求推断
│   │   ├── focus-points-inference.md      # 考察重点推断
│   │   └── boundaries.md
│   ├── scripts/
│   │   ├── jd-profile-template.md         # 岗位画像模板
│   │   └── execution-flow.md
│   ├── references/
│   │   └── jd-decoder-refs.md
│   └── prompts/
│       └── jd-analysis.prompt.md
├── jd-resume-matcher/                     # 功能三：组合分析（核心）
│   ├── SKILL.md
│   ├── rules/
│   │   ├── matching-model.md              # 匹配模型（VSM+语义+刚性弹性）
│   │   ├── dimension-weights.md           # 维度权重
│   │   ├── gap-classification.md          # 缺口分级
│   │   ├── improvement-priorities.md      # 改进建议优先级
│   │   └── boundaries.md
│   ├── scripts/
│   │   ├── match-scoring.md               # 匹配评分脚本
│   │   ├── gap-diagnosis.md               # 缺口诊断清单
│   │   └── execution-flow.md
│   ├── references/
│   │   └── matcher-refs.md
│   └── prompts/
│       └── jd-resume-match.prompt.md
└── interview-question-generator/          # 面试题生成
    ├── SKILL.md
    ├── rules/
    │   ├── question-taxonomy.md           # 题型分类
    │   ├── difficulty-grading.md          # 难度分级
    │   ├── answer-guidance-template.md    # 答案+引导模板
    │   ├── rag-hook-spec.md               # 八股外挂接口规范
    │   └── boundaries.md
    ├── scripts/
    │   ├── generation-flow.md
    │   └── question-bank-integration.md
    ├── references/
    │   └── interview-refs.md
    └── prompts/
        └── interview-questions.prompt.md

docs/column/resume-jd-master/              # 人可读专栏（前端可选展示）
├── 00-序章-第一性原理.md
├── 01-简历分析规则.md
├── 02-JD分析规则.md
├── 03-组合分析规则.md
├── 04-面试题生成规则.md
├── 05-质检标准.md
└── _references/                           # 不展示，仅 AI 检索存档
    ├── global-references.md               # 全局总引用（全保留）
    └── per-chapter/
        ├── 01-refs.md
        ├── 02-refs.md
        ├── 03-refs.md
        ├── 04-refs.md
        └── 05-refs.md
```

## 四、三功能执行框架

### 功能一：简历单独分析（resume-evaluator）

**8 维诊断**：结构完整性 · 内容量化度 · STAR 叙事质量 · 时间线连续性 · 关键词密度 · 技能-经历一致性 · 错别字/格式 · 差异化亮点

**编排链**：诊断 → ATS 评分 → 编排 highlight-extractor 榨亮点 → 编排 competency-model-alignment 对齐胜任力 → 编排 blind-spot-navigation 识别盲区 → STAR 重写建议

**对接代码**：`features/resume/diagnostics` + `ats.ts` + `star-rewriter.ts`

### 功能二：JD 单独分析（jd-decoder）

**输出**：岗位画像（职级/薪资/硬性/软性/考察重点）+ 能力矩阵（权重）+ 隐性要求推断

**编排链**：结构化拆解 → 能力矩阵构建 → 编排 jinsheng-san-yuanze 映射职级 → 编排 nengli-sanzhong-jingjie 判级 → 隐性要求推断 → 考察重点预测

**对接代码**：`features/jd/parser.ts` + `analyzer.ts`

### 功能三：组合分析（jd-resume-matcher，核心）

**匹配模型**：向量空间语义相似度 + 多维度加权评分（技能/经验/学历/软技能）+ 刚性条件校验 + 弹性语义匹配的混合机制

**输出**：整体匹配分（0-100）+ 分维度得分 + 缺口分级（致命/重要/加分）+ 改进建议（按优先级，指向具体段落）+ 面试题预生成

**编排链**：全 skills 编排（8 现有 + 3 新建）→ 匹配评分 → 缺口诊断 → 改进建议 → 触发 interview-question-generator

**对接代码**：`features/resume/matcher.ts` + `features/jd/smart-matcher.ts`

### 面试题生成（interview-question-generator）

**题型**：技术深挖 · 项目追问 · 系统设计 · 行为面试 · 反向提问 · 八股文（RAG 外挂）

**输出**：每题含题目 + 参考答案 + 回答引导 + 考察点 + 难度等级

**RAG 接口**：预留八股文题库外挂接口（`rag-hook-spec.md` 定义）

## 五、引用资料规范

- **全局引用** `global-references.md`：所有书/论文/专家/工具/课程，全保留
- **单篇引用** `per-chapter/`：该篇用到的子集，存档不展示
- **skill 内引用** `references/`：该 skill 专属引用
- **正文引用**：以 `[作者, 年份]` 内联，文末展开
- **可溯源性**：每条引用必须可溯源（书名+作者+页码/链接）

## 六、质检标准（专家团 loop）

### PM 验收清单
- [ ] 4 个 skill 包结构完整（SKILL.md + rules + scripts + references + prompts）
- [ ] 6 篇专栏文章内容完整、聚焦规则、引用规范
- [ ] 引用全部可溯源
- [ ] 编排链正确引用现有 8 skills
- [ ] 对接代码路径准确

### QA 用例矩阵
- 每篇专栏 ≥3 黄金用例（输入→预期输出）
- 每个 skill ≥5 测试 prompt（覆盖正常/边界/失败）
- 反幻觉检查：所有论断可溯源到引用

### Reviewer 缺陷扫描
- 无占位符（TBD/TODO）
- 无内部矛盾
- 无歧义表述
- 范围聚焦无蔓延

## 七、执行计划

1. 写 spec（本文档）✓
2. WebSearch 并行补强引用资料
3. 并行产出 4 个 skill 包（4 agent）
4. 并行产出 6 篇专栏 + 全局引用（3 agent）
5. 专家团质检（PM+QA+Reviewer 并行）
6. 修复 → 复检 → 交付
7. 待用户提供简历+JD，产出 demo
