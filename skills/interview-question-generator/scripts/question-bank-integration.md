# question-bank-integration.md — 八股文题库集成指南

> 本文件是 `../SKILL.md` 步骤 5 的工程集成指南，补充 `../rules/rag-hook-spec.md`（接口规范）的"怎么做"：对接步骤、完整 JSON Schema、检索调优参数、冷启动策略、扩展流程。
> 接口契约与数据结构定义见 `../rules/rag-hook-spec.md`；本文件侧重工程落地与调优。

## 1. 对接 RAG 题库（基于 src/lib/rag/ 现有架构）

### 1.1 路径与真实实现

| 路径 | 角色 | 关键导出 |
|------|------|---------|
| `src/lib/rag/search.ts` | shim | `semanticSearch` / `hybridSearch` / `rerankResults` / `compressContext` |
| `src/server/rag/knowledge-base.ts` | 真实实现 | `createKnowledgeBase` / `semanticSearch(query, topK, opts)` |
| `src/server/rag/reranker.ts` | 真实实现 | `rerank(query, candidates, topK)`（BGE-reranker-v2-m3） |
| `src/server/rag/embedder.ts` | 真实实现 | BGE-M3，1024 维 |
| `src/lib/rag/safety.ts` / `cache.ts` | shim | `SafetyCheckResult` / 缓存 |
| `src/server/rag/*` | 真实实现 | shim 全部 `export *` 转发至此 |

> `src/lib/rag/` 下文件均标注 `@deprecated`，但作为兼容入口仍可消费；新代码建议直接 import `src/server/rag/`。本 skill 产出物主要给 AI 消费，对接入口与 `../SKILL.md` 保持一致用 `src/lib/rag/`。

### 1.2 接入步骤

```
[1] 题库数据准备
    · 按 §2 JSON Schema 编写题库条目，存 data/question-bank.json
    · 每条 text = question + "\n" + answer，metadata 含 category='interview'

[2] 向量化
    · 用 src/server/rag/embedder.ts 的 BGE-M3 对每条 text 生成 1024 维向量
    · 与 data/skill-vectors.json（608 chunks）同维度，可共存于同一向量库
    · 向量构建脚本参考 scripts/export-vectors.mjs（lancedb→JSON 模式）

[3] 写入向量库
    · 题库向量写入向量库，metadata.category='interview' 标记检索域
    · 与现有 608 向量靠 category 区分：promotion/interview

[4] 检索对接
    · 调用 src/lib/rag/search.ts 的 semanticSearch(query, topK, minScore, 'interview')
    · categoryFilter='interview' 限定只在题库域检索，不混入晋升类知识
    · 检索策略与 fallback 见 ../rules/rag-hook-spec.md §3 §4

[5] 安全检查 + 缓存
    · 输出前过 src/lib/rag/safety.ts，剔除 safe=false 的题（防歧视/违规）
    · 缓存 key = qb:${stack}:${difficulty}:${count}:${tags}，命中直接返回

[6] 结果映射
    · RAGResult → QuestionBankItem：
      content→question+answer, docId→id, source→source, category→interview, score→score
```

---

## 2. 数据格式规范（完整 JSON Schema）

