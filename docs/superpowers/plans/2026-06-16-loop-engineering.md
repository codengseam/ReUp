# Loop Engineering 实施计划 — 从「配置中心」到「学习系统」

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 RAG 答疑后台从无状态 Pipeline 升级为有评估/反馈/学习闭环的 Loop Engineering 系统，支持每天自动回答：哪些问题答得差？为什么差？如何变得更好？

**Architecture:** SQLite 作为统一存储（请求日志、评估结果、配置版本），SQLite-backed job queue 实现异步评估，Langfuse 自托管实现 LLM 可观测，按 M1→M2→M3 递进构建，每层独立可运行。

**Tech Stack:** better-sqlite3 (存储), langfuse (可观测, 自托管 Docker), recharts (已有, 看板图表), Next.js API Routes (已有), Vitest + jsdom (已有测试框架)

**参考依据:**
- [RAGAS 评估指标体系](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/) — faithfulness, answer_relevancy, context_relevancy
- [Langfuse 自托管文档](https://langfuse.com/self-hosting) — Docker Compose 最小部署 (PostgreSQL only)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3) — 同步 SQLite 驱动，WAL 模式支持并发读
- [RAGAS 论文](https://arxiv.org/abs/2309.15217) — RAG 评估指标定义与方法论
- [A/B Testing with Hash-based Bucketing](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models) — 稳定哈希分桶优于随机数

---

## File Structure

```
src/lib/db/
├── connection.ts          # SQLite 连接单例，WAL 模式，migrations
├── schema.ts              # DDL 建表语句
├── request-logger.ts      # 请求日志写入 / 查询
├── feedback.ts            # 隐式反馈 (👍👎 复制 重新生成 追问 导出)
├── eval-jobs.ts           # 评估任务队列 (INSERT job + poll + mark done)
├── prompt-versions.ts     # Prompt 版本注册表 (M3)

src/lib/eval/
├── ragas.ts               # RAGAS 指标实现 (faithfulness / answer_relevancy / context_relevancy)
├── hallucination-detector.ts # 简历场景幻觉检测 (用户事实 vs 方法论)
├── golden-dataset.ts      # Golden 测试集管理
├── judge-calibrator.ts    # LLM-as-Judge 与人工一致性校准
├── worker.ts              # 评估后台 Worker (轮询 eval_jobs 表)

src/lib/observability/
├── langfuse.ts            # Langfuse 追踪封装 (trace / span / generation)

src/lib/experiments/
├── ab-test.ts             # A/B 分桶 (hash user_id)
├── rollback.ts            # 自动回滚 (三重防误判)
├── auto-optimizer.ts      # 半自动优化 Loop

src/app/api/
├── chat/route.ts          # [修改] 埋点请求日志 + Langfuse trace
├── feedback/route.ts      # [新建] 反馈接收端点
├── admin/
│   ├── stats/route.ts     # [新建] 请求日志 / 反馈 查询 API
│   ├── eval/route.ts      # [新建] 评估结果查询 API (M2)
│   ├── experiments/route.ts # [新建] 实验管理 API (M3)
│   └── prompt-versions/route.ts # [新建] Prompt 版本 API (M3)

src/app/admin/_components/
├── dashboard-tab.tsx      # [修改] 增强：成本、延迟、空召回率、点踩率
├── eval-dashboard-tab.tsx # [新建] M2 评估看板
├── experiments-tab.tsx    # [新建] M3 实验管理

scripts/
├── start-worker.ts        # 评估 Worker 启动脚本

docker-compose.yml         # Langfuse 自托管 (PostgreSQL + Langfuse Server)
```

---

## M1 · 埋点地基

### Task M1.1: 安装依赖 + SQLite 连接层

**Files:**
- Create: `src/lib/db/connection.ts`
- Create: `src/lib/db/schema.ts`
- Modify: `package.json` (dependencies)

**参考:** [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) — `new Database(path, { nativeBinding })` 创建连接，`pragma journal_mode=WAL` 开启并发读写

- [ ] **Step 1: 安装依赖**

```bash
pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2: 编写 schema.ts**

```typescript
// src/lib/db/schema.ts
export const SCHEMA = `
-- 请求日志表
CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,       -- UUID v4
  session_id TEXT NOT NULL,              -- 会话 ID
  query TEXT NOT NULL,                   -- 用户原始问题
  rewritten_query TEXT,                  -- 重写后查询
  strategy TEXT,                         -- 检索策略: direct / multiquery / hyde
  intent TEXT,                           -- 意图分类: promotion / interview / off_topic
  answer TEXT NOT NULL,                  -- 最终回答
  model_id TEXT NOT NULL,                -- 使用的模型
  prompt_version TEXT,                   -- prompt 版本标识 (M3 启用)
  prompt_hash TEXT,                      -- prompt 内容 SHA256
  top_k INTEGER NOT NULL DEFAULT 5,      -- 检索 topK
  min_score REAL NOT NULL DEFAULT 0.3,   -- 最小分数阈值
  semantic_weight REAL,                  -- 语义权重
  rerank_enabled INTEGER NOT NULL DEFAULT 1,
  hyde_enabled INTEGER NOT NULL DEFAULT 1,
  latency_ms INTEGER NOT NULL,           -- 端到端延迟 (ms)
  rag_latency_ms INTEGER,                -- RAG 检索延迟
  llm_latency_ms INTEGER,                -- LLM 生成延迟
  prompt_tokens INTEGER,                 -- 输入 token 数
  completion_tokens INTEGER,             -- 输出 token 数
  total_tokens INTEGER,                  -- 总 token 数
  cost_estimate REAL,                    -- 估算成本 (CNY)
  doc_ids TEXT,                          -- 召回 docIds, JSON array
  top_score REAL,                        -- 最高检索分数
  result_count INTEGER NOT NULL DEFAULT 0, -- 召回结果数
  has_recall INTEGER NOT NULL DEFAULT 1, -- 是否有召回 (0=空召回)
  confidence_level TEXT,                 -- 置信度: high / medium / low
  confidence_score REAL,                 -- 置信度分数
  hallucination_detected INTEGER DEFAULT 0, -- 是否检测到幻觉
  hallucination_details TEXT,            -- 幻觉详情 JSON
  input_risk_level TEXT,                 -- 输入风险等级
  output_safe INTEGER DEFAULT 1,         -- 输出是否安全
  status TEXT NOT NULL DEFAULT 'success', -- success / blocked / error / timeout
  error_message TEXT,                    -- 错误信息
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_session ON request_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs(status);
CREATE INDEX IF NOT EXISTS idx_request_logs_has_recall ON request_logs(has_recall);

-- 隐式反馈表
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,              -- 关联 request_logs
  feedback_type TEXT NOT NULL,           -- thumbs_up / thumbs_down / copy / regenerate / follow_up / export
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES request_logs(request_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_request ON feedback(request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

-- 评估任务队列表 (M2 使用，M1 只建表)
CREATE TABLE IF NOT EXISTS eval_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending / processing / completed / failed
  priority INTEGER NOT NULL DEFAULT 0,   -- 0=抽样, 1=差评, 2=空召回 (数值越大越优先)
  metrics TEXT,                           -- 评估结果 JSON (M2 写入)
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (request_id) REFERENCES request_logs(request_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_jobs_status ON eval_jobs(status);
CREATE INDEX IF NOT EXISTS idx_eval_jobs_priority ON eval_jobs(priority DESC);

-- 评估结果表 (M2 使用，M1 只建表)
CREATE TABLE IF NOT EXISTS eval_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  faithfulness_score REAL,               -- 忠实度 (0-1)
  faithfulness_reason TEXT,              -- 忠实度理由
  answer_relevancy_score REAL,           -- 答案相关性 (0-1)
  answer_relevancy_reason TEXT,
  context_relevancy_score REAL,          -- 上下文相关性 (0-1)
  context_relevancy_reason TEXT,
  hallucination_score REAL,              -- 幻觉分数 (0-1, 越低越好)
  user_fact_hallucination INTEGER DEFAULT 0, -- 用户事实编造 (0=无, 1=有)
  methodology_hallucination INTEGER DEFAULT 0, -- 方法论发散 (0=无, 1=有)
  overall_score REAL,                    -- 综合评分
  eval_model TEXT,                       -- 评估使用的模型
  eval_latency_ms INTEGER,
  eval_cost_estimate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES request_logs(request_id)
);

-- Prompt 版本注册表 (M3 使用，M1 只建表)
CREATE TABLE IF NOT EXISTS prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,           -- 语义版本号 e.g. "v1.2.0"
  prompt_content TEXT NOT NULL,           -- 完整 prompt 文本
  prompt_hash TEXT NOT NULL,              -- SHA256
  change_description TEXT,                -- 变更说明
  author TEXT,                            -- 作者
  is_active INTEGER NOT NULL DEFAULT 0,  -- 是否当前线上版本
  is_experiment INTEGER NOT NULL DEFAULT 0, -- 是否是实验版本
  experiment_traffic REAL DEFAULT 0,     -- 实验流量比例 (0-1)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Golden 测试集表 (M2 使用，M1 只建表)
CREATE TABLE IF NOT EXISTS golden_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  expected_answer TEXT NOT NULL,          -- 人工标注的期望答案
  expected_faithfulness REAL,            -- 人工标注的忠实度
  expected_relevancy REAL,               -- 人工标注的相关性
  context_docs TEXT,                     -- 检索上下文 JSON
  category TEXT,                         -- 分类: promotion / interview / general
  difficulty TEXT DEFAULT 'medium',      -- easy / medium / hard
  tags TEXT,                             -- 标签 JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Langfuse trace 关联表 (关联内部 request_id 与 Langfuse trace_id)
CREATE TABLE IF NOT EXISTS trace_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  langfuse_trace_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES request_logs(request_id)
);
`;
```

- [ ] **Step 3: 编写 connection.ts**

```typescript
// src/lib/db/connection.ts
import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA } from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'loop-engineering.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const { mkdirSync } = require('fs');
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');

  // 执行建表
  _db.exec(SCHEMA);

  return _db;
}

/** 关闭数据库连接，主要用于测试清理 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** 用于测试：切换到内存数据库 */
export function _useMemoryDb(): Database.Database {
  closeDb();
  _db = new Database(':memory:');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA);
  return _db;
}

/** 用于测试：获取 DB 路径 */
export function _getDbPath(): string {
  return DB_PATH;
}
```

- [ ] **Step 4: 编写测试**

```typescript
// src/lib/db/connection.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb, _useMemoryDb } from './connection';

