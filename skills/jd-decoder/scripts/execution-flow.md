# 执行流程图

> 本文件定义 jd-decoder 的端到端执行顺序与数据流。返回上层路由见 `../SKILL.md`。

## 流程总览（文本流程图）

```
输入：JD 原始文本
  │
  ▼
[0] 前置检查（rules/boundaries.md）
  │  ├─ JD 有效信息 < 80 字？ ──是──▶ 降级：仅字段提取，标 decode_status=partial，跳至 [7]
  │  └─ 非标准 JD（宣讲文案）？ ──是──▶ 终止，告知用户
  ▼
[1] 结构化拆解（rules/jd-structure-parsing.md）
  │  产出：8 核心字段原始结构
  │  ├─ title / department / level.raw / salary
  │  ├─ hard_requirements（含 priority 标记）
  │  ├─ responsibilities
  │  ├─ skills（含 level=精通/熟悉/了解）
  │  └─ focus_points 候选线索（未最终化）
  ▼
[2] 能力矩阵构建（rules/competency-matrix.md）
  │  输入：[1] 的 hard_requirements + responsibilities + skills
  │  产出：
  │  ├─ competency_matrix（visible/hidden 权重，按职级权重表）
  │  └─ red_lines（must 硬性红线汇总）
  │  ──────────────────────────────────────
  │  注：competency_matrix 需职级段位确定权重表，
  │      故 [2] 与 [3] 存在依赖，先做 [3] 再回填权重
  ▼
[3] 职级推断（编排 jinsheng-san-yuanze）
  │  输入：[1] 的 level.raw + responsibilities 职级信号
  │  处理：用"主动/成长/价值"三原则把信号映射到段位
  │    ├─ "独立负责" → 主动原则 → P5/P6
  │    ├─ "主导优化/创造价值" → 价值原则 → P7+
  │    └─ "带领团队/搭建体系" → 成长原则（管理）→ M 线
  │  产出：level_inference（band / track=IC|M / inferred / basis）
  │  回填：[2] 据 band 选职级权重表，重算 competency_matrix
  ▼
[4] 能力判级（编排 nengli-sanzhong-jingjie）
  │  输入：[1] 的 skills（每条 level=精通/熟悉/了解）
  │  处理：把 JD 程度词映射到三境界最低达标线
  │    ├─ JD"精通" → mastery_floor=精通（要求能优化/创造新经验）
  │    ├─ JD"熟悉" → mastery_floor=熟练（要求最佳实践高质交付）
  │    └─ JD"了解" → mastery_floor=基础（要求会做）
  │  产出：skill_mastery_floor[]
  ▼
[5] 隐性要求推断（rules/implicit-requirements.md）
  │  输入：[1] 的 responsibilities + 软性描述 + [3] 的 team role 信号
  │  处理：4 类推断，每条标 confidence + evidence
  │    ├─ 企业文化暗示（加班/拥抱变化/创业心态...）
  │    ├─ 团队规模与角色（带领/独立/搭建...）
  │    ├─ 技术栈推断（微服务→Spring Cloud，高并发→缓存/MQ）—仅一层推断
  │    └─ 业务阶段推断（0-1/1-10/成熟/重构...）
  │  产出：implicit_requirements（culture/team/inferred_stack/business_stage + speculative）
  ▼
[6] 考察重点预测（rules/focus-points-inference.md）
  │  输入：[1] 候选线索 + [2] red_lines + [2] competency_matrix + [5] implicit
  │  处理：5 条推断规则 → 去重 → 排序 → 取 3-5 条
  │    ├─ 规则1 硬性要求→技术深挖
  │    ├─ 规则2 岗位职责→项目追问
  │    ├─ 规则3 带领/管理→团队管理
  │    ├─ 规则4 高并发/分布式→系统设计
  │    └─ 规则5 软性描述→行为面试
  │  产出：focus_points[]（最终化，覆盖 [1] 的候选线索）+ secondary_focus[]
  ▼
[7] 输出岗位画像（scripts/jd-profile-template.md）
  │  套用 JSON 模板，汇总 [1]-[6] 全部产出
  │  计算 confidence_summary（整体=各模块最低）
  ▼
输出：岗位画像 JSON（供 RAG 检索 / skills-loader 注入 / smart-matcher 消费）
```

## 步骤依赖与并行性

| 步骤 | 依赖前置 | 可并行 |
|------|---------|--------|
| [0] 前置检查 | 无 | — |
| [1] 结构化拆解 | [0] 通过 | — |
| [3] 职级推断 | [1] | 可与 [4] 并行（二者只依赖 [1]） |
| [4] 能力判级 | [1] | 可与 [3] 并行 |
| [2] 能力矩阵 | [1] + [3]（需 band 定权重表） | 必须在 [3] 后 |
| [5] 隐性推断 | [1] + [3] 的 team role | 可与 [2] 并行 |
| [6] 考察重点 | [1] + [2] + [5] | 必须在 [2][5] 后 |
| [7] 输出画像 | [1]-[6] 全部 | 必须最后 |

**最优执行序**：[0] → [1] → ([3] ∥ [4]) → [2] → [5] → [6] → [7]。其中 [3] 与 [4] 可并行执行（均只读 [1]），[2] 与 [5] 可并行（[2] 读 [3]，[5] 读 [3] 的 team role）。

## 降级流（信息过少时）

触发 `rules/boundaries.md` 的"信息过少"判定后，执行降级流：

```
[0] 判定信息过少
  ▼
[1] 字段提取（照常，能提多少提多少）
  ▼
[2] 能力矩阵 → 标 insufficient=true，仅保留 red_lines（仅凭硬性条件），不计算权重
[3] 职级推断 → 跳过（无足够信号）
[4] 能力判级 → 跳过（skills 可能为空）
[5] 隐性推断 → 全部置空，speculative 标"信息不足，未推断"
[6] 考察重点 → 最多 2 条（仅基于硬性条件），标 focus_insufficient=true
  ▼
[7] 输出画像 → decode_status=partial，置顶标 missing_fields + reason
```

## 数据流契约（与现有代码）

```
JD 文本
  │
  ▼
jd-decoder（本 skill）──▶ 岗位画像 JSON
                              │
                              ├─▶ RAG 检索（画像作为可检索知识片段）
                              ├─▶ skills-loader 注入 system prompt
                              └─▶ src/features/jd/smart-matcher.ts（与简历侧拼合做 P-J Fit 匹配）
```

岗位画像 JSON 的 schema 见 `./jd-profile-template.md`，字段命名与 `src/features/jd/types.ts` 的 `JDDocument` 兼容，确保可被 `src/features/jd/parser.ts` 流水线无缝消费。

## 编排 skill 的调用约定

调用 `jinsheng-san-yuanze` 与 `nengli-sanzhong-jingjie` 时：
- 输入：仅传递 JD 侧的结构化信号（职级描述词 / 技能程度词），**不传递简历信息**（见 `../rules/boundaries.md` 与简历分析的区分）。
- 调用方式：遵循各自 SKILL.md 的 E（执行）步骤，jd-decoder 作为编排者提供输入，不干预其内部判断逻辑。
- 输出回收：把两 skill 的结论回填到 `level_inference` 与 `skill_mastery_floor`，并保留 `basis`/`reason` 供溯源。
