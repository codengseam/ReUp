# AI / LLM / Agent 面试题 Top50（标准答案版）

本文档收录了 50 道 AI 相关高频面试题，覆盖 Agent、RAG、LLM、MCP、工具调用等方向，每题包含：

- 题目  
- 分类  
- 难度  
- 高频公司  
- 解题思路  
- 标准参考答案  

---

## 一、Agent 与工具调用

### 1. 什么是 ReAct？它的思考-行动-观察循环和工具调用流程是怎样的？

- **分类**：Agent / LLM  
- **难度**：进阶  
- **高频公司**：淘天、腾讯、字节、百度

**解题思路**：

1. ReAct 核心概念（Reason + Act）  
2. 思考-行动-观察循环  
3. 工具调用机制  
4. 与纯 CoT 的区别  

**参考答案**：  
ReAct 是结合推理与行动的 Agent 框架，核心流程为：Thought → Action → Observation → Thought ...

- **Thought**：分析当前任务，生成逻辑步骤  
- **Action**：执行工具调用或操作，如 API、数据库、函数调用  
- **Observation**：观察行动结果，反馈给模型  
- **循环迭代**：直至任务完成  

优势：支持复杂任务、多轮工具调用、即时纠错和动态决策。

---

### 2. RAG 中长文档切片的粒度和分块策略如何设计与优化？

- **分类**：RAG  
- **难度**：进阶  
- **高频公司**：快手、字节、淘天

**解题思路**：

- 为什么需要 chunk  
- chunk 太大/太小问题  
- 不同分块策略  
- 工程优化  

**参考答案**：  

- **目标**：提高召回率、保留语义完整性  
- **固定长度切分**：如 512 tokens + overlap 128  
- **语义切分**：按段落、标题或章节切分  
- **Parent-child chunk**：小 chunk 用于检索，大 chunk 返回  
- **优化策略**：overlap 10%-20%、动态 chunk、不同文档格式适配  
- **常用参数**：chunk 300~800，overlap 50~150

---

### 3. RAG 系统评测的维度和常用指标如何设计？

- **分类**：RAG / Evaluation  
- **难度**：进阶  
- **高频公司**：快手、米可

**解题思路**：

- 检索层指标  
- 生成层指标  
- End-to-End 系统评测  
- 在线指标  

**参考答案**：  

1. **检索层**：Recall@K、HitRate、MRR、nDCG  
2. **生成层**：Faithfulness、Correctness、Relevance、Hallucination Rate  
3. **系统层**：Latency、Token Cost、用户满意度、Completion Rate  
4. **线上指标**：CTR、停留时长、追问率、人工反馈  

---

### 4. RAG 系统中的文档分块策略如何设计？

- **分类**：RAG  
- **难度**：进阶  
- **高频公司**：Moka、阿里、百度

**解题思路**：

- chunk 大小  
- overlap  
- parent-child  
- 不同文档格式  

**参考答案**：  

- Markdown：按标题切分  
- PDF：OCR + layout 解析 + 表格特殊处理  
- 代码：按函数/类/模块切分  
- Parent-child：小 chunk 检索，大 chunk 返回  
- overlap 建议 10%-20%  

---

### 5. 多 Agent 协作有哪些常见模式、适用场景和主要挑战？

- **分类**：Agent  
- **难度**：进阶  
- **高频公司**：字节、阿里云、阿里、蚂蚁、小红书、淘天

**解题思路**：

- 协作模式  
- 适用场景  
- 挑战  

**参考答案**：

- **模式**：
  - Manager-Worker：主 Agent 拆任务，子 Agent 执行  
  - Pipeline：顺序执行任务  
  - Debate/Voting：多 Agent 独立思考，投票融合  
- **适用场景**：复杂任务拆解、多模态集成、跨域决策  
- **挑战**：上下文同步、冲突处理、Token 爆炸、调度复杂  

---

### 6. Agent 的上下文管理和记忆机制通常如何设计，如何避免上下文过长或信息污染？

