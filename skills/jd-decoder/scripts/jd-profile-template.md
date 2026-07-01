# 岗位画像输出模板

> 本文件定义 jd-decoder 最终输出的 JSON 结构与字段说明。返回上层路由见 `../SKILL.md`。各字段填充规则见 `../rules/` 对应文件。

岗位画像是 jd-decoder 的最终产物，主要供 AI 消费（RAG 检索 + skills-loader 注入 system prompt），人可读为辅。结构为单一 JSON 对象。

## 顶层结构

```json
{
  "meta": {
    "skill": "jd-decoder",
    "version": "1.0",
    "decoded_at": "ISO-8601 时间戳",
    "decode_status": "full | partial",
    "language": "zh | en | mixed"
  },
  "structured_fields": { /* 字段 1-4，见下 */ },
  "hard_requirements": [ /* 字段 5 */ ],
  "responsibilities": [ /* 字段 6 */ ],
  "skills": [ /* 字段 7 */ ],
  "competency_matrix": { /* 能力矩阵 */ },
  "red_lines": [ /* 硬性红线汇总 */ ],
  "level_inference": { /* 职级推断（编排 jinsheng-san-yuanze）*/ },
  "skill_mastery_floor": [ /* 技能境界达标线（编排 nengli-sanzhong-jingjie）*/ },
  "implicit_requirements": { /* 隐性要求推断 */ },
  "focus_points": [ /* 考察重点，字段 8 最终化 */ ],
  "confidence_summary": { /* 整体置信度 */ }
}
```

---

## 字段说明

### meta（元信息）
| 字段 | 类型 | 说明 |
|------|------|------|
| skill | string | 固定 "jd-decoder" |
| version | string | 模板版本 |
| decoded_at | string | 解码时间 |
| decode_status | string | `full`=完整解码；`partial`=信息过少降级（见 `../rules/boundaries.md`） |
| language | string | JD 主语言 |

### structured_fields（字段 1-4）
```json
{
  "title": "高级后端工程师",
  "department": "电商业务线",
  "level": { "raw": "P7", "conflict": false },
  "salary": { "min": 30000, "max": 50000, "currency": "CNY", "period": "month", "open_ended": false }
}
```
| 字段 | 类型 | 说明 | 填充规则 |
|------|------|------|---------|
| title | string | 职位名称 | `../rules/jd-structure-parsing.md` 字段 1 |
| department | string | 部门 | 字段 2 |
| level.raw | string | 原始职级标识/描述词 | 字段 3 |
| level.conflict | boolean | 职级冲突标记 | 字段 3 模糊处理 |
| salary.* | object | 薪资范围 | 字段 4 |

### hard_requirements（字段 5）
```json
[
  { "category": "学历", "description": "本科及以上", "priority": "must", "is_red_line": true },
  { "category": "经验", "description": "5年以上工作经验", "priority": "must", "is_red_line": true },
  { "category": "证书", "description": "PMP 优先", "priority": "preferred", "is_red_line": false }
]
```
填充规则：`../rules/jd-structure-parsing.md` 字段 5。`is_red_line` 由 `../rules/competency-matrix.md` 硬性条件区分规则派生。

### responsibilities（字段 6）
```json
["负责电商订单系统核心服务设计与开发", "主导高并发场景下的服务性能优化"]
```
填充规则：`../rules/jd-structure-parsing.md` 字段 6。每条为独立字符串，去除前缀符号。

### skills（字段 7）
```json
[
  { "name": "Java", "level": "精通", "required": true, "mastery_floor": "精通" },
  { "name": "Redis", "level": "熟悉", "required": true, "mastery_floor": "熟练" },
  { "name": "Kubernetes", "level": "了解", "required": false, "mastery_floor": "基础" }
]
```
| 字段 | 说明 |
|------|------|
| level | JD 原文程度词映射（精通/熟悉/了解） |
| required | 是否必须（加分项=false） |
| mastery_floor | 该岗位对此技能的最低境界要求，由 `nengli-sanzhong-jingjie` 三境界（精通/熟练/基础）填充 |

填充规则：`../rules/jd-structure-parsing.md` 字段 7 + 编排 `nengli-sanzhong-jingjie`。