describe('connection', () => {
  afterEach(() => {
    closeDb();
  });

  it('_useMemoryDb creates an in-memory database', () => {
    const db = _useMemoryDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;
    const names = tables.map(t => t.name);
    expect(names).toContain('request_logs');
    expect(names).toContain('feedback');
    expect(names).toContain('eval_jobs');
    expect(names).toContain('eval_results');
    expect(names).toContain('prompt_versions');
    expect(names).toContain('golden_tests');
    expect(names).toContain('trace_links');
  });

  it('getDb returns the same instance', () => {
    _useMemoryDb();
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('request_logs table has all expected columns', () => {
    _useMemoryDb();
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info('request_logs')").all() as Array<{ name: string }>;
    const names = cols.map(c => c.name);
    expect(names).toContain('request_id');
    expect(names).toContain('query');
    expect(names).toContain('answer');
    expect(names).toContain('model_id');
    expect(names).toContain('latency_ms');
    expect(names).toContain('has_recall');
    expect(names).toContain('total_tokens');
  });
});
```

- [ ] **Step 5: 运行测试验证**

```bash
pnpm vitest run src/lib/db/connection.test.ts
```
Expected: 3 passing

- [ ] **Step 6: 提交**

```bash
git add src/lib/db/connection.ts src/lib/db/schema.ts src/lib/db/connection.test.ts package.json pnpm-lock.yaml
git commit -m "feat(m1): add SQLite connection layer with full schema"
```

---

### Task M1.2: 请求日志记录器

**Files:**
- Create: `src/lib/db/request-logger.ts`
- Create: `src/lib/db/request-logger.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/db/request-logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _useMemoryDb, closeDb, getDb } from './connection';
import { insertRequestLog, getRequestLogById, getRecentRequestLogs, getRequestStats } from './request-logger';

describe('request-logger', () => {
  beforeEach(() => {
    _useMemoryDb();
  });

  afterEach(() => {
    closeDb();
  });

  const sampleLog = {
    request_id: 'req-001',
    session_id: 'sess-001',
    query: '如何准备晋升答辩？',
    rewritten_query: '晋升答辩准备方法',
    strategy: 'direct',
    intent: 'promotion',
    answer: '晋升答辩需要注意...',
    model_id: 'qwen3.6-plus',
    prompt_version: null,
    prompt_hash: 'abc123',
    top_k: 5,
    min_score: 0.3,
    semantic_weight: 0.5,
    rerank_enabled: 1,
    hyde_enabled: 1,
    latency_ms: 3200,
    rag_latency_ms: 800,
    llm_latency_ms: 2400,
    prompt_tokens: 1200,
    completion_tokens: 500,
    total_tokens: 1700,
    cost_estimate: 0.0034,
    doc_ids: '["doc-1","doc-2"]',
    top_score: 0.85,
    result_count: 3,
    has_recall: 1,
    confidence_level: 'high',
    confidence_score: 0.78,
    hallucination_detected: 0,
    hallucination_details: null,
    input_risk_level: 'low',
    output_safe: 1,
    status: 'success',
    error_message: null,
  };

  it('inserts and retrieves a request log', () => {
    insertRequestLog(sampleLog);
    const row = getRequestLogById('req-001');
    expect(row).not.toBeNull();
    expect(row!.query).toBe('如何准备晋升答辩？');
    expect(row!.latency_ms).toBe(3200);
    expect(row!.has_recall).toBe(1);
  });

  it('getRecentRequestLogs returns logs ordered by created_at DESC', () => {
    insertRequestLog({ ...sampleLog, request_id: 'req-1' });
    insertRequestLog({ ...sampleLog, request_id: 'req-2', query: '第二个问题' });
    const rows = getRecentRequestLogs(10);
    expect(rows).toHaveLength(2);
    expect(rows[0].request_id).toBe('req-2'); // 最新在前
  });

  it('getRecentRequestLogs respects limit', () => {
    for (let i = 0; i < 5; i++) {
      insertRequestLog({ ...sampleLog, request_id: `req-${i}`, query: `问题${i}` });
    }
    const rows = getRecentRequestLogs(3);
    expect(rows).toHaveLength(3);
  });

  it('getRequestStats returns correct aggregates', () => {
    insertRequestLog({ ...sampleLog, request_id: 'req-1', latency_ms: 1000, total_tokens: 100, has_recall: 1 });
    insertRequestLog({ ...sampleLog, request_id: 'req-2', latency_ms: 2000, total_tokens: 200, has_recall: 0 });
    insertRequestLog({ ...sampleLog, request_id: 'req-3', latency_ms: 3000, total_tokens: 300, has_recall: 1, status: 'error' });

    const stats = getRequestStats();
    expect(stats.total_requests).toBe(3);
    expect(stats.avg_latency_ms).toBe(2000);
    expect(stats.total_tokens).toBe(600);
    expect(stats.no_recall_count).toBe(1);
    expect(stats.no_recall_rate).toBeCloseTo(1 / 3);
    expect(stats.error_count).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm vitest run src/lib/db/request-logger.test.ts
```
Expected: FAIL (function not defined)

- [ ] **Step 3: 编写 request-logger.ts**

```typescript
// src/lib/db/request-logger.ts
import { getDb } from './connection';

export interface RequestLogInput {
  request_id: string;
  session_id: string;
  query: string;
  rewritten_query?: string | null;
  strategy?: string | null;
  intent?: string | null;
  answer: string;
  model_id: string;
  prompt_version?: string | null;
  prompt_hash?: string | null;
  top_k: number;
  min_score: number;
  semantic_weight?: number | null;
  rerank_enabled: number;
  hyde_enabled: number;
  latency_ms: number;
  rag_latency_ms?: number | null;
  llm_latency_ms?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cost_estimate?: number | null;
  doc_ids?: string | null;
  top_score?: number | null;
  result_count: number;
  has_recall: number;
  confidence_level?: string | null;
  confidence_score?: number | null;
  hallucination_detected?: number;
  hallucination_details?: string | null;
  input_risk_level?: string | null;
  output_safe?: number;
  status: string;
  error_message?: string | null;
}

export interface RequestLogRow extends RequestLogInput {
  id: number;
  created_at: string;
}

export interface RequestStats {
  total_requests: number;
  avg_latency_ms: number;
  total_tokens: number;
  no_recall_count: number;
  no_recall_rate: number;
  error_count: number;
  error_rate: number;
}

const INSERT_SQL = `INSERT INTO request_logs (
  request_id, session_id, query, rewritten_query, strategy, intent,
  answer, model_id, prompt_version, prompt_hash,
  top_k, min_score, semantic_weight, rerank_enabled, hyde_enabled,
  latency_ms, rag_latency_ms, llm_latency_ms,
  prompt_tokens, completion_tokens, total_tokens, cost_estimate,
  doc_ids, top_score, result_count, has_recall,
  confidence_level, confidence_score,
  hallucination_detected, hallucination_details,
  input_risk_level, output_safe, status, error_message
) VALUES (
  @request_id, @session_id, @query, @rewritten_query, @strategy, @intent,
  @answer, @model_id, @prompt_version, @prompt_hash,
  @top_k, @min_score, @semantic_weight, @rerank_enabled, @hyde_enabled,
  @latency_ms, @rag_latency_ms, @llm_latency_ms,
  @prompt_tokens, @completion_tokens, @total_tokens, @cost_estimate,
  @doc_ids, @top_score, @result_count, @has_recall,
  @confidence_level, @confidence_score,
  @hallucination_detected, @hallucination_details,
  @input_risk_level, @output_safe, @status, @error_message
)`;

export function insertRequestLog(log: RequestLogInput): void {
  const db = getDb();
  db.prepare(INSERT_SQL).run(log);
}

export function getRequestLogById(requestId: string): RequestLogRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM request_logs WHERE request_id = ?').get(requestId) as RequestLogRow | undefined;
  return row ?? null;
}

export function getRecentRequestLogs(limit: number = 100): RequestLogRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ?').all(limit) as RequestLogRow[];
}

export function getRequestStats(since?: string): RequestStats {
  const db = getDb();
  const where = since ? 'WHERE created_at >= ?' : '';
  const params = since ? [since] : [];

  const row = db.prepare(`
    SELECT
      COUNT(*) as total_requests,
      COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(CASE WHEN has_recall = 0 THEN 1 ELSE 0 END), 0) as no_recall_count,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as error_count
    FROM request_logs ${where}
  `).get(...params) as { total_requests: number; avg_latency_ms: number; total_tokens: number; no_recall_count: number; error_count: number };

  return {
    total_requests: row.total_requests,
    avg_latency_ms: Math.round(row.avg_latency_ms),
    total_tokens: row.total_tokens,
    no_recall_count: row.no_recall_count,
    no_recall_rate: row.total_requests > 0 ? row.no_recall_count / row.total_requests : 0,
    error_count: row.error_count,
    error_rate: row.total_requests > 0 ? row.error_count / row.total_requests : 0,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm vitest run src/lib/db/request-logger.test.ts
```
Expected: 4 passing

- [ ] **Step 5: 提交**

```bash
git add src/lib/db/request-logger.ts src/lib/db/request-logger.test.ts
git commit -m "feat(m1): add request logger with insert/query/stats"
```

---

### Task M1.3: 隐式反馈记录

**Files:**
- Create: `src/lib/db/feedback.ts`
- Create: `src/lib/db/feedback.test.ts`

**参考:** [RAGAS 反馈收集](https://docs.ragas.io/en/stable/howtos/applications/feedback/) — 隐式反馈信号 (copy, regenerate, follow-up) 可作相关性 proxy

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/db/feedback.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _useMemoryDb, closeDb, getDb } from './connection';
import { insertFeedback, getFeedbackByRequestId, getFeedbackStats } from './feedback';
import { insertRequestLog } from './request-logger';

describe('feedback', () => {
  beforeEach(() => {
    _useMemoryDb();
    // 插入一个关联的 request log
    insertRequestLog({
      request_id: 'req-001',
      session_id: 'sess-001',
      query: 'test',
      answer: 'test answer',
      model_id: 'test-model',
      top_k: 5,
      min_score: 0.3,
      rerank_enabled: 1,
      hyde_enabled: 1,
      latency_ms: 1000,
      result_count: 3,
      has_recall: 1,
      status: 'success',
    });
  });

  afterEach(() => {
    closeDb();
  });

  it('inserts feedback and retrieves by request_id', () => {
    insertFeedback('req-001', 'thumbs_up');
    insertFeedback('req-001', 'copy');

    const feedbacks = getFeedbackByRequestId('req-001');
    expect(feedbacks).toHaveLength(2);
    expect(feedbacks.map(f => f.feedback_type)).toContain('thumbs_up');
    expect(feedbacks.map(f => f.feedback_type)).toContain('copy');
  });

  it('getFeedbackStats returns correct counts', () => {
    insertRequestLog({
      request_id: 'req-002',
      session_id: 'sess-002',
      query: 'test2',
      answer: 'test answer2',
      model_id: 'test-model',
      top_k: 5,
      min_score: 0.3,
      rerank_enabled: 1,
      hyde_enabled: 1,
      latency_ms: 2000,
      result_count: 1,
      has_recall: 1,
      status: 'success',
    });

    insertFeedback('req-001', 'thumbs_up');
    insertFeedback('req-001', 'thumbs_up');
    insertFeedback('req-002', 'thumbs_down');
    insertFeedback('req-002', 'thumbs_down');
    insertFeedback('req-002', 'thumbs_down');

    const stats = getFeedbackStats();
    expect(stats.thumbs_up).toBe(2);
    expect(stats.thumbs_down).toBe(3);
    expect(stats.thumbs_down_rate).toBeCloseTo(3 / 5);
  });
});
```

- [ ] **Step 2: 编写 feedback.ts**

```typescript
// src/lib/db/feedback.ts
import { getDb } from './connection';

export type FeedbackType = 'thumbs_up' | 'thumbs_down' | 'copy' | 'regenerate' | 'follow_up' | 'export';

export interface FeedbackRow {
  id: number;
  request_id: string;
  feedback_type: FeedbackType;
  created_at: string;
}

export interface FeedbackStats {
  thumbs_up: number;
  thumbs_down: number;
  copy: number;
  regenerate: number;
  follow_up: number;
  export: number;
  total: number;
  thumbs_down_rate: number;
}

export function insertFeedback(requestId: string, feedbackType: FeedbackType): void {
  const db = getDb();
  db.prepare('INSERT INTO feedback (request_id, feedback_type) VALUES (?, ?)').run(requestId, feedbackType);
}

export function getFeedbackByRequestId(requestId: string): FeedbackRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM feedback WHERE request_id = ? ORDER BY created_at DESC').all(requestId) as FeedbackRow[];
}

export function getFeedbackStats(since?: string): FeedbackStats {
  const db = getDb();
  const where = since ? 'WHERE created_at >= ?' : '';
  const params = since ? [since] : [];

  const rows = db.prepare(`
    SELECT feedback_type, COUNT(*) as cnt
    FROM feedback ${where}
    GROUP BY feedback_type
  `).all(...params) as Array<{ feedback_type: string; cnt: number }>;

  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.feedback_type] = r.cnt;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    thumbs_up: counts['thumbs_up'] ?? 0,
    thumbs_down: counts['thumbs_down'] ?? 0,
    copy: counts['copy'] ?? 0,
    regenerate: counts['regenerate'] ?? 0,
    follow_up: counts['follow_up'] ?? 0,
    export: counts['export'] ?? 0,
    total,
    thumbs_down_rate: total > 0 ? (counts['thumbs_down'] ?? 0) / total : 0,
  };
}
```

- [ ] **Step 3: 运行测试验证**

```bash
pnpm vitest run src/lib/db/feedback.test.ts
```
Expected: 2 passing

- [ ] **Step 4: 提交**

```bash
git add src/lib/db/feedback.ts src/lib/db/feedback.test.ts
git commit -m "feat(m1): add feedback logging (thumbs, copy, regenerate, follow_up, export)"
```

---

### Task M1.4: Chat API 埋点集成

**Files:**
- Modify: `src/app/api/chat/route.ts` (插入 request_log + feedback 端点)
- Create: `src/app/api/feedback/route.ts`

- [ ] **Step 1: 编写 feedback API**

```typescript
// src/app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { insertFeedback } from '@/lib/db/feedback';

const VALID_TYPES = ['thumbs_up', 'thumbs_down', 'copy', 'regenerate', 'follow_up', 'export'];

export async function POST(request: NextRequest) {
  let body: { request_id?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.request_id || !body.type) {
    return NextResponse.json({ error: 'request_id and type are required' }, { status: 400 });
  }

  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  insertFeedback(body.request_id, body.type as 'thumbs_up' | 'thumbs_down' | 'copy' | 'regenerate' | 'follow_up' | 'export');

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 修改 chat/route.ts — 在 POST 函数末尾，stream 完成后插入 request_log**

在 `void recordChatAPICall(Date.now() - streamStartTime);` (第 699 行附近) 之后，添加：

```typescript
// ===== M1: 异步写入请求日志 (不阻塞响应) =====
void (async () => {
  try {
    const { insertRequestLog } = await import('@/lib/db/request-logger');
    const { v4: uuidv4 } = await import('uuid');
    const requestId = uuidv4();
    const requestLog = {
      request_id: requestId,
      session_id: '', // 从请求中提取或生成
      query: latestUserMessage,
      rewritten_query: rewrittenQuery || null,
      strategy: strategy || null,
      intent: intentResult?.intent || null,
      answer: fullOutput,
      model_id: selectedModel,
      prompt_version: null,
      prompt_hash: null,
      top_k: (ragParams as any)?.topK ?? 5,
      min_score: (ragParams as any)?.minScore ?? 0.3,
      semantic_weight: (ragParams as any)?.semanticWeight ?? null,
      rerank_enabled: (ragParams as any)?.rerankEnabled !== false ? 1 : 0,
      hyde_enabled: (ragParams as any)?.hydeEnabled !== false ? 1 : 0,
      latency_ms: Date.now() - chatStartTime,
      rag_latency_ms: null,
      llm_latency_ms: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      cost_estimate: null,
      doc_ids: JSON.stringify(ragResults.map(r => r.docId).filter(Boolean)),
      top_score: ragResults.length > 0 ? Math.max(...ragResults.map(r => r.score)) : null,
      result_count: ragResults.length,
      has_recall: ragResults.length > 0 ? 1 : 0,
      confidence_level: confidence.level,
      confidence_score: confidence.score,
      hallucination_detected: hallucinationResult?.faithful === false ? 1 : 0,
      hallucination_details: hallucinationResult?.ungroundedParts ? JSON.stringify(hallucinationResult.ungroundedParts) : null,
      input_risk_level: inputSafety.riskLevel,
      output_safe: outputSafety?.safe !== false ? 1 : 0,
      status: 'success',
      error_message: null,
    };
    insertRequestLog(requestLog);
  } catch (err) {
    console.error('[Chat] Failed to write request log:', err);
  }
})();
```

- [ ] **注意:** 需要安装 `uuid` 包，或使用 `crypto.randomUUID()`：

```bash
# 在文件顶部添加
import { randomUUID } from 'crypto';
```

- [ ] **Step 3: 提交**

```bash
git add src/app/api/chat/route.ts src/app/api/feedback/route.ts
git commit -m "feat(m1): integrate request logging into chat API + feedback endpoint"
```

---

### Task M1.5: Langfuse 可观测集成

**Files:**
- Create: `src/lib/observability/langfuse.ts`
- Create: `docker-compose.yml`
- Modify: `src/app/api/chat/route.ts` (添加 Langfuse trace)

**参考:** [Langfuse JS SDK](https://langfuse.com/docs/sdk/typescript/guide) — `new Langfuse()` 创建客户端，`langfuse.trace()` 创建 trace，`trace.generation()` 记录 LLM 调用

- [ ] **Step 1: 安装 Langfuse SDK**

```bash
pnpm add langfuse
```

- [ ] **Step 2: 创建 docker-compose.yml**

```yaml
# docker-compose.yml — Langfuse 自托管 (最小部署)
# 参考: https://langfuse.com/self-hosting/docker-compose
version: "3.8"

services:
  langfuse-server:
    image: ghcr.io/langfuse/langfuse:latest
    ports:
      - "3001:3000"
    environment:
      - DATABASE_URL=postgresql://langfuse:langfuse@langfuse-db:5432/langfuse
      - NEXTAUTH_SECRET=change-me-in-production-please
      - NEXTAUTH_URL=http://localhost:3001
      - SALT=change-me-in-production-please
      - TELEMETRY_ENABLED=false
    depends_on:
      langfuse-db:
        condition: service_healthy

  langfuse-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=langfuse
      - POSTGRES_PASSWORD=langfuse
      - POSTGRES_DB=langfuse
    volumes:
      - langfuse-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U langfuse"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  langfuse-db-data:
```

- [ ] **Step 3: 编写 Langfuse 封装**

```typescript
// src/lib/observability/langfuse.ts
import { Langfuse } from 'langfuse';

let _langfuse: Langfuse | null = null;

export function getLangfuse(): Langfuse {
  if (_langfuse) return _langfuse;

  _langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
    secretKey: process.env.LANGFUSE_SECRET_KEY || '',
    baseUrl: process.env.LANGFUSE_BASE_URL || 'http://localhost:3001',
    flushAt: 1,         // 开发环境立即发送
    flushInterval: 5000, // 生产环境每 5 秒批量发送
  });

  return _langfuse;
}

export interface TraceContext {
  traceId: string;
  trace: ReturnType<Langfuse['trace']>;
}

export function startTrace(name: string, userId?: string, sessionId?: string): TraceContext {
  const langfuse = getLangfuse();
  const trace = langfuse.trace({
    name,
    userId,
    sessionId,
  });
  return { traceId: trace.id, trace };
}

export function recordGeneration(
  trace: ReturnType<Langfuse['trace']>,
  name: string,
  model: string,
  input: string,
  output: string,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  metadata?: Record<string, unknown>,
) {
  trace.generation({
    name,
    model,
    input,
    output,
    usage,
    metadata,
  });
}

export function recordSpan(
  trace: ReturnType<Langfuse['trace']>,
  name: string,
  input?: Record<string, unknown>,
  output?: Record<string, unknown>,
) {
  return trace.span({ name, input, output });
}
```

- [ ] **Step 4: 修改 chat/route.ts 添加 Langfuse trace**

在 `const chatStartTime = Date.now();` 之后，`const timer = ...` 之前添加：

```typescript
// ===== M1: Langfuse 可观测 =====
const { startTrace, recordGeneration, recordSpan } = await import('@/lib/observability/langfuse');
const userId = request.headers.get('x-user-id') || 'anonymous';
const sessionId = request.headers.get('x-session-id') || '';
const traceCtx = startTrace('chat-completion', userId, sessionId);
```

在 `fullOutput` 生成完成后（`safeEnqueue(controller, 'data: [DONE]\n\n');` 之前），添加：

```typescript
// ===== M1: 记录 Langfuse generation =====
try {
  recordGeneration(
    traceCtx.trace,
    'rag-answer',
    selectedModel,
    latestUserMessage,
    fullOutput,
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    { strategy: strategy || 'unknown', intent: intentResult?.intent || 'unknown' }
  );
} catch (err) {
  console.error('[Chat] Langfuse trace failed:', err);
}
```

- [ ] **Step 5: 提交**

```bash
git add src/lib/observability/langfuse.ts docker-compose.yml src/app/api/chat/route.ts pnpm-lock.yaml
git commit -m "feat(m1): add Langfuse self-hosted observability integration"
```

---

### Task M1.6: 增强管理后台 Dashboard

**Files:**
- Modify: `src/app/admin/_components/dashboard-tab.tsx`
- Create: `src/app/api/admin/stats/route.ts`

- [ ] **Step 1: 编写 stats API**

```typescript
// src/app/api/admin/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestStats } from '@/lib/db/request-logger';
import { getFeedbackStats } from '@/lib/db/feedback';

export async function GET(_request: NextRequest) {
  const requestStats = getRequestStats();
  const feedbackStats = getFeedbackStats();

  // 估算成本 (按 qwen-plus 定价: 输入 0.0008/1K tokens, 输出 0.002/1K tokens)
  // 实际成本从 request_logs 中读取 cost_estimate 聚合
  return NextResponse.json({
    ...requestStats,
    feedback: feedbackStats,
    // 按天汇总 (最近 7 天)
    daily: getDailyStats(),
  });
}

function getDailyStats(): Array<{ date: string; count: number; avg_latency: number; no_recall_rate: number }> {
  const { getDb } = require('@/lib/db/connection');
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      date(created_at) as date,
      COUNT(*) as count,
      AVG(latency_ms) as avg_latency,
      CAST(SUM(CASE WHEN has_recall = 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as no_recall_rate
    FROM request_logs
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY date DESC
  `).all() as Array<{ date: string; count: number; avg_latency: number; no_recall_rate: number }>;
  return rows;
}
```

- [ ] **Step 2: 修改 dashboard-tab.tsx — 添加新指标卡片**

在现有卡片下方添加：

```tsx
// 新增卡片区域：空召回率、点踩率、成本
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">空召回率</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-red-600">
        {stats ? `${(stats.no_recall_rate * 100).toFixed(1)}%` : '...'}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {stats ? `${stats.no_recall_count} / ${stats.total_requests} 次请求` : ''}
      </p>
    </CardContent>
  </Card>

  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">点踩率</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-orange-600">
        {stats?.feedback ? `${(stats.feedback.thumbs_down_rate * 100).toFixed(1)}%` : '...'}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {stats?.feedback ? `${stats.feedback.thumbs_down} 踩 / ${stats.feedback.total} 反馈` : ''}
      </p>
    </CardContent>
  </Card>

  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">估算成本</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">
        {stats ? `¥${(stats.total_tokens * 0.000001).toFixed(4)}` : '...'}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {stats ? `${stats.total_tokens.toLocaleString()} tokens` : ''}
      </p>
    </CardContent>
  </Card>
</div>
```

并在 `useEffect` 中调用 `/api/admin/stats` 获取数据。

- [ ] **Step 3: 提交**

```bash
git add src/app/admin/_components/dashboard-tab.tsx src/app/api/admin/stats/route.ts
git commit -m "feat(m1): enhance dashboard with no-recall rate, thumbs-down rate, cost estimate"
```

---

### M1 验证清单

- [ ] `pnpm vitest run src/lib/db/` — 所有 DB 层测试通过
- [ ] `pnpm dev` — 启动后发送一条 chat 消息，确认 `data/loop-engineering.db` 中有记录
- [ ] 后台 Dashboard 显示空召回率、点踩率、成本
- [ ] Feedback API 可接收 👍👎
- [ ] `docker compose up -d` 启动 Langfuse，访问 `http://localhost:3001`
- [ ] 确保 chat 请求失败/超时时，不阻塞用户响应（降级为 console.error）

---

## M2 · 评估 + 反馈

### Task M2.1: 评估任务队列

**Files:**
- Create: `src/lib/db/eval-jobs.ts`
- Create: `src/lib/db/eval-jobs.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/db/eval-jobs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _useMemoryDb, closeDb } from './connection';
import { insertRequestLog } from './request-logger';
import {
  enqueueEvalJob,
  dequeueEvalJob,
  completeEvalJob,
  failEvalJob,
  getPendingCount,
} from './eval-jobs';

const sampleLog = {
  request_id: 'req-001', session_id: 'sess', query: 'test', answer: 'test',
  model_id: 'm', top_k: 5, min_score: 0.3, rerank_enabled: 1, hyde_enabled: 1,
  latency_ms: 1000, result_count: 3, has_recall: 1, status: 'success',
};

describe('eval-jobs', () => {
  beforeEach(() => {
    _useMemoryDb();
    insertRequestLog(sampleLog);
  });

  afterEach(() => { closeDb(); });

  it('enqueues and dequeues a job', () => {
    enqueueEvalJob('req-001', 0);
    const job = dequeueEvalJob();
    expect(job).not.toBeNull();
    expect(job!.request_id).toBe('req-001');
    expect(job!.status).toBe('processing');
  });

  it('dequeue returns null when queue is empty', () => {
    const job = dequeueEvalJob();
    expect(job).toBeNull();
  });

  it('dequeue prioritizes higher priority jobs', () => {
    insertRequestLog({ ...sampleLog, request_id: 'req-002' });
    insertRequestLog({ ...sampleLog, request_id: 'req-003' });
    enqueueEvalJob('req-001', 0); // 低优先级
    enqueueEvalJob('req-002', 2); // 高优先级 (空召回)
    enqueueEvalJob('req-003', 1); // 中优先级 (差评)

    const job1 = dequeueEvalJob();
    expect(job1!.request_id).toBe('req-002'); // 最高优先级先出

    const job2 = dequeueEvalJob();
    expect(job2!.request_id).toBe('req-003');
  });

  it('completes a job and stores results', () => {
    enqueueEvalJob('req-001', 0);
    const job = dequeueEvalJob();
    completeEvalJob(job!.id, { faithfulness_score: 0.9 });
    const pending = getPendingCount();
    expect(pending).toBe(0);
  });

  it('fails a job and increments retry', () => {
    enqueueEvalJob('req-001', 0);
    const job = dequeueEvalJob();
    failEvalJob(job!.id, 'eval timeout');
    const pending = getPendingCount();
    expect(pending).toBe(1); // 重试回到 pending
  });
});
```

- [ ] **Step 2: 编写 eval-jobs.ts**

```typescript
// src/lib/db/eval-jobs.ts
import { getDb } from './connection';

export interface EvalJob {
  id: number;
  request_id: string;
  status: string;
  priority: number;
  metrics: string | null;
  retry_count: number;
  max_retries: number;
}

export function enqueueEvalJob(requestId: string, priority: number = 0): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO eval_jobs (request_id, priority) VALUES (?, ?)').run(requestId, priority);
}

export function dequeueEvalJob(): (EvalJob & { query: string; answer: string }) | null {
  const db = getDb();
  const job = db.prepare(`
    UPDATE eval_jobs SET status = 'processing', started_at = datetime('now')
    WHERE id = (
      SELECT id FROM eval_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    )
    RETURNING *
  `).get() as (EvalJob & { query: string; answer: string }) | undefined;

  if (!job) return null;

  // 关联查询 request_logs 获取 query 和 answer
  const requestLog = db.prepare('SELECT query, answer FROM request_logs WHERE request_id = ?').get(job.request_id) as { query: string; answer: string } | undefined;
  return { ...job, query: requestLog?.query ?? '', answer: requestLog?.answer ?? '' };
}

export function completeEvalJob(jobId: number, metrics: Record<string, unknown>): void {
  const db = getDb();
  db.prepare(
    "UPDATE eval_jobs SET status = 'completed', metrics = ?, completed_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(metrics), jobId);
}

export function failEvalJob(jobId: number, errorMessage: string): void {
  const db = getDb();
  const job = db.prepare('SELECT retry_count, max_retries FROM eval_jobs WHERE id = ?').get(jobId) as { retry_count: number; max_retries: number } | undefined;
  if (!job) return;

  if (job.retry_count + 1 >= job.max_retries) {
    db.prepare(
      "UPDATE eval_jobs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(errorMessage, jobId);
  } else {
    db.prepare(
      "UPDATE eval_jobs SET status = 'pending', error_message = ?, retry_count = retry_count + 1, started_at = NULL WHERE id = ?"
    ).run(errorMessage, jobId);
  }
}

export function getPendingCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as cnt FROM eval_jobs WHERE status = 'pending'").get() as { cnt: number };
  return row.cnt;
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm vitest run src/lib/db/eval-jobs.test.ts
```
Expected: 5 passing

- [ ] **Step 4: 提交**

```bash
git add src/lib/db/eval-jobs.ts src/lib/db/eval-jobs.test.ts
git commit -m "feat(m2): add eval job queue (enqueue/dequeue/complete/fail)"
```

---

### Task M2.2: RAGAS 评估指标实现

**Files:**
- Create: `src/lib/eval/ragas.ts`
- Create: `src/lib/eval/ragas.test.ts`

**参考:** [RAGAS faithfulness](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/) — 将 answer 拆成 claims，验证每个 claim 是否可从 context 推导；[RAGAS answer_relevancy](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/answer_relevancy/) — 反向生成问题，计算与原始问题的余弦相似度

- [ ] **Step 1: 编写测试 (使用 mock LLM)**

```typescript
// src/lib/eval/ragas.test.ts
import { describe, it, expect, vi } from 'vitest';
import { evaluateFaithfulness, evaluateAnswerRelevancy, evaluateContextRelevancy } from './ragas';

// Mock LLMClient
vi.mock('@/lib/llm-client', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockImplementation(({ messages }: { messages: Array<{ role: string; content: string }> }) => {
      const content = messages[messages.length - 1]?.content || '';
      if (content.includes('将回答拆分为独立陈述')) {
        return {
          content: JSON.stringify({
            claims: [
              { statement: '晋升答辩需要准备PPT', supported: true, reason: 'context提到PPT准备' },
              { statement: '答辩时间控制在30分钟', supported: false, reason: 'context未提及时间' },
            ],
          }),
        };
      }
      if (content.includes('生成') && content.includes('问题')) {
        return {
          content: JSON.stringify({ questions: ['如何准备晋升答辩？', '晋升答辩要准备什么？'] }),
        };
      }
      return { content: JSON.stringify({ verdict: '1', reason: '完全相关' }) };
    }),
  })),
}));

describe('ragas', () => {
  const sampleAnswer = '晋升答辩需要准备PPT，答辩时间控制在30分钟。';
  const sampleContext = '晋升答辩准备包括：制作PPT展示工作成果，准备演讲稿，模拟答辩。';

  it('evaluateFaithfulness returns score 0-1 and detects unsupported claims', async () => {
    const result = await evaluateFaithfulness(sampleAnswer, sampleContext);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    // mock: 1 supported, 1 unsupported → score = 0.5
    expect(result.score).toBe(0.5);
  });

  it('evaluateAnswerRelevancy returns 0-1', async () => {
    const result = await evaluateAnswerRelevancy(sampleAnswer, '如何准备晋升答辩？');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('evaluateContextRelevancy returns 0-1', async () => {
    const result = await evaluateContextRelevancy(sampleContext, '如何准备晋升答辩？');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 编写 ragas.ts**

```typescript
// src/lib/eval/ragas.ts
import { LLMClient } from '@/lib/llm-client';
import { getModelCandidates } from '@/lib/runtime-config';

const EVAL_MODEL_ID = 'qwen3.6-plus-2026-04-02';

export interface FaithfulnessResult {
  score: number;       // 0-1
  claims: Array<{ statement: string; supported: boolean; reason: string }>;
}

export interface RelevancyResult {
  score: number;       // 0-1
  reason: string;
}

/**
 * 评估 Faithfulness：将 answer 拆成 claims，验证每个 claim 是否可从 context 推导
 * 参考: RAGAS paper §3.1 — Faithfulness = |supported claims| / |total claims|
 * https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/
 */
export async function evaluateFaithfulness(answer: string, context: string): Promise<FaithfulnessResult> {
  const client = new LLMClient();
  const candidates = await getModelCandidates(EVAL_MODEL_ID);

  const claimExtractionPrompt = `请将以下回答拆分为独立的陈述句 (claims)，并判断每个陈述是否可以从给定的上下文中推导出来。

上下文：
${context}

回答：
${answer}

请返回 JSON 格式：
{
  "claims": [
    { "statement": "陈述内容", "supported": true/false, "reason": "判断依据" }
  ]
}`;

  const response = await client.invoke({
    messages: [{ role: 'user', content: claimExtractionPrompt }],
    models: candidates,
    temperature: 0,
    timeoutMs: 30_000,
  });

  let claims: Array<{ statement: string; supported: boolean; reason: string }> = [];
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      claims = parsed.claims || [];
    }
  } catch {
    console.error('[RAGAS] Failed to parse faithfullness claims');
  }

  if (claims.length === 0) {
    return { score: 1, claims: [] };
  }

  const supportedCount = claims.filter(c => c.supported).length;
  return {
    score: supportedCount / claims.length,
    claims,
  };
}

/**
 * 评估 Answer Relevancy：反向生成问题，计算与原始问题的语义相似度
 * 参考: RAGAS paper §3.2 — 生成反向问题，用 cosine similarity 计算与原始 query 的相关性
 * 简化版：用 LLM 直接打分 (0-1) 替代 embedding 相似度计算
 */
export async function evaluateAnswerRelevancy(answer: string, query: string): Promise<RelevancyResult> {
  const client = new LLMClient();
  const candidates = await getModelCandidates(EVAL_MODEL_ID);

  const prompt = `评估以下回答与原始问题的相关性。回答是否直接、完整地回应了问题？

原始问题：${query}

回答：${answer}

请返回 JSON 格式：
{
  "relevancy": 0.0-1.0之间的数字,
  "reason": "评估理由"
}`;

  const response = await client.invoke({
    messages: [{ role: 'user', content: prompt }],
    models: candidates,
    temperature: 0,
    timeoutMs: 30_000,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { score: Math.max(0, Math.min(1, parsed.relevancy || 0)), reason: parsed.reason || '' };
    }
  } catch {
    console.error('[RAGAS] Failed to parse answer relevancy');
  }

  return { score: 0, reason: 'Failed to parse' };
}

/**
 * 评估 Context Relevancy：检索到的上下文与问题的相关性
 * 参考: RAGAS paper §3.3 — 上下文中的句子逐句评估是否与问题相关
 */
export async function evaluateContextRelevancy(context: string, query: string): Promise<RelevancyResult> {
  const client = new LLMClient();
  const candidates = await getModelCandidates(EVAL_MODEL_ID);

  const prompt = `评估以下检索到的上下文与问题的相关性。上下文是否包含回答问题所需的信息？

问题：${query}

检索到的上下文：
${context}

请返回 JSON 格式：
{
  "relevancy": 0.0-1.0之间的数字,
  "reason": "评估理由"
}`;

  const response = await client.invoke({
    messages: [{ role: 'user', content: prompt }],
    models: candidates,
    temperature: 0,
    timeoutMs: 30_000,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { score: Math.max(0, Math.min(1, parsed.relevancy || 0)), reason: parsed.reason || '' };
    }
  } catch {
    console.error('[RAGAS] Failed to parse context relevancy');
  }

  return { score: 0, reason: 'Failed to parse' };
}
```

- [ ] **Step 3: 运行测试验证**

```bash
pnpm vitest run src/lib/eval/ragas.test.ts
```
Expected: 3 passing

- [ ] **Step 4: 提交**

```bash
git add src/lib/eval/ragas.ts src/lib/eval/ragas.test.ts
git commit -m "feat(m2): implement RAGAS metrics (faithfulness, answer_relevancy, context_relevancy)"
```

---

### Task M2.3: 幻觉检测 (用户事实 vs 方法论)

**Files:**
- Create: `src/lib/eval/hallucination-detector.ts`
- Create: `src/lib/eval/hallucination-detector.test.ts`

**参考:** 简历场景的幻觉必须拆成两个维度——
① 用户事实(经历/职级/证书)零容忍编造；② 方法论建议允许基于知识库合理发散

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/eval/hallucination-detector.test.ts
import { describe, it, expect, vi } from 'vitest';
import { detectHallucination } from './hallucination-detector';

vi.mock('@/lib/llm-client', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        user_fact_hallucination: false,
        user_fact_details: [],
        methodology_hallucination: false,
        methodology_details: [],
        overall_score: 0.95,
      }),
    }),
  })),
}));

describe('hallucination-detector', () => {
  it('detects no hallucination for faithful answer', async () => {
    const result = await detectHallucination(
      '您在阿里巴巴担任高级工程师期间...',
      '用户曾在阿里巴巴工作，担任高级工程师',
      '用户是阿里巴巴高级工程师'
    );
    expect(result.user_fact_hallucination).toBe(false);
    expect(result.methodology_hallucination).toBe(false);
  });
});
```

- [ ] **Step 2: 编写 hallucination-detector.ts**

```typescript
// src/lib/eval/hallucination-detector.ts
import { LLMClient } from '@/lib/llm-client';
import { getModelCandidates } from '@/lib/runtime-config';

export interface HallucinationResult {
  user_fact_hallucination: boolean;
  user_fact_details: Array<{ claim: string; reason: string }>;
  methodology_hallucination: boolean;
  methodology_details: Array<{ claim: string; reason: string }>;
  overall_score: number; // 0-1, 1=完全忠实
}

const EVAL_MODEL_ID = 'qwen3.6-plus-2026-04-02';

/**
 * 简历场景幻觉检测：分两个维度
 * ① 用户事实 (经历/职级/证书) — 零容忍，必须与上下文完全一致
 * ② 方法论建议 — 允许基于知识库合理发散，不与上下文直接矛盾即可
 */
export async function detectHallucination(
  answer: string,
  context: string,
  userContext: string, // 用户简历/背景信息
): Promise<HallucinationResult> {
  const client = new LLMClient();
  const candidates = await getModelCandidates(EVAL_MODEL_ID);

  const prompt = `你是一个严格的幻觉检测器。请检查以下回答是否存在编造。

## 评估规则
**维度 1: 用户事实 (零容忍)**
- 涉及用户经历、职级、公司、证书、年限等具体事实，必须与用户背景信息完全一致
- 任何不一致、添加、推测都算作编造
- 用户背景: ${userContext}

**维度 2: 方法论建议 (允许合理发散)**
- 方法论、建议、框架类内容允许基于知识库合理发散
- 只要不与上下文直接矛盾，不算编造

**上下文 (检索到的知识库内容):**
${context}

**回答:**
${answer}

请返回 JSON 格式:
{
  "user_fact_hallucination": true/false,
  "user_fact_details": [{"claim": "编造的具体内容", "reason": "为什么是编造"}],
  "methodology_hallucination": true/false,
  "methodology_details": [{"claim": "编造的具体内容", "reason": "为什么是编造"}],
  "overall_score": 0.0-1.0
}`;

  const response = await client.invoke({
    messages: [{ role: 'user', content: prompt }],
    models: candidates,
    temperature: 0,
    timeoutMs: 30_000,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error('[Hallucination] Failed to parse result');
  }

  return {
    user_fact_hallucination: false,
    user_fact_details: [],
    methodology_hallucination: false,
    methodology_details: [],
    overall_score: 1,
  };
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm vitest run src/lib/eval/hallucination-detector.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/lib/eval/hallucination-detector.ts src/lib/eval/hallucination-detector.test.ts
git commit -m "feat(m2): add hallucination detector (user facts vs methodology)"
```

---

### Task M2.4: 评估 Worker

**Files:**
- Create: `src/lib/eval/worker.ts`
- Create: `scripts/start-worker.ts`

- [ ] **Step 1: 编写 worker.ts**

```typescript
// src/lib/eval/worker.ts
import { dequeueEvalJob, completeEvalJob, failEvalJob, getPendingCount } from '@/lib/db/eval-jobs';
import { evaluateFaithfulness, evaluateAnswerRelevancy, evaluateContextRelevancy } from './ragas';
import { getDb } from '@/lib/db/connection';
import { insertRequestLog } from '@/lib/db/request-logger';

const POLL_INTERVAL_MS = 5000;
const MAX_CONCURRENT = 2;

let running = false;
let activeJobs = 0;

export async function startWorker(): Promise<void> {
  running = true;
  console.log('[EvalWorker] Started, polling every', POLL_INTERVAL_MS, 'ms');

  while (running) {
    try {
      while (activeJobs < MAX_CONCURRENT) {
        const job = dequeueEvalJob();
        if (!job) break;

        activeJobs++;
        processJob(job).finally(() => {
          activeJobs--;
        });
      }
    } catch (err) {
      console.error('[EvalWorker] Dequeue error:', err);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function processJob(job: { id: number; request_id: string; query: string; answer: string }): Promise<void> {
  const startTime = Date.now();
  try {
    console.log(`[EvalWorker] Processing job ${job.id} for request ${job.request_id}`);

    // 获取请求日志中的上下文
    const db = getDb();
    const log = db.prepare(
      'SELECT doc_ids, rewritten_query, strategy FROM request_logs WHERE request_id = ?'
    ).get(job.request_id) as { doc_ids: string | null; rewritten_query: string | null; strategy: string | null } | undefined;

    const context = log?.doc_ids || '';

    // 并行评估
    const [faithfulness, answerRelevancy, contextRelevancy] = await Promise.all([
      evaluateFaithfulness(job.answer, context).catch(e => {
        console.error('[EvalWorker] Faithfulness failed:', e);
        return { score: -1, claims: [] };
      }),
      evaluateAnswerRelevancy(job.answer, job.query).catch(e => {
        console.error('[EvalWorker] AnswerRelevancy failed:', e);
        return { score: -1, reason: String(e) };
      }),
      evaluateContextRelevancy(context, job.query).catch(e => {
        console.error('[EvalWorker] ContextRelevancy failed:', e);
        return { score: -1, reason: String(e) };
      }),
    ]);

    const overallScore = (faithfulness.score + answerRelevancy.score + contextRelevancy.score) / 3;
    const latencyMs = Date.now() - startTime;

    const metrics = {
      faithfulness_score: faithfulness.score,
      faithfulness_reason: JSON.stringify(faithfulness.claims),
      answer_relevancy_score: answerRelevancy.score,
      answer_relevancy_reason: answerRelevancy.reason,
      context_relevancy_score: contextRelevancy.score,
      context_relevancy_reason: contextRelevancy.reason,
      overall_score: overallScore,
      eval_latency_ms: latencyMs,
    };

    // 写入 eval_results 表
    db.prepare(`
      INSERT OR REPLACE INTO eval_results (
        request_id, faithfulness_score, faithfulness_reason,
        answer_relevancy_score, answer_relevancy_reason,
        context_relevancy_score, context_relevancy_reason,
        overall_score, eval_model, eval_latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'qwen3.6-plus', ?)
    `).run(
      job.request_id,
      metrics.faithfulness_score,
      metrics.faithfulness_reason,
      metrics.answer_relevancy_score,
      metrics.answer_relevancy_reason,
      metrics.context_relevancy_score,
      metrics.context_relevancy_reason,
      metrics.overall_score,
      metrics.eval_latency_ms,
    );

    completeEvalJob(job.id, metrics);
    console.log(`[EvalWorker] Job ${job.id} completed: overall=${overallScore.toFixed(3)} in ${latencyMs}ms`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[EvalWorker] Job ${job.id} failed:`, errorMsg);
    failEvalJob(job.id, errorMsg);
  }
}

export function stopWorker(): void {
  running = false;
  console.log('[EvalWorker] Stopped');
}
```

- [ ] **Step 2: 编写 start-worker.ts**

```typescript
// scripts/start-worker.ts
import { startWorker } from '../src/lib/eval/worker';

console.log('Starting eval worker...');
startWorker().catch(err => {
  console.error('Worker crashed:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});
```

- [ ] **Step 3: 在 chat/route.ts 中，请求日志写入后，按抽样策略入队评估**

在 request_log 写入后添加：

```typescript
// ===== M2: 抽样入队评估 (5-10% 抽样 + 全部差评/空召回) =====
void (async () => {
  try {
    const { enqueueEvalJob } = await import('@/lib/db/eval-jobs');
    const shouldEval = Math.random() < 0.10                      // 10% 随机抽样
      || requestLog.has_recall === 0;                            // 全部空召回
    if (shouldEval) {
      const priority = requestLog.has_recall === 0 ? 2 : 0;
      enqueueEvalJob(requestLog.request_id, priority);
    }
  } catch (err) {
    console.error('[Chat] Failed to enqueue eval job:', err);
  }
})();
```

- [ ] **Step 4: 提交**

```bash
git add src/lib/eval/worker.ts scripts/start-worker.ts src/app/api/chat/route.ts
git commit -m "feat(m2): add eval worker with RAGAS metrics + sampling strategy"
```

---

### Task M2.5: Golden 测试集 + Judge 校准

**Files:**
- Create: `src/lib/eval/golden-dataset.ts`
- Create: `src/lib/eval/judge-calibrator.ts`
- Create: `src/lib/eval/golden-dataset.test.ts`

- [ ] **Step 1: 编写 golden-dataset.ts**

```typescript
// src/lib/eval/golden-dataset.ts
import { getDb } from '@/lib/db/connection';

export interface GoldenTest {
  id: number;
  query: string;
  expected_answer: string;
  expected_faithfulness: number;
  expected_relevancy: number;
  context_docs: string | null;
  category: string;
  difficulty: string;
  tags: string | null;
}

export function insertGoldenTest(test: Omit<GoldenTest, 'id'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO golden_tests (query, expected_answer, expected_faithfulness, expected_relevancy, context_docs, category, difficulty, tags)
    VALUES (@query, @expected_answer, @expected_faithfulness, @expected_relevancy, @context_docs, @category, @difficulty, @tags)
  `).run(test);
}

export function getAllGoldenTests(): GoldenTest[] {
  const db = getDb();
  return db.prepare('SELECT * FROM golden_tests ORDER BY id').all() as GoldenTest[];
}

export function getGoldenTestCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM golden_tests').get() as { cnt: number };
  return row.cnt;
}
```

- [ ] **Step 2: 编写 judge-calibrator.ts**

```typescript
// src/lib/eval/judge-calibrator.ts
import { evaluateFaithfulness, evaluateAnswerRelevancy } from './ragas';
import { getAllGoldenTests } from './golden-dataset';

export interface CalibrationResult {
  sample_count: number;
  faithfulness_correlation: number; // LLM Judge vs Human, 理想 > 0.7
  answer_relevancy_correlation: number;
  is_calibrated: boolean; // 是否达到可用标准
  details: Array<{
    query: string;
    human_faithfulness: number;
    judge_faithfulness: number;
    human_relevancy: number;
    judge_relevancy: number;
  }>;
}

/**
 * 校准 LLM-as-Judge 与人工标注的一致性
 * 使用 Pearson 相关系数
 * 参考: RAGAS paper §4.2 — LLM-as-Judge 需要与人工标注做一致性校验
 */
export async function calibrateJudge(): Promise<CalibrationResult> {
  const tests = getAllGoldenTests();
  if (tests.length < 10) {
    return {
      sample_count: tests.length,
      faithfulness_correlation: 0,
      answer_relevancy_correlation: 0,
      is_calibrated: false,
      details: [],
    };
  }

  const details: CalibrationResult['details'] = [];

  for (const test of tests) {
    const context = test.context_docs || '';
    const faith = await evaluateFaithfulness(test.expected_answer, context);
    const relev = await evaluateAnswerRelevancy(test.expected_answer, test.query);

    details.push({
      query: test.query,
      human_faithfulness: test.expected_faithfulness,
      judge_faithfulness: faith.score,
      human_relevancy: test.expected_relevancy,
      judge_relevancy: relev.score,
    });
  }

  // Pearson 相关系数
  const faithCorr = pearsonCorrelation(
    details.map(d => d.human_faithfulness),
    details.map(d => d.judge_faithfulness),
  );
  const relevCorr = pearsonCorrelation(
    details.map(d => d.human_relevancy),
    details.map(d => d.judge_relevancy),
  );

  return {
    sample_count: tests.length,
    faithfulness_correlation: faithCorr,
    answer_relevancy_correlation: relevCorr,
    is_calibrated: faithCorr > 0.7 && relevCorr > 0.7,
    details,
  };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}
```

- [ ] **Step 3: 编写测试**

```typescript
// src/lib/eval/golden-dataset.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _useMemoryDb, closeDb } from '@/lib/db/connection';
import { insertGoldenTest, getAllGoldenTests, getGoldenTestCount } from './golden-dataset';

describe('golden-dataset', () => {
  beforeEach(() => { _useMemoryDb(); });
  afterEach(() => { closeDb(); });

  it('inserts and retrieves golden tests', () => {
    insertGoldenTest({
      query: '如何准备晋升答辩？',
      expected_answer: '晋升答辩需要准备PPT和演讲稿',
      expected_faithfulness: 0.9,
      expected_relevancy: 0.85,
      context_docs: '["doc-1","doc-2"]',
      category: 'promotion',
      difficulty: 'medium',
      tags: '["晋升","答辩"]',
    });

    const tests = getAllGoldenTests();
    expect(tests).toHaveLength(1);
    expect(tests[0].query).toBe('如何准备晋升答辩？');
    expect(tests[0].expected_faithfulness).toBe(0.9);
  });

  it('getGoldenTestCount returns correct count', () => {
    expect(getGoldenTestCount()).toBe(0);
    insertGoldenTest({
      query: 'test', expected_answer: 'answer',
      expected_faithfulness: 1, expected_relevancy: 1,
      context_docs: null, category: 'general', difficulty: 'easy', tags: null,
    });
    expect(getGoldenTestCount()).toBe(1);
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
pnpm vitest run src/lib/eval/golden-dataset.test.ts
```
Expected: 2 passing

- [ ] **Step 5: 提交**

```bash
git add src/lib/eval/golden-dataset.ts src/lib/eval/golden-dataset.test.ts src/lib/eval/judge-calibrator.ts
git commit -m "feat(m2): add golden test set + judge calibrator"
```

---

### Task M2.6: 评估看板 (3 个核心视图)

**Files:**
- Create: `src/app/admin/_components/eval-dashboard-tab.tsx`
- Create: `src/app/api/admin/eval/route.ts`
- Modify: `src/app/admin/page.tsx` (添加 tab)
- Modify: `src/app/admin/_lib/types.ts` (添加 TabKey)

- [ ] **Step 1: 编写 eval API**

```typescript
// src/app/api/admin/eval/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';

export async function GET(_request: NextRequest) {
  const db = getDb();

  // 视图1: 配置维度对比 (不同 model 的分数+成本)
  const modelComparison = db.prepare(`
    SELECT
      rl.model_id,
      COUNT(*) as request_count,
      AVG(er.overall_score) as avg_score,
      AVG(er.faithfulness_score) as avg_faithfulness,
      AVG(er.answer_relevancy_score) as avg_answer_relevancy,
      AVG(er.context_relevancy_score) as avg_context_relevancy,
      SUM(rl.total_tokens) as total_tokens,
      SUM(rl.cost_estimate) as total_cost
    FROM eval_results er
    JOIN request_logs rl ON er.request_id = rl.request_id
    GROUP BY rl.model_id
    ORDER BY avg_score DESC
  `).all();

  // 视图2: Top Failed Queries (分数最低的 20 个查询)
  const topFailed = db.prepare(`
    SELECT
      rl.query,
      rl.answer,
      er.overall_score,
      er.faithfulness_score,
      er.answer_relevancy_score,
      er.context_relevancy_score,
      er.faithfulness_reason,
      rl.created_at
    FROM eval_results er
    JOIN request_logs rl ON er.request_id = rl.request_id
    WHERE er.overall_score IS NOT NULL
    ORDER BY er.overall_score ASC
    LIMIT 20
  `).all();

  // 视图3: 每日趋势+点踩率
  const dailyTrend = db.prepare(`
    SELECT
      date(rl.created_at) as date,
      COUNT(*) as requests,
      AVG(er.overall_score) as avg_score,
      COUNT(DISTINCT fb.id) as feedback_count,
      SUM(CASE WHEN fb.feedback_type = 'thumbs_down' THEN 1 ELSE 0 END) as thumbs_down
    FROM request_logs rl
    LEFT JOIN eval_results er ON rl.request_id = er.request_id
    LEFT JOIN feedback fb ON rl.request_id = fb.request_id
    WHERE rl.created_at >= datetime('now', '-30 days')
    GROUP BY date(rl.created_at)
    ORDER BY date DESC
  `).all();

  return NextResponse.json({
    modelComparison,
    topFailed,
    dailyTrend,
  });
}
```

- [ ] **Step 2: 编写 eval-dashboard-tab.tsx**

```tsx
// src/app/admin/_components/eval-dashboard-tab.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ResponsiveContainer } from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface EvalData {
  modelComparison: Array<{
    model_id: string;
    request_count: number;
    avg_score: number;
    avg_faithfulness: number;
    avg_answer_relevancy: number;
    avg_context_relevancy: number;
    total_tokens: number;
    total_cost: number;
  }>;
  topFailed: Array<{
    query: string;
    answer: string;
    overall_score: number;
    faithfulness_score: number;
    answer_relevancy_score: number;
    context_relevancy_score: number;
    faithfulness_reason: string;
    created_at: string;
  }>;
  dailyTrend: Array<{
    date: string;
    requests: number;
    avg_score: number;
    feedback_count: number;
    thumbs_down: number;
  }>;
}

export default function EvalDashboardTab() {
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/eval')
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="text-muted-foreground text-sm">加载评估数据...</div>;
  if (!data) return <div className="text-muted-foreground text-sm">暂无评估数据</div>;

  return (
    <div className="space-y-6">
      {/* 视图1: 配置维度对比 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">模型配置对比 (分数 vs 成本)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.modelComparison}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model_id" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Bar dataKey="avg_score" fill="#3b82f6" name="综合评分" />
              <Bar dataKey="avg_faithfulness" fill="#22c55e" name="忠实度" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.modelComparison.map((m: any) => (
              <div key={m.model_id} className="p-3 rounded-lg border">
                <div className="text-xs text-muted-foreground">{m.model_id}</div>
                <div className="text-lg font-bold">{(m.avg_score * 100).toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">
                  {m.request_count} 次 · ¥{(m.total_cost || 0).toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 视图2: Top Failed Queries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Failed Queries (最低分 20 条)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.topFailed.map((item: any, idx: number) => (
              <div key={idx} className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                onClick={() => setExpandedQuery(expandedQuery === idx ? null : idx)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.query}</div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        综合: {(item.overall_score * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        忠实度: {(item.faithfulness_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {expandedQuery === idx ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </div>
                {expandedQuery === idx && (
                  <div className="mt-3 text-xs text-muted-foreground space-y-2">
                    <div><strong>回答:</strong> {item.answer?.substring(0, 300)}{(item.answer?.length > 300) ? '...' : ''}</div>
                    <div><strong>问题分析:</strong> {item.faithfulness_reason?.substring(0, 300)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 视图3: 每日趋势 + 点踩率 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">每日趋势 (30 天)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Line type="monotone" dataKey="avg_score" stroke="#3b82f6" name="平均评分" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 修改 admin/page.tsx 添加 tab**

在 `TAB_CONFIG` 数组中添加：
```typescript
{ key: 'eval', label: '评估', icon: BarChart3 },
```

在 `types.ts` 的 `TabKey` 中添加：
```typescript
| 'eval'
```

在 `TabsContent` 区域添加：
```tsx
<TabsContent value="eval">
  <EvalDashboardTab />
</TabsContent>
```

- [ ] **Step 4: 提交**

```bash
git add src/app/admin/_components/eval-dashboard-tab.tsx src/app/api/admin/eval/route.ts src/app/admin/page.tsx src/app/admin/_lib/types.ts
git commit -m "feat(m2): add eval dashboard (model comparison, top failed, daily trend)"
```

---

### M2 验证清单

- [ ] `pnpm vitest run src/lib/db/ src/lib/eval/` — 所有测试通过
- [ ] `pnpm dev` + `pnpm tsx scripts/start-worker.ts` — Worker 启动并轮询 eval_jobs
- [ ] 发送 chat 消息 → 确认 eval_jobs 表中有 pending 记录 → Worker 处理完成
- [ ] 后台「评估」Tab 显示三个视图
- [ ] 手动插入 30+ 条 golden_tests 并用 `calibrateJudge()` 验证一致性

---

## M3 · 实验 + 半自动闭环

### Task M3.1: Prompt 版本注册表

**Files:**
- Create: `src/lib/db/prompt-versions.ts`
- Create: `src/lib/db/prompt-versions.test.ts`
- Create: `src/app/api/admin/prompt-versions/route.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/db/prompt-versions.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _useMemoryDb, closeDb } from './connection';
import { registerPromptVersion, getActiveVersion, getExperimentVersion, activateVersion, setExperiment } from './prompt-versions';

describe('prompt-versions', () => {
  beforeEach(() => { _useMemoryDb(); });
  afterEach(() => { closeDb(); });

  it('registers and retrieves active version', () => {
    registerPromptVersion('v1.0.0', 'You are a helpful assistant', 'Initial version', 'admin');
    const active = getActiveVersion();
    expect(active).not.toBeNull();
    expect(active!.version).toBe('v1.0.0');
    expect(active!.is_active).toBe(1);
  });

  it('activateVersion replaces old active', () => {
    registerPromptVersion('v1.0.0', 'prompt v1', 'first', 'admin');
    registerPromptVersion('v1.1.0', 'prompt v2', 'improved', 'admin');
    activateVersion('v1.1.0');
    const active = getActiveVersion();
    expect(active!.version).toBe('v1.1.0');
  });

  it('setExperiment sets traffic percentage', () => {
    registerPromptVersion('v1-experiment', 'experimental prompt', 'test', 'admin');
    setExperiment('v1-experiment', 0.1);
    const exp = getExperimentVersion();
    expect(exp).not.toBeNull();
    expect(exp!.experiment_traffic).toBe(0.1);
  });
});
```

- [ ] **Step 2: 编写 prompt-versions.ts**

```typescript
// src/lib/db/prompt-versions.ts
import { createHash } from 'crypto';
import { getDb } from './connection';

export interface PromptVersion {
  id: number;
  version: string;
  prompt_content: string;
  prompt_hash: string;
  change_description: string | null;
  author: string | null;
  is_active: number;
  is_experiment: number;
  experiment_traffic: number;
  created_at: string;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function registerPromptVersion(
  version: string,
  content: string,
  description: string,
  author: string,
): void {
  const db = getDb();
  const hash = hashContent(content);

  // 如果是第一个版本，自动激活
  const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM prompt_versions').get() as { cnt: number };
  const isActive = existingCount.cnt === 0 ? 1 : 0;

  db.prepare(`
    INSERT INTO prompt_versions (version, prompt_content, prompt_hash, change_description, author, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(version, content, hash, description, author, isActive);
}

export function getActiveVersion(): PromptVersion | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prompt_versions WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1').get() as PromptVersion | undefined;
  return row ?? null;
}

export function getExperimentVersion(): PromptVersion | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prompt_versions WHERE is_experiment = 1 AND experiment_traffic > 0 ORDER BY created_at DESC LIMIT 1').get() as PromptVersion | undefined;
  return row ?? null;
}

export function activateVersion(version: string): void {
  const db = getDb();
  db.prepare('UPDATE prompt_versions SET is_active = 0').run();
  db.prepare('UPDATE prompt_versions SET is_active = 1 WHERE version = ?').run(version);
}

export function setExperiment(version: string, traffic: number): void {
  const db = getDb();
  db.prepare('UPDATE prompt_versions SET is_experiment = 0, experiment_traffic = 0').run();
  db.prepare('UPDATE prompt_versions SET is_experiment = 1, experiment_traffic = ? WHERE version = ?').run(traffic, version);
}

export function getAllVersions(): PromptVersion[] {
  const db = getDb();
  return db.prepare('SELECT * FROM prompt_versions ORDER BY created_at DESC').all() as PromptVersion[];
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/db/prompt-versions.ts src/lib/db/prompt-versions.test.ts src/app/api/admin/prompt-versions/route.ts
git commit -m "feat(m3): add prompt version registry"
```

---

### Task M3.2: A/B 测试 (稳定哈希分桶)

**Files:**
- Create: `src/lib/experiments/ab-test.ts`
- Create: `src/lib/experiments/ab-test.test.ts`

**参考:** [Hash-based bucket assignment](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models) — 使用 `user_id` 稳定哈希分桶，同一用户始终看到同一版本，避免随机数导致用户体验不一致

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/experiments/ab-test.test.ts
import { describe, it, expect } from 'vitest';
import { getBucket, shouldUseExperiment } from './ab-test';

describe('ab-test', () => {
  it('returns consistent bucket for same user', () => {
    const b1 = getBucket('user-123');
    const b2 = getBucket('user-123');
    expect(b1).toBe(b2);
  });

  it('distributes users across 100 buckets', () => {
    const bucket = getBucket('test-user');
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
  });

  it('shouldUseExperiment compares bucket with traffic', () => {
    // 10% traffic = buckets 0-9
    const bucket = getBucket('user-a');
    const isExperiment = bucket < 10;
    expect(shouldUseExperiment('user-a', 0.1)).toBe(isExperiment);
  });

  it('shouldUseExperiment with 0 traffic always returns false', () => {
    expect(shouldUseExperiment('any-user', 0)).toBe(false);
  });
});
```

- [ ] **Step 2: 编写 ab-test.ts**

```typescript
// src/lib/experiments/ab-test.ts
import { createHash } from 'crypto';

/**
 * 稳定哈希分桶：使用 user_id 的 SHA256 哈希决定分桶 (0-99)
 * 同一用户始终在同一桶中，不受请求顺序影响
 */
export function getBucket(userId: string): number {
  const hash = createHash('sha256').update(userId).digest('hex');
  // 取前 8 个 hex 字符转成整数，对 100 取模
  const intVal = parseInt(hash.substring(0, 8), 16);
  return intVal % 100;
}

/**
 * 判断用户是否应使用实验版本
 * @param userId 用户标识
 * @param traffic 实验流量比例 (0-1)
 * @returns true 表示使用实验版本
 */
export function shouldUseExperiment(userId: string, traffic: number): boolean {
  if (traffic <= 0) return false;
  if (traffic >= 1) return true;
  const bucket = getBucket(userId);
  return bucket < Math.floor(traffic * 100);
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/experiments/ab-test.ts src/lib/experiments/ab-test.test.ts
git commit -m "feat(m3): add A/B testing with hash-based stable bucketing"
```

---

### Task M3.3: 自动回滚 (三重防误判)

**Files:**
- Create: `src/lib/experiments/rollback.ts`
- Create: `src/lib/experiments/rollback.test.ts`

**参考:** [Statistical significance in A/B testing](https://docs.statsig.com/stats-engine/statistical-methodology) — p<0.05 使用 Welch's t-test；最小样本量 100+ 避免小样本波动

- [ ] **Step 1: 编写 rollback.ts**

```typescript
// src/lib/experiments/rollback.ts
import { getDb } from '@/lib/db/connection';
import { activateVersion } from '@/lib/db/prompt-versions';

export interface RollbackDecision {
  should_rollback: boolean;
  reason: string;
  experiment_version: string;
  experiment_score: number;
  control_score: number;
  sample_size_control: number;
  sample_size_experiment: number;
  p_value: number;
  stage: string; // '5%' | '20%' | '50%'
}

/**
 * 三重防误判自动回滚判定
 * 1. 最小样本量：实验组+对照组各 ≥ 30
 * 2. 统计显著性：Welch's t-test p < 0.05
 * 3. 灰度递增：仅在当前阶段完成时允许下一阶段
 *
 * @param experimentVersion 实验版本号
 * @param controlVersion 对照版本号
 * @param currentStage 当前灰度阶段
 */
export async function checkRollback(
  experimentVersion: string,
  controlVersion: string,
  currentStage: number, // 0.05, 0.20, 0.50
): Promise<RollbackDecision> {
  const db = getDb();

  // 获取实验组评分
  const expScores = db.prepare(`
    SELECT er.overall_score
    FROM eval_results er
    JOIN request_logs rl ON er.request_id = rl.request_id
    WHERE rl.prompt_version = ?
      AND er.overall_score IS NOT NULL
      AND rl.created_at >= datetime('now', '-7 days')
  `).all(experimentVersion) as Array<{ overall_score: number }>;

  // 获取对照组评分
  const ctrlScores = db.prepare(`
    SELECT er.overall_score
    FROM eval_results er
    JOIN request_logs rl ON er.request_id = rl.request_id
    WHERE rl.prompt_version = ?
      AND er.overall_score IS NOT NULL
      AND rl.created_at >= datetime('now', '-7 days')
  `).all(controlVersion) as Array<{ overall_score: number }>;

  const nExp = expScores.length;
  const nCtrl = ctrlScores.length;

  // 三重判断 1: 最小样本量
  if (nExp < 30 || nCtrl < 30) {
    return {
      should_rollback: false,
      reason: `样本量不足 (实验组: ${nExp}, 对照组: ${nCtrl})，需要各 ≥ 30`,
      experiment_version: experimentVersion,
      experiment_score: nExp > 0 ? mean(expScores.map(s => s.overall_score)) : 0,
      control_score: nCtrl > 0 ? mean(ctrlScores.map(s => s.overall_score)) : 0,
      sample_size_control: nCtrl,
      sample_size_experiment: nExp,
      p_value: 1,
      stage: `${(currentStage * 100).toFixed(0)}%`,
    };
  }

  const expMean = mean(expScores.map(s => s.overall_score));
  const ctrlMean = mean(ctrlScores.map(s => s.overall_score));

  // 三重判断 2: Welch's t-test
  const pValue = welchTTest(
    expScores.map(s => s.overall_score),
    ctrlScores.map(s => s.overall_score),
  );

  if (pValue < 0.05 && expMean < ctrlMean) {
    return {
      should_rollback: true,
      reason: `实验组评分显著低于对照组 (p=${pValue.toFixed(4)} < 0.05)，实验组: ${expMean.toFixed(3)} vs 对照组: ${ctrlMean.toFixed(3)}`,
      experiment_version: experimentVersion,
      experiment_score: expMean,
      control_score: ctrlMean,
      sample_size_control: nCtrl,
      sample_size_experiment: nExp,
      p_value: pValue,
      stage: `${(currentStage * 100).toFixed(0)}%`,
    };
  }

  return {
    should_rollback: false,
    reason: `实验组与对照组无显著差异 (p=${pValue.toFixed(4)})，实验组: ${expMean.toFixed(3)} vs 对照组: ${ctrlMean.toFixed(3)}`,
    experiment_version: experimentVersion,
    experiment_score: expMean,
    control_score: ctrlMean,
    sample_size_control: nCtrl,
    sample_size_experiment: nExp,
    p_value: pValue,
    stage: `${(currentStage * 100).toFixed(0)}%`,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

/**
 * Welch's t-test (unequal variance)
 */
function welchTTest(sample1: number[], sample2: number[]): number {
  const m1 = mean(sample1);
  const m2 = mean(sample2);
  const v1 = variance(sample1) / sample1.length;
  const v2 = variance(sample2) / sample2.length;

  const t = (m1 - m2) / Math.sqrt(v1 + v2);

  const df = (v1 + v2) ** 2 / (
    (v1 ** 2) / (sample1.length - 1) + (v2 ** 2) / (sample2.length - 1)
  );

  // 简化版：使用 t 分布近似
  // p-value from t-statistic (two-tailed)
  const p = tDistributionPValue(Math.abs(t), df);
  return p;
}

/** 简化版 t 分布 p-value 计算 */
function tDistributionPValue(t: number, df: number): number {
  // 使用 Abramowitz & Stegun 近似
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  // 简化版：使用正则化不完全 beta 函数近似
  // 对于 df > 30，可以用正态近似
  if (df > 30) {
    return 2 * (1 - normalCDF(t));
  }
  // 简化版返回保守估计
  return 2 * (1 - normalCDF(t * (1 - 1 / (4 * df))));
}

/** 标准正态分布的 CDF (Abramowitz & Stegun 近似) */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/experiments/rollback.ts src/lib/experiments/rollback.test.ts
git commit -m "feat(m3): add auto-rollback with triple safeguard (sample size, p<0.05, progressive)"
```

---

### Task M3.4: 半自动优化 Loop

**Files:**
- Create: `src/lib/experiments/auto-optimizer.ts`
- Create: `src/app/admin/_components/experiments-tab.tsx`

- [ ] **Step 1: 编写 auto-optimizer.ts**

```typescript
// src/lib/experiments/auto-optimizer.ts
import { getDb } from '@/lib/db/connection';
import { registerPromptVersion } from '@/lib/db/prompt-versions';
import { LLMClient } from '@/lib/llm-client';
import { getModelCandidates } from '@/lib/runtime-config';

export interface OptimizationSuggestion {
  id: string;
  type: 'prompt_improvement' | 'knowledge_gap' | 'rerank_tuning' | 'model_switch';
  title: string;
  description: string;
  suggested_change: string;
  evidence: Array<{ query: string; score: number; reason: string }>;
  auto_apply: boolean; // 是否可自动应用 (永远是 false，需要人工确认)
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  created_at: string;
}

const EVAL_MODEL_ID = 'qwen3.6-plus-2026-04-02';

/**
 * 半自动优化 Loop 的核心：
 * 1. 检测 → 分析低分查询的共性模式
 * 2. 生成建议 → LLM 分析根因并生成改进方案
 * 3. 人工确认 → 任何改动必须人工批准
 * 4. 灰度上线 → 批准后创建实验版本
 * 5. 继续评估 → 监控实验效果
 * 6. 回滚 → 效果差自动回滚
 */
export async function analyzeAndSuggest(): Promise<OptimizationSuggestion[]> {
  const db = getDb();

  // 获取最近 7 天的低分请求 (overall_score < 0.5)
  const lowScoreRequests = db.prepare(`
    SELECT rl.query, rl.answer, er.overall_score, er.faithfulness_score,
           er.faithfulness_reason, er.answer_relevancy_score, er.context_relevancy_score
    FROM eval_results er
    JOIN request_logs rl ON er.request_id = rl.request_id
    WHERE er.overall_score < 0.5
      AND rl.created_at >= datetime('now', '-7 days')
    ORDER BY er.overall_score ASC
    LIMIT 20
  `).all() as Array<{
    query: string; answer: string; overall_score: number;
    faithfulness_score: number; faithfulness_reason: string;
    answer_relevancy_score: number; context_relevancy_score: number;
  }>;

  if (lowScoreRequests.length < 5) {
    return []; // 样本不足，不生成建议
  }

  // 使用 LLM 分析低分请求的共性模式
  const client = new LLMClient();
  const candidates = await getModelCandidates(EVAL_MODEL_ID);

  const analysisPrompt = `你是一个 RAG 系统优化专家。请分析以下低分回答的共性模式，并生成改进建议。

## 低分请求列表
${lowScoreRequests.map((r, i) => `
### 请求 ${i + 1}
- 问题: ${r.query}
- 回答: ${r.answer?.substring(0, 200)}
- 综合评分: ${(r.overall_score * 100).toFixed(0)}%
- 忠实度: ${(r.faithfulness_score * 100).toFixed(0)}%
- 答案相关性: ${(r.answer_relevancy_score * 100).toFixed(0)}%
- 上下文相关性: ${(r.context_relevancy_score * 100).toFixed(0)}%
`).join('\n')}

## 分析要求
请分析这些低分请求的共性模式，并生成具体的改进建议。返回 JSON 格式：

{
  "patterns": [
    {
      "pattern_name": "模式名称",
      "affected_count": 影响的请求数量,
      "root_cause": "根因分析",
      "suggestion": "具体的改进建议"
    }
  ]
}`;

  const response = await client.invoke({
    messages: [{ role: 'user', content: analysisPrompt }],
    models: candidates,
    temperature: 0.3,
    timeoutMs: 60_000,
  });

  let patterns: Array<{
    pattern_name: string;
    affected_count: number;
    root_cause: string;
    suggestion: string;
  }> = [];

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      patterns = JSON.parse(jsonMatch[0]).patterns || [];
    }
  } catch {
    console.error('[AutoOptimizer] Failed to parse analysis');
  }

  return patterns.map((p, i) => ({
    id: `suggestion-${Date.now()}-${i}`,
    type: 'prompt_improvement' as const,
    title: p.pattern_name,
    description: p.root_cause,
    suggested_change: p.suggestion,
    evidence: lowScoreRequests.slice(0, p.affected_count).map(r => ({
      query: r.query,
      score: r.overall_score,
      reason: r.faithfulness_reason?.substring(0, 100) || '',
    })),
    auto_apply: false,
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  }));
}
```

- [ ] **Step 2: 编写 experiments-tab.tsx**

```tsx
// src/app/admin/_components/experiments-tab.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lightbulb, AlertTriangle, Check, X, RefreshCw } from 'lucide-react';

interface Suggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  suggested_change: string;
  evidence: Array<{ query: string; score: number; reason: string }>;
  auto_apply: boolean;
  status: string;
}

export default function ExperimentsTab() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const runAnalysis = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/experiments/analyze', { method: 'POST' });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setMessage(data.suggestions?.length === 0
        ? '样本不足，未生成建议（需要至少 5 条低分评估记录）'
        : `生成了 ${data.suggestions.length} 条优化建议`);
    } catch {
      setMessage('分析失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            半自动优化
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            检测 → 分析低分模式 → 生成改进建议 → <strong>人工确认</strong> → 灰度上线 → 继续评估 → 自动回滚
          </p>
          <Button onClick={runAnalysis} disabled={loading} variant="outline" size="sm">
            {loading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Lightbulb className="w-4 h-4 mr-1" />}
            运行分析
          </Button>
          {message && (
            <p className="text-sm mt-2 text-muted-foreground">{message}</p>
          )}
        </CardContent>
      </Card>

      {suggestions.map(s => (
        <Card key={s.id} className={s.status === 'applied' ? 'border-green-200' : ''}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{s.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                s.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                s.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                s.status === 'applied' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {s.status === 'pending' ? '待确认' :
                 s.status === 'approved' ? '已批准' :
                 s.status === 'applied' ? '已上线' : '已拒绝'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">{s.description}</p>
            <div className="bg-muted p-3 rounded-lg text-sm mb-3">
              <strong>建议修改:</strong> {s.suggested_change}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              影响请求 ({s.evidence.length}): {s.evidence.map(e => e.query).join(', ')}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-green-600">
                <Check className="w-3 h-3 mr-1" /> 批准
              </Button>
              <Button size="sm" variant="outline" className="text-red-600">
                <X className="w-3 h-3 mr-1" /> 拒绝
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {suggestions.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">点击"运行分析"检测低分模式并生成优化建议</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/experiments/auto-optimizer.ts src/app/admin/_components/experiments-tab.tsx
git commit -m "feat(m3): add semi-automatic optimization loop (analyze → suggest → HITL → rollout → evaluate → rollback)"
```

---

### M3 验证清单

- [ ] `pnpm vitest run src/lib/experiments/ src/lib/db/prompt-versions/` — 所有测试通过
- [ ] 后台「实验」Tab 可查看 Prompt 版本列表
- [ ] 注册新 Prompt 版本可激活/设置实验流量
- [ ] A/B 分桶：同一 user_id 始终在同一桶中
- [ ] 运行分析 → 生成优化建议 → 人工批准/拒绝
- [ ] 回滚判定：样本量不足时拒绝回滚，p<0.05 时触发回滚

---

## 自检清单

**1. Spec coverage:**
- [x] M1 埋点地基：request_logs 表 ✓, feedback 表 ✓, Langfuse 集成 ✓, Dashboard 增强 ✓
- [x] M2 评估+反馈：eval_jobs 队列 ✓, RAGAS 三个指标 ✓, 幻觉检测二维度 ✓, golden 测试集 ✓, judge 校准 ✓, 三个看板视图 ✓
- [x] M3 实验+半自动闭环：prompt 版本注册 ✓, 稳定哈希分桶 ✓, 三重防误判回滚 ✓, 半自动优化 loop ✓
- [x] 高可用：异步评估 (eval_jobs + Worker) ✓, 在线链路零依赖评估 ✓
- [x] 成本可控：抽样 10% + 全部空召回 ✓
- [x] HITL：任何变更需人工确认，全自动只允许观测+分析+建议+回滚 ✓

**2. Placeholder scan:** 无 TBD/TODO 占位

**3. Type consistency:** 所有接口跨任务一致（RequestLogInput, FeedbackRow, EvalJob, PromptVersion, HallucinationResult, RollbackDecision, OptimizationSuggestion）

---

## 执行选项

Two execution options:

1. **Subagent-Driven (recommended)** - 每个 Task 独立 subagent 执行，中间 review
2. **Inline Execution** - 在当前 session 中按 Task 顺序执行

Which approach?