- **分类**：Agent  
- **难度**：进阶  
- **高频公司**：快手、百度、字节、阿里云、蚂蚁

**解题思路**：

- 短期记忆 vs 长期记忆  
- 优化策略  

**参考答案**：

- **短期记忆**：滑动窗口，保存当前任务上下文  
- **长期记忆**：向量数据库、Graph Memory、KV Memory  
- **优化**：
  - 摘要压缩  
  - 信息优先级筛选  
  - 时间衰减 / 淘汰策略  
  - 任务隔离避免污染  

---

### 7. 在开发工作中如何使用 AI 工具辅助编程和提效？

- **分类**：AICoding / OpenEnded  
- **难度**：进阶  
- **高频公司**：小红书、蚂蚁、影石

**解题思路**：

- 自动生成代码  
- 自动生成测试  
- 辅助 Debug  
- 文档生成  

**参考答案**：

- **代码生成**：CRUD、API、SQL  
- **单元测试生成**：pytest、mock  
- **Debug**：Stack trace 定位、root cause  
- **文档生成**：README、注释、接口文档  
- **注意事项**：AI 生成内容需 Review、测试、安全审查  

---

### 8. 大模型长上下文场景下，如何进行上下文压缩与优化？

- **分类**：LLM / RAG / Agent  
- **难度**：进阶  
- **高频公司**：快手、淘天、拼多多、腾讯

**解题思路**：

- 摘要压缩  
- RAG 替代全量上下文  
- Memory 分层  
- 优先级过滤  
- KV Cache  

**参考答案**：

- 摘要压缩保留关键实体  
- RAG 检索相关信息替代全量上下文  
- Memory 分层：working memory + long-term memory  
- 重要性/时间优先级筛选  
- KV cache 减少重复计算  

---

### 9. 在 LLM 或 RAG 应用中，如何减少和规避幻觉问题？

- **分类**：LLM / RAG  
- **难度**：进阶  
- **高频公司**：阿里云、京东、蚂蚁

**解题思路**：

- 使用 RAG 外部知识约束  
- Prompt 约束  
- 引用来源  
- 调整 temperature  
- Self-check  

**参考答案**：

- RAG 限制模型基于外部文档回答  
- Prompt 明确要求“只回答提供资料内容”  
- 输出引用 / citation  
- 调整 temperature 减少发散  
- Self-Reflection / Self-Check  

---

### 10. 在 RAG 中，既然向量检索已经计算了相似度，为什么还需要引入交叉编码器进行重排？

- **分类**：RAG / Evaluation  
- **难度**：进阶  
- **高频公司**：快手

**解题思路**：

- Bi-Encoder 检索问题  
- Cross-Encoder 原理  
- Recall -> Rerank 流程  

**参考答案**：

- Bi-Encoder：query/doc 独立编码，排序不够精准  
- Cross-Encoder：query + doc 联合建模，提高排序精度  
- 工业实践：Top100 recall → Top10 Rerank  

---



# 11、如何评估 Rerank 的有效性，常用哪些指标？

- 分类：RAG / Evaluation
- 难度：进阶
- 高频公司：快手

## 解题思路

1. 离线评测
2. 在线评测
3. 排序质量指标

## 标准参考答案

Rerank 的核心目标：

- 提高最终排序质量
- 提升正确答案排名

常见指标：

### Recall@K

正确答案是否出现在 TopK。

### MRR（Mean Reciprocal Rank）

正确答案排名越靠前越好。

### nDCG

衡量整体排序质量。

### HitRate

是否命中正确文档。

线上指标：

- CTR
- 用户满意度
- 追问率下降

工业界通常：

Recall → Rerank → Generation。

---

# 12、GRPO 和 PPO 的核心区别是什么？

- 分类：LLM / Evaluation
- 难度：深入
- 高频公司：作业帮、腾讯、三七互娱

## 标准参考答案

PPO（Proximal Policy Optimization）：

- 基于 Advantage 更新
- 需要 value model
- 稳定性较高

GRPO（Group Relative Policy Optimization）：

- 不依赖 value model
- 基于 group 内相对奖励
- 更适合大模型 RLHF