### competency_matrix（能力矩阵）
```json
{
  "default_or_level_based": "level_based",
  "level_basis": "P7",
  "visible": { "weight": 0.55, "layers": { "knowledge": 0.20, "skill": 0.35 } },
  "hidden": { "weight": 0.45, "layers": { "social_role": 0.15, "self_image": 0.15, "trait": 0.075, "motivation": 0.075 } },
  "insufficient": false
}
```
填充规则：`../rules/competency-matrix.md`。`level_basis` 来自 `level_inference`。

### red_lines（硬性红线汇总）
```json
[
  { "type": "学历", "description": "本科及以上" },
  { "type": "经验", "description": "5年以上工作经验" },
  { "type": "技能", "description": "精通 Java" }
]
```
来源：所有 `priority: "must"` 的 hard_requirements + `required: true 且 level: 精通` 的 skills。供 `src/features/jd/smart-matcher.ts` 做一票否决。

### level_inference（职级推断）
```json
{
  "band": "P7",
  "track": "IC",
  "inferred": true,
  "basis": [
    { "signal": "主导高并发服务优化", "principle": "价值原则", "evidence": "JD 职责段" },
    { "signal": "5年以上经验", "principle": "经验年限映射", "evidence": "硬性要求" }
  ]
}
```
填充规则：编排 `jinsheng-san-yuanze`（三原则映射）+ `../rules/competency-matrix.md` 职级触发规则。`track` 为 IC（独立贡献者）或 M（管理线），由 `implicit_requirements.team_inference.role` 决定。

### skill_mastery_floor（技能境界达标线）
```json
[
  { "skill": "Java", "floor": "精通", "reason": "JD 标注精通，要求能优化/创造新经验" },
  { "skill": "Redis", "floor": "熟练", "reason": "JD 标注熟悉，要求最佳实践高质交付" }
]
```
填充规则：编排 `nengli-sanzhong-jingjie`（基础/熟练/精通三境界）。`floor` 即该岗位对此技能的最低达标境界。

### implicit_requirements（隐性要求推断）
```json
{
  "culture_inference": [{ "trait": "加班文化", "evidence": "抗压/快节奏", "confidence": "high" }],
  "team_inference": { "size_range": [3, 8], "role": "技术lead", "evidence": "带领团队+代码深度", "confidence": "high" },
  "inferred_stack": [{ "tech": "Redis", "from": "高并发", "confidence": "high" }],
  "business_stage": { "stage": "成长期", "implicit_demand": "能建体系扛规模", "evidence": "规模化", "confidence": "high" },
  "speculative": [{ "trait": "可能英语工作", "evidence": "缺失工作生活平衡描述", "confidence": "low" }]
}
```
填充规则：`../rules/implicit-requirements.md`。

### focus_points（考察重点，字段 8 最终化）
```json
[
  {
    "dimension": "技术深挖：JVM 调优",
    "description": "JD 标注精通 JVM，面试官用生产故障反例压测 GC 选型经验",
    "weight": "high",
    "source": ["skills.level=精通:JVM", "hardRequirements.priority=must"]
  }
]
```
填充规则：`../rules/focus-points-inference.md`。schema 与 `src/features/jd/types.ts` 的 `focusPoints`（dimension/description/weight）对齐，额外增 `source` 字段供溯源。

### confidence_summary（整体置信度）
```json
{
  "overall": "medium",
  "structured_fields_confidence": "high",
  "matrix_confidence": "medium",
  "implicit_confidence": "medium",
  "focus_confidence": "high",
  "caveats": ["职级由经验年限推断，未给出明确段位", "隐性推断中文化暗示为 medium 置信度"]
}
```
| 字段 | 说明 |
|------|------|
| overall | 整体置信度（取各模块最低） |
| *_confidence | 各模块置信度 |
| caveats | 需提示用户的注意事项列表 |

## 与现有代码的契约

本模板字段命名与 `src/features/jd/types.ts` 的 `JDDocument` 接口保持兼容：
- `structured_fields.title/department/level/salary` ↔ `JDDocument.title/department/level/salary`
- `hard_requirements` ↔ `JDDocument.hardRequirements`
- `responsibilities` ↔ `JDDocument.responsibilities`
- `skills` ↔ `JDDocument.skills`（增 `mastery_floor`）
- `focus_points` ↔ `JDDocument.focusPoints`（增 `source`）

新增字段（`competency_matrix`/`red_lines`/`level_inference`/`skill_mastery_floor`/`implicit_requirements`/`confidence_summary`）为 jd-decoder 扩展，不影响现有 `parseJD` 流水线消费。
