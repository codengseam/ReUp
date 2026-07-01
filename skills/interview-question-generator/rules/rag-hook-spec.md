# rag-hook-spec.md — 八股文题库 RAG 外挂接口规范

> 本文件是 `../SKILL.md` 步骤 5 的路由细则，定义八股文题的外挂检索接口契约、题库数据结构、检索策略、fallback 策略、与现有 RAG 模块的对接方式，以及题库构建规范。
> 题型分类见 `question-taxonomy.md` §6；难度见 `difficulty-grading.md`；边界见 `boundaries.md`；题库集成调优见 `../scripts/question-bank-integration.md`。

## 0. 与现有 RAG 模块的路径关系

项目 RAG 模块存在两套等价路径，对接时任选其一（shim 自动转发）：

| 路径 | 角色 | 说明 |
|------|------|------|
| `src/lib/rag/` | 兼容 re-export shim | `search.ts`/`route.ts`/`safety.ts`/`cache.ts`/`types.ts` 均为 `@deprecated` shim，`export * from '@/server/rag/...'` 转发 |
| `src/server/rag/` | 真实实现 | `search.ts`（语义/混合检索）、`route.ts`（查询路由+类别推断）、`safety.ts`（安全检查）、`cache.ts`（缓存）、`knowledge-base.ts`（知识库+rerank）、`reranker.ts`（BGE-reranker-v2-m3）、`embedder.ts`（BGE-M3 1024 维） |

本规范下文以 `src/server/rag/`（真实实现路径，与 `../SKILL.md` 一致）表述对接入口；`src/lib/rag/` 仅 search/route/safety/cache/types 五个 `@deprecated` shim 自动转发，knowledge-base/reranker/embedder 无 shim 仅存于 `src/server/rag/`。题库条目作为 `category='interview'` 的知识片段接入现有向量库，复用既有 embedder/reranker/safety/cache 基础设施，**不**另起一套检索引擎。

---

## 1. 接口契约

### 1.1 输入

```json
{
  "stack": ["Java", "Redis"],                  // 必填，技术栈数组（来自 JD 要求 ∩ 简历技术栈）
  "difficulty": "L1",                           // 必填，"L1" | "L2"（八股文以 L1-L2 为主，见 difficulty-grading.md）
  "count": 3,                                   // 必填，期望题目数量，1-5
  "tags": ["TCP", "网络"],                       // 可选，知识点标签过滤，与题库条目 tags 字段匹配
  "min_score": 0.2,                             // 可选，语义检索最低分阈值，默认 0.2
  "prefer_verified": true                       // 可选，是否优先题库已验证题，默认 true
}
```

约束：
- `difficulty` 仅接受 L1/L2（深度题归入技术深挖题，不走本接口，见 `question-taxonomy.md` §6）。
- `stack` 不得为空；为空时返回空结果 + 错误码，不触发 fallback（无技术栈锚点时 AI 生成属造题，见 `boundaries.md` §2）。
- `count > 5` 时截断为 5（八股文题不占题集主篇幅，见 `question-taxonomy.md` §6 配比）。

### 1.2 输出

```json
{
  "questions": [
    {
      "id": "qb-tcp-001",
      "question": "简述 TCP 三次握手的过程和每一步的作用。",
      "answer": "结构化答案文本（核心观点 + 展开论述 + 示例）",
      "tags": ["TCP", "网络", "三次握手"],
      "difficulty": "L1",
      "source": "八股文题库 v1",
      "verified": true,
      "score": 0.85
    }
  ],
  "verified_count": 2,
  "fallback_count": 1,
  "cache_hit": false,
  "status": "ok | partial | empty"
}
```

字段说明：
- `verified`：true = 题库命中已验证题；false = fallback AI 生成（未经题库验证）。
- `score`：检索相关性分（0-1），来自语义检索 + rerank 融合分。
- `status`：`ok` = 全部题库命中；`partial` = 部分命中部分 fallback；`empty` = 题库零命中全 fallback（须在题集置顶告警）。

---

## 2. 题库数据结构（JSON Schema）