核心区别：

| 维度        | PPO  | GRPO           |
| ----------- | ---- | -------------- |
| Value Model | 需要 | 不需要         |
| 方差控制    | GAE  | Group Relative |
| 训练复杂度  | 高   | 相对更低       |
| 适合场景    | RL   | LLM RLHF       |

GRPO 目前在开源大模型训练中越来越常见。

---

# 13、工具调用的安全控制与敏感接口限制如何实现？

- 分类：Agent / Prompt
- 难度：进阶
- 高频公司：快手

## 标准参考答案

Agent 工具调用的核心风险：

- 越权
- Prompt Injection
- 敏感操作误触发

常见方案：

### Tool Permission

按用户权限开放工具。

### 参数校验

对：

- SQL
- Shell
- API 参数

进行 whitelist 校验。

### Human-in-the-loop

高风险操作需要人工确认。

### 沙箱隔离

工具运行在受限环境。

### Prompt 防注入

过滤：

- Ignore previous instruction
- System prompt leak

等攻击。

---

# 14、ReAct 与 Plan-and-Execute 有什么区别？

- 分类：Agent
- 难度：进阶
- 高频公司：淘天、腾讯

## 标准参考答案

ReAct：

- 边思考边执行
- 动态决策
- 灵活性高

Plan-and-Execute：

- 先生成完整计划
- 再逐步执行

区别：

| 维度     | ReAct    | Plan-and-Execute |
| -------- | -------- | ---------------- |
| 决策方式 | 动态     | 静态规划         |
| 灵活性   | 高       | 中               |
| 适合任务 | 开放任务 | 固定流程         |

工业界很多场景优先选择 ReAct。

---

# 15、如何自建一个 Agent 系统，并将其做到生产级落地？

- 分类：Agent
- 难度：进阶
- 高频公司：万类智生、蚂蚁、字节、腾讯

## 标准参考答案

生产级 Agent 架构：

1. Planner
2. Tool Manager
3. Memory
4. Workflow Engine
5. Evaluation
6. Monitoring

关键工程能力：

### 稳定性

- Retry
- Timeout
- Fallback

### 可观测性

- Trace
- 日志
- Token Cost

### 安全性

- 权限控制
- Prompt 防注入

### 成本优化

- 小模型路由
- Cache
- RAG

---

# 16、向量数据库检索到的历史信息即使语义相关但时间过久，还能直接使用吗？

- 分类：RAG
- 难度：进阶
- 高频公司：快手

## 标准参考答案

不能只看语义相关性。

很多场景：

- 新闻
- 金融
- 商品
- 政策

存在时效性问题。

常见优化：

### 时间衰减

score = semantic_score × time_decay。

### Metadata Filter

限制：

- 时间范围
- 数据版本

### Hybrid Retrieval

语义 + 时间联合排序。

---

# 17、单 Agent 和多 Agent 分别适用于哪些场景？

- 分类：Agent
- 难度：进阶
- 高频公司：字节、淘天、阿里云

## 标准参考答案

单 Agent：

适合：

- 简单任务
- 低延迟
- 单领域

优点：

- 简单
- 成本低

多 Agent：

适合：

- 复杂任务拆解
- 多角色协作
- 多模态任务

优点：

- 专业化
- 可扩展

缺点：

- 成本高
- 调度复杂

---

# 18、Rerank 的 Top-k 数量通常如何确定？

- 分类：RAG
- 难度：进阶
- 高频公司：快手

## 标准参考答案

TopK 本质是：

召回率 vs 成本 的平衡。

经验值：

- Recall Top50~200
- Rerank Top5~20

优化方式：

### Offline Eval

观察：

- Recall
- MRR
- nDCG

### Online A/B Test

观察：

- 用户满意度
- Latency
- Token 成本

TopK 过大：

- 成本高
- 噪声增加

TopK 过小：

- 容易漏召回。

---

# 19、工具调用超时或返回空值时，如何设计 Prompt 让 Agent 进行用户反馈？

