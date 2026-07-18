# 规则：考察重点推断

> 本文件定义 jd-decoder 第 6 步的执行细则。返回上层路由见 `../SKILL.md`。需先完成 `./jd-structure-parsing.md`、`./competency-matrix.md`、`./implicit-requirements.md`。

从 JD 反推面试官最可能深挖的 **3-5 个维度**，输出可被 AI 直接消费的考察重点列表。每条含：dimension（维度）、description（为何重要 + 怎么考）、weight（high/medium/low）、source（由哪条 JD 线索推出）。

## 5 条推断规则

### 规则 1：硬性要求 → 技术深挖
- 触发：`hardRequirements` 中 category=技能 且 priority=must，或 `skills` 中 level=精通 且 required=true。
- 推断维度：`"技术深挖：<具体技能>"`。
- 考察方式：源码级追问、原理剖析、生产故障复盘。
- weight：high（must 红线技能必深挖）。
- 说明：JD 写"精通"的技能，面试官会用反例/边界条件压测，而非问定义。

### 规则 2：岗位职责 → 项目追问
- 触发：`responsibilities` 中以"负责/主导/推动/设计"开头的条目。
- 推断维度：`"项目追问：<职责关键词>"`。
- 考察方式：STAR 复盘、追问决策权衡、追问量化结果。
- weight：medium（除非该职责同时是 must 硬性要求，则升 high）。
- 说明：面试官会用"为什么这么设计/还有什么方案/上线效果如何"连环追问。

### 规则 3："带领/管理" → 团队管理
- 触发：`responsibilities` 或 `implicit_requirements.team_inference.role` 出现"带领/管理/汇报/owner"。
- 推断维度：`"团队管理与领导力"`。
- 考察方式：行为面试（STAR）、追问冲突处理、追问团队梯队建设、追问向下管理细节。
- weight：high（管理维度一旦出现必考）。
- 说明：技术 lead 追问"如何平衡写代码与管理"，纯管理线追问"如何做技术决策"。

### 规则 4："高并发/分布式/大数据量" → 系统设计
- 触发：`responsibilities`/`skills`/`implicit_requirements.inferred_stack` 出现"高并发/大流量/海量/分布式/微服务/高可用"。
- 推断维度：`"系统设计能力"`。
- 考察方式：白板系统设计、容量估算、故障演练设计、trade-off 分析。
- weight：high（系统设计题一旦触发必考）。
- 说明：即使 JD 未明说"高并发"，若 inferred_stack 推断出消息队列/缓存，也按 medium 列入。

### 规则 5：软性描述 → 行为面试
- 触发：`implicit_requirements.culture_inference` 非空，或 responsibilities/要求段出现"抗压/沟通/拥抱变化/owner/细节/协作"。
- 推断维度：`"行为面试：<软性特质>"`。
- 考察方式：STAR 行为问题、追问具体事例、追问价值观冲突场景。
- weight：依 `competency_matrix.hidden` 权重而定——隐性权重 ≥ 40% 升 high，否则 medium。
- 说明：高职级（P7+）行为面试权重显著上升，低职级以技术为主。

---

## 筛选与排序规则

### 候选去重
- 同一维度多条线索（如 3 条职责都指向"项目追问"）合并为 1 条，source 列出所有触发线索。
- 跨规则重复（"带领团队"同时触发规则 2 和规则 3）→ 归到更具体的规则 3（团队管理），规则 2 不重复列。

### 数量控制
- 目标 3-5 条，按以下优先级排序取前 5：
  1. weight=high 的维度（必入选）。
  2. 与 `red_lines`（must 硬性条件）直接相关的维度。
  3. 与 `competency_matrix` 中权重最高的胜任力层对应的维度。
  4. weight=medium 中 source 线索最多的。
- 若 high 维度已 ≥ 5 条：取前 5，其余降级列入 `secondary_focus`（不进主列表）。
- 若总维度 < 3 条：不强行凑数，标注 `focus_insufficient: true`，并从 `implicit_requirements.inferred_stack`（仅 high）补"技术追问候选"维度。

### 权重再校准
- 最终列表中 high 维度应占 40-60%（避免全是 high 或全是 medium）。
- 若全部为 high：将 source 线索最少的降为 medium。
- 若全部为 medium：将 source 线索最多的升为 high。

---

## 输出模板

```json
{
  "focus_points": [
    {
      "dimension": "技术深挖：JVM 调优",
      "description": "JD 标注精通 JVM，面试官会用生产故障反例压测 GC 选型与调优经验，而非问八股定义",
      "weight": "high",
      "source": ["skills.level=精通:JVM", "hardRequirements.priority=must"]
    },
    {
      "dimension": "系统设计能力",
      "description": "JD 提高并发与微服务，预期白板设计一个支撑 N QPS 的服务，追问容量估算与降级方案",
      "weight": "high",
      "source": ["responsibilities:高并发服务", "inferred_stack:消息队列/缓存"]
    },
    {
      "dimension": "团队管理与领导力",
      "description": "JD 要求带领 5 人团队，预期 STAR 追问冲突处理与梯队培养，技术 lead 会追问代码占比",
      "weight": "high",
      "source": ["responsibilities:带领团队", "team_inference.role=管理者"]
    },
    {
      "dimension": "行为面试：抗压与拥抱变化",
      "description": "JD 软性描述含抗压与拥抱变化，隐性权重 40%，预期追问具体高压事例与价值观冲突场景",
      "weight": "medium",
      "source": ["culture_inference.trait=抗压", "culture_inference.trait=拥抱变化"]
    }
  ],
  "secondary_focus": [],
  "focus_insufficient": false
}
```

## 输出契约

本规则产出 `focus_points`（最终化），覆盖 `./jd-structure-parsing.md` 字段 8 的候选线索，写入 `../scripts/jd-profile-template.md` 岗位画像的 `focusPoints` 字段。下游消费：
- `src/features/jd/parser.ts` 的 `focusPoints` 字段（dimension/description/weight）与本输出 schema 对齐。
- 供 RAG 检索时作为"面试准备方向"注入 system prompt。
- 供简历-JD 匹配时（`src/features/jd/smart-matcher.ts`）作为打分维度来源。
