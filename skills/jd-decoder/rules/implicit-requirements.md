# 规则：隐性要求推断

> 本文件定义 jd-decoder 第 5 步的执行细则。返回上层路由见 `../SKILL.md`。需先完成 `./jd-structure-parsing.md` 与 `./competency-matrix.md`。

JD 文本中存在大量"未明说但实际看重"的要求。本规则从文本线索推断 4 类隐性要求，并对每条推断标注置信度。理论根基：冰山模型冰下层（Spencer & Spencer, 1993）+ P-J Fit 隐性匹配（Kristof-Brown et al., 2005）。

## 推断置信度标注规则

每条推断必须标注 `confidence` 与 `evidence`（原文支撑片段）。置信度三档：

| 置信度 | 触发条件 | 语义 |
|--------|---------|------|
| high | 原文有 ≥ 2 处独立线索指向同一推断 | 可作为强提示写入岗位画像 |
| medium | 原文有 1 处明确线索 | 可作为提示，但标注"需进一步确认" |
| low | 仅靠缺失/反常推断（无正面线索） | 仅作风险提示，不写入画像主体，单列 `speculative` |

**反幻觉约束**：low 置信度推断必须基于"JD 应有却缺失"的反常，禁止凭空编造。例如：JD 反复提"快节奏"却完全不提"工作生活平衡"，可 low 推断"可能加班文化"，但不可推断具体加班时长。

---

## 类别 1：企业文化暗示

### 推断规则
| 原文线索 | 推断结论 | 置信度 |
|---------|---------|--------|
| "抗压/高强度/快节奏/996/大小周" | 加班文化 / 高负荷 | high（出现 ≥1 即 high，因属明示） |
| "拥抱变化/灵活/敏捷/快速迭代" | 组织变动频繁 / 需适应不确定性 | medium |
| "扁平/平等/去层级" | 初创或小团队文化 | medium |
| "大厂/平台/体系成熟/流程规范" | 流程重、需适应既有体系 | medium |
| "创业心态/主人翁/ALL IN" | 创业期 / 资源紧张需身兼多职 | high |
| "外企/国际化/英语工作环境" | 跨时区协作 / 英语能力隐性 must | high |
| 出现"狼性/打仗/战场"等战争隐喻 | 强竞争 / 强淘汰文化 | medium |

### 处理细节
- 多线索指向同一文化（如"快节奏"+"拥抱变化"+"创业心态"）→ 合并为一条综合推断，置信度升档（medium→high）。
- 线索矛盾（"扁平"又"流程规范"）→ 两条都保留，标注 `conflict: true`，不强行合并。
- 输出字段：`culture_inference: [{ trait, evidence, confidence }]`。

---

## 类别 2：团队规模与角色推断

### 推断规则
| 原文线索 | 团队规模推断 | 角色推断 | 置信度 |
|---------|------------|---------|--------|
| "带领/管理 N 人团队" | 明确 N 人 | 管理者 | high |
| "带领团队"（无数字） | 5-10 人（中小团队默认） | 管理者 | medium |
| "参与/协助/配合" | 不推断具体规模 | 执行者 / 协作者 | high |
| "独立负责/owner/全权" | 1 人或极小团队 | 独立贡献者 / 单点 owner | high |
| "搭建团队/组建团队/0-1" | 当前 0-3 人，需扩张 | 团队搭建者 | high |
| "汇报给 CXO/直接向 VP 汇报" | 不推断规模 | 高曝光 / 高汇报权重 | medium |
| "跨 N 个团队协作" | 涉及 N 个团队 | 横向协调者 | medium |

### 处理细节
- "带领"与"管理"区别：带领≈技术 lead（仍写代码），管理≈纯管理线（People Manager）。若 JD 同时出现"带领团队"和"代码占比/技术深度"→ 推断为技术 lead，置信度 high。
- 团队规模推断为区间时，输出 `team_size_range: [min, max]`，不输出单点值。
- 输出字段：`team_inference: { size_range, role, evidence, confidence }`。

---

## 类别 3：技术栈推断

### 推断规则
从 JD 提及的显性技术推断未明说的配套技术栈：

| 原文显性线索 | 推断的隐性技术栈 | 置信度 |
|------------|----------------|--------|
| "微服务/服务化/分布式" | Spring Cloud / Dubbo / 服务网格（Istio） | medium |
| "高并发/大流量/海量请求" | 缓存（Redis）、消息队列（Kafka/RocketMQ）、限流降级 | high |
| "大数据/数据平台/数仓" | Hadoop/Spark/Flink/Hive 生态 | medium |
| "容器化/K8s/云原生" | Docker / Helm / CI/CD（ArgoCD/Jenkins） | high |
| "前端工程化/组件库" | Webpack/Vite、Monorepo、TypeScript | medium |
| "DevOps/SRE" | Prometheus/Grafana、Terraform、故障排查 | medium |
| "AI/大模型/LLM 应用" | LangChain/RAG、向量数据库、Prompt 工程 | medium |
| 提具体框架（如 React） | 配套生态（Redux/Zustand、Next.js） | low |

### 处理细节
- 推断的技术栈不写入 `skills`（那是 JD 明示的），单独列入 `inferred_stack: [{ tech, from, confidence }]`，`from` 记录由哪条明示线索推出。
- 仅 high 置信度的推断技术栈可在考察重点中作为"可能追问"提示。
- 禁止过度链式推断（如"微服务→Spring Cloud→进而推 Java"），只做一层推断。
- 输出字段：`inferred_stack`。

---

## 类别 4：业务阶段推断

### 推断规则
| 原文线索 | 业务阶段推断 | 隐性要求 | 置信度 |
|---------|------------|---------|--------|
| "从 0 到 1/0-1/搭建/从无到有" | 起步期 | 创业心态、能忍受模糊、全栈 | high |
| "1 到 10/10 到 100/规模化/扩张" | 成长期 | 能建体系、能扛规模压力 | high |
| "稳定/成熟/维护/迭代优化" | 成熟期 | 能守住质量、能优化既有系统 | high |
| "重构/技术债/历史包袱" | 成熟但负债期 | 能在约束下改造、风险可控 | medium |
| "出海/国际化/新市场" | 拓展期 | 能适应异地协作、文化敏感 | medium |
| "降本增效/优化成本" | 收缩或精细化期 | 能用数据证明价值、能砍冗余 | medium |

### 处理细节
- 业务阶段与企业文化暗示交叉验证：起步期 + "创业心态" → 双 high，强化推断。
- 业务阶段直接影响 `./competency-matrix.md` 职级权重（起步期倾向招"能独立 owner"的中高级，而非纯执行初级）。
- 输出字段：`business_stage: { stage, implicit_demand, evidence, confidence }`。

---

## 汇总输出契约

本规则产出一个 `implicit_requirements` 对象，合并进 `../scripts/jd-profile-template.md` 的岗位画像：

```json
{
  "implicit_requirements": {
    "culture_inference": [{ "trait", "evidence", "confidence" }],
    "team_inference": { "size_range", "role", "evidence", "confidence" },
    "inferred_stack": [{ "tech", "from", "confidence" }],
    "business_stage": { "stage", "implicit_demand", "evidence", "confidence" },
    "speculative": [ /* low 置信度推断，单列 */ ]
  }
}
```

后续：
- `culture_inference.trait` + `business_stage.implicit_demand` → 供 `./focus-points-inference.md` 决定行为面试维度。
- `inferred_stack`（仅 high）→ 供 `./focus-points-inference.md` 作为技术追问候选。
- `team_inference.role` → 供 `jinsheng-san-yuanze` 校正职级段位（管理者 vs IC）。