- 分类：Agent / Prompt
- 难度：进阶
- 高频公司：快手

## 标准参考答案

不能让 Agent 静默失败。

Prompt 通常要求：

### Timeout Handling

超时后：

- 重试
- 降级
- 反馈用户

### Empty Result Handling

返回空值时：

- 请求更多信息
- 提供可能原因

例如：

“当前未检索到结果，请确认关键词是否正确。”

---

# 20、MCP 和 Skills 有什么区别？

- 分类：MCP / Agent
- 难度：进阶
- 高频公司：作业帮、腾讯

## 标准参考答案

MCP（Model Context Protocol）：

核心目标：

- 标准化模型与工具通信

解决：

- Tool schema
- Context sharing
- Agent interoperability

Skills：

本质是：

- 可复用能力封装

例如：

- 搜索技能
- SQL 技能
- Coding 技能

区别：

| 维度     | MCP        | Skills      |
| -------- | ---------- | ----------- |
| 本质     | 协议       | 能力模块    |
| 目标     | 标准化通信 | 复用功能    |
| 作用层级 | Infra      | Application |

---

# 21、LLM 是如何实现工具调用的？Function Calling 的底层机制与执行流程是什么？

- 分类：LLM / Agent
- 难度：进阶
- 高频公司：未知

## 标准参考答案

Function Calling 是大模型调用外部 API 的能力：

1. **定义函数接口**  
   - schema（参数类型、必选参数）
2. **Prompt 生成调用指令**  
   - LLM 根据任务生成 JSON / function call
3. **执行工具/函数**  
   - 将参数传入外部系统
4. **返回 Observation**  
   - LLM 根据结果继续推理

特点：

- 与 ReAct、Agent 结合可形成闭环
- 工程上通常结合安全校验和超时控制

---

# 22、你做过的 AI 项目中最困难的技术挑战是什么，你是如何解决的？

- 分类：Agent / OpenEnded / RAG
- 难度：进阶
- 高频公司：阿里云

## 标准参考答案

常见挑战：

- 多工具调用
- 上下文爆炸
- 幻觉与错误信息
- 系统稳定性

解决方案：

- 任务拆解
- Memory / RAG 优化
- Prompt 设计 + 模型自检
- 监控 & Retry & Fallback

---

# 23、当 Agent 需要调用多个工具或工具之间存在依赖关系时，调度引擎应该如何设计？

- 分类：Agent
- 难度：深入
- 高频公司：未知

## 标准参考答案

核心原则：

- DAG（有向无环图）建模工具依赖
- 调度顺序：先依赖后执行
- 异常处理：失败重试或降级
- 并行处理：独立工具可并行

---

# 24、开源模型的 Function Calling 能力较弱时，如何通过微调或 Prompt 设计来提升其工具调用能力？

- 分类：Agent / Prompt / LLM
- 难度：进阶
- 高频公司：未知

## 标准参考答案

方法：

- **微调**：
  - RLHF 训练模型学会标准化 function call
- **Prompt Engineering**：
  - 明确指令格式
  - 示例化调用
- **校验输出**：
  - JSON Schema 验证
- **分层设计**：
  - 小模型生成调用指令
  - 大模型推理

---

# 25、Agentic RAG 与传统 RAG 的核心区别是什么？

- 分类：RAG / Agent
- 难度：进阶
- 高频公司：未知

## 标准参考答案

Agentic RAG：

- Agent 驱动检索与生成
- 可以动态选择工具 / 调用逻辑
- 支持多轮、条件决策

传统 RAG：

- 检索 + 生成
- 静态流程
- 单轮调用

优势：

- 更适合复杂任务
- 更易扩展多工具能力

---

# 26、在项目中是如何进行 LLM 模型选择的？

- 分类：LLM / OpenEnded / Agent
- 难度：进阶
- 高频公司：Shopee、腾讯、Moka

## 标准参考答案

考虑维度：

- 功能：
  - 长上下文能力
  - Multi-turn
  - 函数调用
- 成本：
  - Token Cost
  - 并发支持
