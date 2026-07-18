# 规则：边界与失败模式

> 本文件定义 jd-decoder 的使用边界。返回上层路由见 `../SKILL.md`。

## 何时不用此 skill

| 场景 | 应改用 | 原因 |
|------|--------|------|
| 已有目标简历，需做简历-JD 双向匹配 | `src/features/jd/smart-matcher.ts` | 双向匹配需要双侧结构化数据，jd-decoder 只解码 JD 单侧 |
| JD 文本过短（有效信息 < 80 字） | 仅字段提取 + 标注"信息不足" | 信息量不足以支撑胜任力矩阵与隐性推断，强行推断=幻觉 |
| 纯校招/实习宣讲文案（无具体职责） | 直接告知用户"非标准 JD" | 宣讲文案以吸引为主，不含可解码的胜任力契约 |
| JD 已结构化（如招聘系统导出的 JSON） | 直接消费结构化数据 | 重复解码无意义，且可能破坏已有结构 |
| 用户只想问"这个薪资高不高" | 直接回答，不启动全流程 | 单点问题无需岗位画像 |

## JD 信息过少的处理

### 判定阈值
- 有效信息 < 80 字（去除公司介绍、福利、广告语后）→ 判为"信息过少"。
- 8 核心字段中 `responsibilities` 与 `skills` 任一为空 → 判为"关键字段缺失"。

### 降级处理（分级）
1. **字段提取照常**：`./jd-structure-parsing.md` 的 8 字段提取不受影响，能提多少提多少。
2. **能力矩阵降级**：若 `skills` 与 `responsibilities` 同时为空，`competency_matrix` 输出 `insufficient: true`，权重表不计算，只保留 `red_lines`（仅凭硬性条件）。
3. **隐性推断关闭**：`implicit_requirements` 全部置空，`speculative` 标注"信息不足，未推断"。
4. **考察重点降级**：`focus_points` 最多输出 2 条（仅基于硬性条件），`focus_insufficient: true`。
5. **职级/能力编排跳过**：不调用 `jinsheng-san-yuanze` 与 `nengli-sanzhong-jingjie`，因无足够职级信号与技能要求。

### 输出标记
信息过少的画像必须置顶标注：
```json
{ "decode_status": "partial", "missing_fields": ["responsibilities","skills"], "reason": "JD 有效信息 < 80 字" }
```

## 禁止：成功画像建模

### 定义
"成功画像建模"指：基于 JD 推断"什么样的人在这个岗位能成功/绩效拿 A/快速晋升"。

### 为何禁止
- jd-decoder 只有 JD 单侧文本，**无历史在职人员绩效数据、无离职原因数据、无晋升数据**。
- 在无结果数据的情况下做"成功画像"，等同于用输入预测输出，纯属编造（违反 RAG 拒幻觉原则）。
- Spencer & Spencer 的胜任力模型建立需要 BEI（行为事件访谈）数据，JD 文本不构成 BEI 数据源。

### 具体禁止项
- 禁止输出"成功者特质""高绩效画像""晋升快的人通常..."类表述。
- 禁止基于 JD 推断"该岗位淘汰率高/低"（无离职数据）。
- 禁止把 `implicit_requirements` 的 low 置信度推断包装成"成功要素"。
- 允许：推断"该岗位**要求**什么"（基于 JD 明示+合理推断）；禁止：推断"什么样的人**会成功**"（无数据支撑）。

## 与简历分析的区分

| 维度 | jd-decoder（本 skill） | 简历分析（competency-model-alignment / highlight-extractor 等） |
|------|----------------------|--------------------------------------------------------------|
| 解码对象 | JD（岗位要求侧） | 简历（候选人能力侧） |
| 方向 | 岗位 → 要求 | 经历 → 能力 |
| 理论模型 | 冰山模型（评估岗位要求分层） | 冰山模型（评估候选人四层素质） |
| 输出 | 岗位画像（competency_matrix + red_lines + focus_points） | 能力画像（经验/技能/潜力/动机四层） |
| 匹配关系 | 二者通过 P-J Fit（Kristof-Brown, 2005）拼合，但拼合由 `src/features/jd/smart-matcher.ts` 完成，不在本 skill 内 |

### 边界澄清
- jd-decoder **不读简历**：即使上下文中有简历文本，本 skill 也只解码 JD，简历信息不进入岗位画像。
- jd-decoder **不做匹配打分**：匹配分数是 `smart-matcher` 的产物，本 skill 只产出"JD 侧的结构化要求"供匹配器消费。
- 若用户同时给了简历和 JD 并要求"分析匹配度"：先分别解码（简历走简历分析 skill，JD 走 jd-decoder），再交给 `smart-matcher` 拼合，不在此 skill 内合并。

## 失败模式与应对

| 失败模式 | 表现 | 应对 |
|---------|------|------|
| 过度推断 | low 置信度推断被当 high 写入画像 | 强制 confidence 字段，low 只进 speculative |
| 职级误判 | 把"独立负责"误判为 P7（实为 P5） | 交由 `jinsheng-san-yuanze` 三原则校验，不自行定级 |
| 技能境界错配 | JD 写"了解"却被标为"精通"境界要求 | 严格按 `./jd-structure-parsing.md` 程度词映射表，不自行升档 |
| 红线泛化 | 把 preferred 加分项当 must 红线 | 严格按原文"必须/优先"修饰判定，无修饰默认 preferred |
| 隐性推断链式发散 | "微服务→Spring Cloud→Java→JVM 调优"多层链式 | 只允许一层推断（见 `./implicit-requirements.md` 类别 3） |

## 与其他规则文件的依赖关系

- 本边界规则优先级最高：若触发"信息过少"或"禁止成功画像"，立即终止对应步骤，不执行后续 `./competency-matrix.md`、`./implicit-requirements.md`、`./focus-points-inference.md`。
- 执行顺序与降级流见 `../scripts/execution-flow.md`。