每条题库条目须符合以下结构，`text`（用于向量化）由 `question` + `answer` 拼接，其余字段作为向量库 metadata：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "QuestionBankItem",
  "type": "object",
  "required": ["id", "question", "answer", "tags", "difficulty", "source", "category"],
  "properties": {
    "id":         { "type": "string", "description": "全局唯一，格式 qb-<技术栈>-<序号>，如 qb-tcp-001" },
    "question":   { "type": "string", "description": "题干全文" },
    "answer":     { "type": "string", "description": "结构化答案：核心观点 + 展开论述 + 代码/示例" },
    "tags":       { "type": "array", "items": { "type": "string" }, "description": "知识点标签，含技术栈与考点，如 [\"TCP\",\"网络\",\"三次握手\"]" },
    "difficulty": { "type": "string", "enum": ["L1", "L2"], "description": "难度，仅 L1/L2" },
    "source":     { "type": "string", "description": "来源，如 \"八股文题库 v1\"、\"《面试现场》\"、\"某 url\"" },
    "category":   { "type": "string", "enum": ["interview"], "description": "固定 interview，对接 RAG categoryFilter" },
    "skillName":  { "type": "string", "description": "可选，主技术栈名，对接 knowledge-base opts.skillName" },
    "verified":   { "type": "boolean", "default": true, "description": "题库条目默认 true；fallback 生成题置 false" }
  }
}
```

向量化契约：
- `text` = `question` + `\n` + `answer`，由 BGE-M3 embedder 生成 1024 维向量（与 `data/skill-vectors.json` 同维度）。
- metadata = `{ id, tags, difficulty, source, category:'interview', skillName, verified }`，供检索后过滤。
- 题库文件建议存放 `data/question-bank.json`，向量构建脚本参考 `scripts/export-vectors.mjs`（lancedb→JSON 模式）。

---

## 3. 检索策略

检索复用 `src/lib/rag/search.ts`（shim → `src/server/rag/search.ts`）的语义检索 + 标签过滤 + 难度匹配 + rerank 四步：

```
[1] 构造检索 query
    query = stack.join(" ") + " " + (tags?.join(" ") || "") + " 基础知识 面试题"
    例：stack=[Java,Redis], tags=[缓存] → "Java Redis 缓存 基础知识 面试题"

[2] 语义检索（over-fetch）
    调用 semanticSearch(query, topK=count*3, minScore, categoryFilter='interview')
    · categoryFilter='interview' 对接 search.ts 的 category 过滤
    · topK 取 count*3 做过采样，给后续过滤与 rerank 留余量
    · minScore 默认 0.2（与 search.ts 默认一致）

[3] 标签过滤 + 难度匹配（metadata 过滤）
    对 [2] 结果按 metadata 过滤：
    · difficulty == 输入 difficulty（精确匹配）
    · tags 与输入 tags 有交集（若输入给了 tags；输入未给则不过滤）
    · skillName ∈ 输入 stack（若条目带 skillName）
    过滤后若不足 count，回 [2] 放宽（降低 minScore 到 0.15 或扩大 topK 到 count*5）重检索一次

[4] Rerank 精排
    调用 rerankResults(filtered, query)（search.ts 的 LLM rerank）或
    knowledge-base 的 BGE-reranker-v2-m3（RERANK_TIMEOUT_MS=3000，超时降级 cosine 排序）
    取 Top-K=count

[5] 组装输出
    映射为 QuestionBankItem[]，verified 全置 true，score 填 rerank 分
```

检索参数默认值与调优见 `../scripts/question-bank-integration.md`。

---

## 4. Fallback 策略（题库未命中时 AI 生成）

### 4.1 触发条件

满足任一即触发 fallback：
- 步骤 [2] 语义检索零命中（`status: empty`）。
- 步骤 [3] 过滤后数量 < count，且放宽重检索后仍不足。
- 步骤 [4] rerank 后 top 分 < `min_score`（题库无高质量匹配）。

### 4.2 Fallback 执行

```
[a] 缺口计算：need = count - 已命中数
[b] AI 生成：调用 LLMClient（DashScope），prompt 见 ../prompts/interview-questions.prompt.md 八股文部分
    输入约束：stack + difficulty + tags + 数量=need
    生成题须符合 QuestionBankItem 结构，verified 置 false