- 可控性：
  - 幻觉率
  - 安全性
- 工程：
  - 部署便利
  - API 支持

策略：

- 单模型统一：简化管理
- 多模型切换：根据任务选择
- 自研模型：特殊场景或安全要求

---

# 27、在多 Agent 协作中，如何解决冲突、分歧以及争议无法收敛的问题？

- 分类：Agent
- 难度：深入
- 高频公司：未知

## 标准参考答案

方法：

- Voting / Majority
- Manager Agent 仲裁
- Meta Agent 复盘
- 自我反思机制（Self-Reflection）
- 设置明确规则或评分机制

---

# 28、基于强化学习的 Agent 与传统基于 Prompt 的 Agent 有什么区别？

- 分类：Agent / LLM / Prompt
- 难度：进阶
- 高频公司：未知

## 标准参考答案

| 维度     | RL Agent        | Prompt Agent   |
| -------- | --------------- | -------------- |
| 决策     | Policy 优化     | 静态 Prompt    |
| 学习能力 | 可优化          | 不优化         |
| 错误修正 | Reward / Punish | 人工纠错       |
| 应用场景 | 长期复杂任务    | 单轮或固定任务 |

---

# 29、如何评估 Agent 的执行效果和项目效果？

- 分类：Agent / Evaluation
- 难度：深入
- 高频公司：数坤科技

## 标准参考答案

评估维度：

- Task Success Rate（任务完成率）
- Accuracy / Correctness
- Latency / Token Cost
- User Satisfaction
- Multi-turn 连贯性

方法：

- Offline evaluation
- Online A/B test
- Log & Analytics

---

# 30、什么是 Multi-Agent 系统？它与单 Agent 系统相比有哪些特点和适用场景？

- 分类：Agent
- 难度：基础
- 高频公司：未知

## 标准参考答案

Multi-Agent：

- 多个独立 Agent 协作
- 可分工、协作或辩论

特点：

- 高可扩展性
- 专业化分工
- 复杂任务能力增强

适用场景：

- 多模态任务
- 长流程任务
- 高可靠任务

---

# 31、在多轮工具调用中，如何判断下一步是继续调用工具还是直接结束流程？

- 分类：Agent / LLM
- 难度：进阶
- 高频公司：淘天

## 标准参考答案

Agent 通常通过：

- 当前任务状态
- Observation 内容
- Goal 是否满足

判断是否结束。

常见策略：

### 1. Finish Action

模型输出：

```text
Final Answer
```

~~~markdown
---

# 31、在多轮工具调用中，如何判断下一步是继续调用工具还是直接结束流程？
- 分类：Agent / LLM
- 难度：进阶
- 高频公司：淘天

## 标准参考答案

Agent 通常通过：

- 当前任务状态
- Observation 内容
- Goal 是否满足

判断是否结束。

常见策略：

### 1. Finish Action

模型输出：