`../rules/rag-hook-spec.md` §2 已给出题库条目 schema，本节给出含向量字段的完整存储 schema（用于向量库写入）：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "QuestionBankItemWithVector",
  "type": "object",
  "required": ["id", "question", "answer", "tags", "difficulty", "source", "category", "text", "vector", "metadata"],
  "properties": {
    "id":         { "type": "string", "pattern": "^qb-[a-z0-9]+-\\d{3}$" },
    "question":   { "type": "string", "minLength": 5 },
    "answer":     { "type": "string", "minLength": 20, "description": "结构化：核心观点+展开论述+代码/示例" },
    "tags":       { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "difficulty": { "type": "string", "enum": ["L1", "L2"] },
    "source":     { "type": "string" },
    "category":   { "type": "string", "enum": ["interview"] },
    "skillName":  { "type": "string", "description": "主技术栈，对接 knowledge-base opts.skillName" },
    "verified":   { "type": "boolean", "default": true },
    "text":       { "type": "string", "description": "= question + '\\n' + answer，向量化输入" },
    "vector":     { "type": "array", "items": { "type": "number" }, "minItems": 1024, "maxItems": 1024 },
    "metadata": {
      "type": "object",
      "required": ["id", "tags", "difficulty", "source", "category"],
      "properties": {
        "id":         { "type": "string" },
        "tags":       { "type": "array", "items": { "type": "string" } },
        "difficulty": { "type": "string" },
        "source":     { "type": "string" },
        "category":   { "type": "string" },
        "skillName":  { "type": "string" },
        "verified":   { "type": "boolean" }
      }
    }
  }
}
```

索引建议（对接 vector-store）：
- 主索引：`vector`（1024 维余弦相似度，BGE-M3）。
- 过滤索引：`metadata.category`（固定 interview）、`metadata.difficulty`、`metadata.skillName`、`metadata.tags`（数组包含查询）。
- 复合检索：vector-store 已融合 dense(0.20) + keyword(0.15) + lexical(0.10) 复合分，题库复用此机制，无需另建 BM25。

---

## 3. 检索调优（Top-K、权重、rerank）

### 3.1 参数表

| 参数 | 默认值 | 调优场景 | 建议取值 |
|------|-------|---------|---------|
| `topK`（过采样） | `count * 3` | 题库小（< 50 条/技术栈）→ 扩大过采样保召回 | 题库小 `count*5`；题库大（> 200 条/技术栈）`count*2` |
| `minScore` | `0.2` | 召回少→降阈值；噪声多→提阈值 | 召回不足 `0.15`；噪声多 `0.30`；不可低于 `0.15`（防语义漂移虚高） |
| `semanticWeight` | `0.7` | 标签过滤强→降语义权重；偏语义匹配→保持 | 标签精确 `0.5`；纯语义 `0.7`；hybridSearch 备用路径用 |
| `categoryFilter` | `'interview'` | 固定，限定题库域 | 固定不变 |
| `rerank` | 开启（BGE-reranker-v2-m3） | 低延迟路径→关；质量优先→开 | 题库大必开；冷启动期小题库可 `skipRerank:true` |
| `rerank 超时` | `3000ms`（RERANK_TIMEOUT_MS） | 首次调用懒加载 250MB 模型可能超时 | 超时自动降级 cosine 排序，不阻塞 |
| `cache TTL` | 与 RAG cache 一致 | 高频相同技术栈查询→命中缓存 | 保持默认 |

### 3.2 调优原则

- **召回优先于精度**：八股文题宁可多召回再 rerank 精排，不可漏召回导致 fallback 占比虚高。故 `topK` 取 `count*3` 起步，`minScore` 不超 `0.30`。
- **标签过滤在 rerank 前**：difficulty/tags 过滤放在 semanticSearch 之后、rerank 之前，减少 rerank 输入量（rerank 是重操作，250MB 模型）。
- **fallback 是兜底不是常态**：若某技术栈持续高 fallback 占比，说明题库该技术栈覆盖不足，应触发 §5 扩展流程补题，而非长期依赖 fallback。
- **rerank 降级可接受**：BGE-reranker 首次加载超时降级到 cosine 排序，质量略降但不阻塞流程；生产环境可预热（参考 `src/server/rag/preheat.ts`）。

### 3.3 调用示例（伪代码）

```ts
import { semanticSearch, rerankResults } from '@/lib/rag/search';