[c] 标记：每条 fallback 题在 answer 末尾追加标注「（未经题库验证，AI 生成）」
[d] 组装：fallback 题与题库命中题合并，verified_count / fallback_count 分别统计
```

### 4.3 Fallback 红线

- Fallback 题仍须基于输入 `stack` 生成，**禁止**编造 stack 之外的技术栈（依据 `boundaries.md` §2 不造题）。
- `status: empty`（全 fallback）时题集须置顶告警：「本次八股文题全部由 AI 生成，未经题库验证，准确度请人工复核」。
- Fallback 题不计入 `verified_count`，置信度计算按 `boundaries.md` §6 题库命中因子降权（全 fallback 时该因子取 0.7）。
- Fallback 题生成后**不**自动回写题库（避免污染题库质量），需人工审核后走 §6 题库扩展流程入库。

---

## 5. 与现有 RAG 模块对接方式

| RAG 模块 | 文件 | 本接口对接用法 |
|---------|------|--------------|
| 语义/混合检索 | `src/lib/rag/search.ts` | `semanticSearch(query, topK, minScore, 'interview')` 做主检索；`hybridSearch` 可在标签过滤失效时备用（semanticWeight 默认 0.7） |
| 查询路由 | `src/lib/rag/route.ts` | `inferQueryCategoryViaLLM` 确认查询归 'interview' 类；本接口已知是面试题，可跳过路由直接传 `categoryFilter='interview'` |
| 安全检查 | `src/lib/rag/safety.ts` | 输出前对每条题做 `SafetyCheckResult` 检查；`safe=false` 则剔除该题并记录（防歧视/违规，见 `boundaries.md` §3） |
| 缓存 | `src/lib/rag/cache.ts` | 缓存 key = `qb:${stack.join(',')}:${difficulty}:${count}:${tags?.join(',')}`；TTL 默认与 RAG cache 一致；命中时 `cache_hit=true` 直接返回 |
| 知识库+rerank | `src/server/rag/knowledge-base.ts` | `semanticSearch(query, topK, { category:'interview', skillName })`；`skipRerank:true` 用于低延迟路径 |
| Reranker | `src/server/rag/reranker.ts` | BGE-reranker-v2-m3，250MB 懒加载，首次调用可能超时降级 |
| 类型 | `src/lib/rag/types.ts` | `RAGResult` 映射为 QuestionBankItem：`content`→`question+answer`、`docId`→`id`、`source`→`source`、`category`→固定 interview、`score`→`score` |
| Embedder | `src/server/rag/embedder.ts` | BGE-M3，1024 维，题库向量化与查询向量化共用，保证同维度 |

对接约定：
- 本接口**不**修改 RAG 模块源码，仅作为消费方调用其导出函数。
- 题库向量与 `data/skill-vectors.json`（608 chunks）共存于同一向量库，靠 `category='interview'` 区分检索域。
- 当 RAG 模块升级（如换 embedder 维度），题库向量须重新构建（见 §6）。

---

## 6. 题库构建规范（如何往题库添加新题）

### 6.1 入库流程

```
[1] 撰写题目：按 QuestionBankItem schema 写 JSON，id 全局唯一
[2] 人工审核：校验题目准确性、答案无误、tags 准确、difficulty 合理、无歧视内容
[3] 向量化：text = question + "\n" + answer → BGE-M3 embedder 生成 1024 维向量
[4] 写入：题库 JSON 追加条目 + 向量写入向量库（metadata 含 category='interview'）
[5] 标记：verified=true，source 标实际来源
[6] 验证：用该题的 question 反查 semanticSearch，确认能命中自身（score > 0.5），否则检查向量化
```

### 6.2 题目质量规范

- **可溯源**：`source` 须标真实来源（书名/课程/url/自创）；自创题须标注"自创"并经两人以上审核。
- **结构化答案**：`answer` 须含核心观点 + 展开论述 + 代码/示例，与 `answer-guidance-template.md` 变体 6 一致。
- **难度合规**：仅 L1/L2；超出 L2 的深度题不入题库，归技术深挖题。
- **标签准确**：`tags` 须含主技术栈 + 知识点，便于步骤 [3] 标签过滤命中。
- **去重**：入库前用 `semanticSearch(question, 1)` 查重，若命中已有题 score > 0.85 则判重复，不重复入库。

### 6.3 冷启动

题库初期可能覆盖不全，冷启动策略见 `../scripts/question-bank-integration.md` §4。核心原则：冷启动期 fallback 占比高属正常，每条 fallback 题经人工审核后可入库逐步提升 `verified_count`，形成"用得越多题库越全"的正循环。

---

## 7. 引用关系

- 接口契约消费 → `../SKILL.md` 步骤 5、`../prompts/interview-questions.prompt.md` 八股文生成约束
- 题库数据结构对齐 → `../rules/answer-guidance-template.md` 变体 6（八股文题模板）
- 难度限定依据 → `../rules/difficulty-grading.md`（八股文 L1-L2）
- fallback 不造题红线 → `../rules/boundaries.md` §2
- 检索调优与冷启动 → `../scripts/question-bank-integration.md`
- RAG 模块真实路径 → `src/lib/rag/`（shim）→ `src/server/rag/`（实现）