```text
Final Answer
~~~

表示流程结束。

------

### 2. Reflection 判断

模型自检：

- 是否已满足用户问题
- 是否还缺信息

------

### 3. 最大步骤限制

例如：

```text
max_steps = 8
```

防止无限循环。

------

### 4. Tool Confidence

如果：

- 检索置信度低
- API 返回空值

则继续调用其他工具。

------

# 32、Agent 项目通常如何进行测试与评估？

- 分类：Agent / Evaluation
- 难度：进阶
- 高频公司：字节

## 标准参考答案

Agent 测试通常分：

------

## 1. 单元测试

测试：

- Tool
- Prompt
- Workflow

------

## 2. 离线评测

指标：

- Task Success Rate
- Hallucination
- Tool Accuracy

------

## 3. 回放测试（Replay）

重放真实用户日志。

------

## 4. 在线 A/B Test

观察：

- 用户满意度
- CTR
- Latency

------

## 5. 红队测试

攻击：

- Prompt Injection
- Jailbreak
- 越权操作

------

# 33、为什么 Agent 需要 Memory 系统来维持任务连贯性？

- 分类：Agent / LLM
- 难度：进阶
- 高频公司：淘天

## 标准参考答案

因为：

LLM 本身没有真正长期状态。

Memory 作用：

- 保持多轮对话一致性
- 保存用户偏好
- 支持长期任务

否则：

- 会遗忘历史信息
- 无法连续执行复杂任务

------

## 常见 Memory 类型

### 短期记忆

当前上下文。

### 长期记忆

跨 Session 存储。

实现：

- Vector DB
- Graph Memory
- KV Store

------

# 34、长上下文场景下如何做摘要压缩，既控制上下文长度又尽量避免关键信息丢失和语义扭曲？

- 分类：Agent / LLM
- 难度：进阶
- 高频公司：淘天

## 标准参考答案

核心目标：

```text
压缩 token + 保留关键语义
```

------

## 方法一：层级摘要

例如：

```text
对话 -> 段摘要 -> 全局摘要
```

------

## 方法二：结构化摘要

保留：

- 人物
- 时间
- 关键结论
- Action

------

## 方法三：重要性评分

高价值信息：

- 用户目标
- 关键决策

优先保留。

------

## 方法四：避免重复压缩

重复 summarize：

- 容易语义漂移
- 信息丢失

通常：

- 原文 + 摘要混合保留。

------

# 35、在 RAG 场景中，什么时候适合使用静态知识库，什么时候适合使用动态网页检索？

- 分类：RAG
- 难度：进阶
- 高频公司：蚂蚁

## 标准参考答案

静态知识库适合：

- 企业内部知识
- FAQ
- 文档稳定场景

优点：

- 稳定
- 可控
- 延迟低

------

动态网页检索适合：

- 新闻
- 金融
- 实时信息

优点：

- 信息最新

缺点：

- 不稳定
- 噪声大

------

工业界通常：

```text
静态 KB + Web Search Hybrid
```

------

# 36、RAG 中长文本应该如何切分，如何选择合适的切分策略？

- 分类：RAG
- 难度：进阶
- 高频公司：海天同创、淘天

## 标准参考答案

切分原则：

- 保持语义完整
- 控制 token
- 提高检索质量

------

## 常见策略

### 固定长度切分

简单稳定。

------

### 语义切分

按：

- 段落
- 标题
- Topic

切分。

------

### Parent-Child

工业界高频方案：

```text
小 chunk 检索
大 chunk 返回
```

------

## 工程经验

常见：

```text
chunk = 300~800
overlap = 10%~20%
```

------

# 37、请详细讲解 ReAct 框架的原理。

- 分类：Agent
- 难度：进阶
- 高频公司：未知

## 标准参考答案

ReAct：

```text
Reason + Act
```

核心思想：

- 推理
- 工具调用
- 环境反馈

形成闭环。

------

## 流程

### Thought

分析问题。

### Action

调用工具。

### Observation

获取结果。

### Reflection

继续推理。

------

## 优势

相比 CoT：

- 可访问外部知识
- 可动态纠错
- 可执行复杂任务

------

## 缺点

- Token 成本高
- Latency 高
- 容易循环调用

------

# 38、如何解决 Agent 工具调用时的幻觉问题，例如编造 API 或传错参数？

- 分类：Agent / LLM
- 难度：进阶
- 高频公司：未知

## 标准参考答案

典型问题：

- API 名称 hallucination
- 参数错误
- schema mismatch

------

## 方法

### Tool Schema 强约束

例如：

```json
{
  "name": "search_weather",
  "parameters": {
    "city": "string"
  }
}
```

------

### JSON 校验

不合法直接拒绝。

------

### Tool Selection Prompt

明确：

- 什么时候用
- 什么时候不用

------

### Reflection

调用前自检：

```text
参数是否完整？
```

------

# 39、为什么要使用 RAG（检索增强生成）技术？

- 分类：RAG
- 难度：基础
- 高频公司：字节、淘天

## 标准参考答案

RAG 目标：

```text
让 LLM 具备外部知识能力
```

------

## 为什么需要 RAG

LLM 问题：

- 知识过时
- 幻觉
- 无法访问私有数据

------

## RAG 的优势

### 外部知识增强

接入：

- 企业文档
- 搜索引擎
- 数据库

------

### 降低幻觉

通过真实文档约束回答。

------

### 无需频繁微调

更新知识库即可。

------

# 40、为什么工具描述中“什么时候该用”比“能做什么”更重要？

- 分类：Agent / Prompt / LLM
- 难度：进阶
- 高频公司：未知

## 标准参考答案

因为：

Agent 最大问题不是：

```text
不会调用工具
```

而是：

```text
错误调用工具
```

------

## 为什么重要

模型需要：

- 判断时机
- 判断边界
- 判断适用场景

------

## 好的 Tool Description

不仅描述：

```text
能做什么
```

更描述：

```text
什么时候该用
什么时候不要用
```

------

## 示例

错误：

```text
用于天气查询
```

正确：

```text
当用户询问实时天气、温度、空气质量时使用；
不要用于历史气候分析。