async function retrieveBankQuestions(input) {
  const query = [...input.stack, ...(input.tags || []), '基础知识', '面试题'].join(' ');
  // [1] 过采样语义检索
  let candidates = await semanticSearch(query, input.count * 3, input.min_score ?? 0.2, 'interview');
  // [2] 标签 + 难度过滤
  candidates = candidates.filter(c =>
    c.difficulty === input.difficulty &&
    (!input.tags || input.tags.some(t => c.tags?.includes(t)))
  );
  // [3] 不足则放宽重检索
  if (candidates.length < input.count) {
    candidates = await semanticSearch(query, input.count * 5, 0.15, 'interview');
  }
  // [4] rerank 精排
  const reranked = await rerankResults(candidates, query);
  return reranked.slice(0, input.count); // 不足部分走 fallback
}
```

---

## 4. 题库冷启动策略

### 4.1 冷启动期特征

- 题库初期仅覆盖核心技术栈高频考点，覆盖率低。
- fallback 占比可能 50% 以上，属正常现象。
- `verified_count` 偏低，置信度的题库命中因子取 0.7（见 `../rules/boundaries.md` §6）。

### 4.2 冷启动优先覆盖清单

按"高频 + 通用"优先建库，建议首批覆盖以下技术栈的 L1-L2 高频考点（每技术栈 10-15 题）：

| 技术栈 | 高频考点方向 |
|-------|------------|
| Java | JVM 内存/GC、并发原语、集合源码 |
| MySQL | 索引、事务隔离级别、锁、explain |
| Redis | 数据结构、持久化、缓存三大问题、过期策略 |
| 计算机网络 | TCP/UDP、HTTP/HTTPS、三次握手四次挥手 |
| 操作系统 | 进程线程、内存管理、IO 模型 |
| 分布式 | CAP/BASE、一致性算法、分布式锁 |

### 4.3 冷启动正循环

```
用户查询 → RAG 检索（题库命中 + fallback 补足）
              │
              ├─ 命中题：直接用，verified=true
              └─ fallback 题：标记 verified=false，进入待审核队列
                                  │
                                  ▼
                          人工审核（见 §5）→ 入库 → verified=true
                                  │
                                  ▼
                          题库覆盖率↑ → 下次同技术栈 fallback↓
```

目标：3 个月内核心 6 技术栈 verified 覆盖率达 80% 以上，fallback 占比降到 20% 以下。

### 4.4 覆盖率指标

按技术栈统计并暴露指标，识别缺口优先补题：
- `verified_count_per_stack`：每技术栈已验证题数。
- `fallback_rate_per_stack`：每技术栈 fallback 占比（近 100 次查询）。
- `miss_query_log`：题库零命中的查询日志，用于定向补题。

---

## 5. 题库扩展流程

### 5.1 从 fallback 题入库（主要来源）

```
[1] 收集：fallback 题（AI 生成，verified=false）进入待审核队列 data/question-bank-pending.json
[2] 去重：用 semanticSearch(question, 1) 查重，与已有题 score>0.85 判重复，丢弃
[3] 人工审核：
    · 准确性：答案是否正确无误
    · 结构化：是否符合核心观点+展开+代码/示例
    · 标签准确：tags 是否含主技术栈+知识点
    · 难度合规：仅 L1/L2
    · 无歧视：过 safety 检查
[4] 向量化：text = question + "\n" + answer → BGE-M3 生成 1024 维向量
[5] 入库：题库 JSON 追加 + 向量写入向量库，metadata.category='interview'
[6] 标记：verified=true，source 标实际来源（自创题标"自创-审核人"）
[7] 验证：用该题 question 反查 semanticSearch，确认命中自身 score>0.5，否则检查向量化
[8] 更新覆盖率指标
```

### 5.2 主动补题（定向扩展）

当 §4.4 指标显示某技术栈 fallback_rate 高时，主动补题：
- 从 `miss_query_log` 提取高频未命中考点。
- 按 `../rules/answer-guidance-template.md` 变体 6 模板撰写题目。
- 走 §5.1 [3]-[8] 入库。

### 5.3 外部题源接入

- 《面试现场》《大厂晋升指南》章节文本已在 `data/book-sources/`，可被 RAG 检索命中；命中时题集 `source` 回填对应书目。
- 各大厂真实面试题集（脱敏后）可批量入库，须逐条过 §5.1 [3] 审核。
- 外部题源接入须标注 `source` 真实出处，禁止把外部题标为"自创"。

### 5.4 入库红线

- 不入库 fallback 未审核题（防污染）。
- 不入库歧视/违规题（过 safety）。
- 不入库与已有题重复题（score>0.85）。
- 不入库 L3/L4 题到八股文库（深度题归技术深挖题，见 `../rules/difficulty-grading.md`）。

---

## 6. 引用关系

- 接口契约与数据结构 → `../rules/rag-hook-spec.md`
- 检索策略与 fallback → `../rules/rag-hook-spec.md` §3 §4
- 题库条目质量规范 → `../rules/rag-hook-spec.md` §6.2
- 难度限定 → `../rules/difficulty-grading.md`（八股文 L1-L2）
- 不造题红线 → `../rules/boundaries.md` §2
- 生成流程中的 RAG 阶段 → `./generation-flow.md` 阶段 [5]
- RAG 模块路径 → `src/lib/rag/`（shim）→ `src/server/rag/`（实现）