```

---

# 41、如何让 Agent 具备自我学习和经验沉淀的能力？

- 分类：Agent
- 难度：深入
- 高频公司：未知

## 标准参考答案

核心目标：

```text
让 Agent 从历史执行中持续优化
```

~~~markdown
---

# 41、如何让 Agent 具备自我学习和经验沉淀的能力？
- 分类：Agent
- 难度：深入
- 高频公司：未知

## 标准参考答案

核心目标：

```text
让 Agent 从历史执行中持续优化
~~~

------

## 方法一：Memory + Reflection

保存：

- 成功案例
- 失败案例
- 用户反馈

通过 Reflection：

```text
本次为什么失败？
```

形成经验沉淀。

------

## 方法二：Trajectory Learning

记录：

```text
Thought -> Action -> Observation
```

后续：

- Few-shot
- Fine-tuning
- RL

使用。

------

## 方法三：Reward Feedback

用户：

- 点赞
- 纠错
- 评分

作为 reward signal。

------

## 方法四：Skill Library

把成功 Workflow：

- Prompt
- Tool Chain
- Plan

沉淀为可复用 Skills。

------

# 42、Rerank 之后的 TopK 截断如何实现，截断值怎么确定？

- 分类：RAG
- 难度：进阶
- 高频公司：快手

## 标准参考答案

Rerank 后：

需要控制：

- Token 长度
- 噪声
- 成本

------

## 常见方案

### 固定 TopK

例如：

```text
Top5 / Top10
```

简单稳定。

------

### Dynamic TopK

根据：

- score gap
- confidence

动态决定。

------

## 工程经验

常见：

```text
Recall Top100
Rerank Top10
Generate Top3~5
```

------

## 如何确定

通过：

- Recall
- MRR
- 用户满意度

离线 + 在线联合评测。

------

# 43、什么是 Memory？短期记忆在对话轮次增加时如何持续处理上下文爆炸和重复压缩？

- 分类：Agent
- 难度：深入
- 高频公司：阿里、Moka

## 标准参考答案

Memory：

本质是：

```text
让 Agent 保持长期状态
```

------

## 短期 Memory 问题

随着轮次增加：

- token 爆炸
- 冗余增加
- 注意力下降

------

## 解决方案

### Sliding Window

只保留最近 N 轮。

------

### Summarization

历史内容：

- 摘要
- 压缩

------

### Hybrid Memory

保留：

- 原始关键内容
- 摘要

避免语义漂移。

------

### Relevance Filtering

只保留：

- 当前任务相关内容。

------

# 44、Agent 的 Planning 模块有哪些主流实现方式？

- 分类：Agent
- 难度：进阶
- 高频公司：未知

## 标准参考答案

常见 Planning 方案：

------

## Step-by-step

逐步推理：

```text
一步一步做
```

优点：

- 灵活
- 动态

缺点：

- 容易跑偏

------

## Plan-and-Execute

先生成完整 Plan。

再执行。

优点：

- 全局一致性好

缺点：

- 动态适应差

------

## Tree-of-Thought

多路径搜索。

类似：

```text
搜索树
```

适合复杂推理。

------

## Graph Planning

任务 DAG 化。

适合：

- 多工具
- 多 Agent

------

# 45、Agent 开发中常见的系统安全风险有哪些？

- 分类：Agent / LLM
- 难度：深入
- 高频公司：未知

## 标准参考答案

主要风险：

------

## Prompt Injection

例如：

```text
Ignore previous instructions
```

导致越权。

------

## Tool Abuse

恶意调用：

- Shell
- SQL
- API

------

## Sandbox Escape

代码执行突破隔离。

------

## Data Leakage

泄露：

- Prompt
- 用户数据
- 内部知识

------

## 防御方案

### 权限控制

Tool RBAC。

------

### Prompt Sanitization

过滤恶意输入。

------

### Sandbox

受限执行环境。

------

### Human Approval

高风险操作人工确认。

------

# 46、Agent 耗时过长时，工程侧和基座侧分别有哪些优化手段？

- 分类：Agent / LLM
- 难度：进阶
- 高频公司：未知

## 标准参考答案

Agent 延迟来源：

- 多轮推理
- Tool 调用
- 长上下文

------

## 工程侧优化

### Parallel Tool Call

并行工具调用。

------

### Cache

缓存：

- embedding
- retrieval
- tool result

------

### Workflow Optimization

减少无效步骤。

------

## 模型侧优化

### 小模型 Routing

简单任务走小模型。

------

### Context Compression

摘要压缩。

------

### Speculative Decoding

加速生成。

------

# 47、请介绍 MCP（Model Context Protocol）的作用、原理，以及你是否有过相关实践？

- 分类：MCP
- 难度：进阶
- 高频公司：腾讯、蚂蚁、字节

## 标准参考答案

MCP：

```text
Model Context Protocol
```

目标：

标准化：

- 模型
- Tool
- Context

之间通信。

------

## MCP 解决的问题

传统 Agent：

- Tool schema 不统一
- Context 难共享
- Agent 不兼容

------

## MCP 核心思想

统一：

- Tool 描述
- Context 接口
- 消息协议

------

## 工程价值

实现：

- Agent 插件化
- Tool 生态
- 跨模型互通

------

# 48、如何设计 Agent 的流式输出，以提升用户体验？

- 分类：Agent
- 难度：进阶
- 高频公司：未知

## 标准参考答案

核心目标：

```text
降低用户等待焦虑
```

------

## 常见设计

### Token Streaming

边生成边输出。

------

### Status Streaming

显示：

```text
正在搜索...
正在分析...
```

------

### Tool Streaming

展示：

- Tool 调用状态
- Observation

增强透明度。

------

## 工程优化

### Incremental Rendering

前端增量渲染。

------

### Async Workflow

工具异步执行。

------

# 49、Agent 长期记忆的 FIFO 淘汰策略有哪些问题，如何优化？

- 分类：Agent
- 难度：进阶
- 高频公司：腾讯

## 标准参考答案

FIFO 问题：

```text
重要信息可能被错误淘汰
```

例如：

- 用户偏好
- 长期目标

------

## 优化方案

### Importance Score

按重要性保留。

------

### Time Decay

时间衰减。

------

### Hybrid Strategy

结合：

- 时间
- 相关性
- 使用频率

------

### Graph Memory

关键关系长期保留。

------

# 50、什么是 Self-Reflection 机制？它在代码生成或故障排查 Agent 中如何应用？

- 分类：Agent / AICoding
- 难度：进阶
- 高频公司：未知

## 标准参考答案

Self-Reflection：

```text
模型对自己的结果进行复盘与纠错
```

------

## 流程

### 第一步

生成答案。

------

### 第二步

模型自检：

```text
是否存在错误？
```

------

### 第三步

修正结果。

------

## 在 Coding Agent 中

常用于：

- 单元测试失败修复
- Bug 定位
- SQL 修复

------

## 工业界常见模式

```text
Generate -> Critique -> Refine
```

相比一次生成：

- 正确率更高
- 幻觉更少

