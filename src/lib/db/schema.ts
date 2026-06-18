// src/lib/db/schema.ts
// Loop Engineering 4 表 schema (按 I10 优化索引)
// - request_logs: 每条 chat 请求 + RAG 召回 + LLM 元数据
// - eval_results: LLM-as-judge 评估输出
// - feedback: 用户反馈 (thumbs / comment)
// - eval_jobs: 异步评估任务队列

export const SCHEMA = `
-- M1: 请求日志
CREATE TABLE IF NOT EXISTS request_logs (
  request_id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  query TEXT NOT NULL,
  rewritten_query TEXT,
  answer TEXT,
  strategy TEXT,
  model_id TEXT,
  prompt_version TEXT,
  experiment_id TEXT,
  variant TEXT,
  doc_ids TEXT,
  -- I4: 真实进 LLM 的 context 文本 (RAG 拼好的参考资料)
  context_text TEXT,
  top_score REAL,
  result_count INTEGER NOT NULL DEFAULT 0,
  has_recall INTEGER NOT NULL DEFAULT 1,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_session ON request_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_user ON request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_strategy ON request_logs(strategy);
CREATE INDEX IF NOT EXISTS idx_request_logs_prompt_version ON request_logs(prompt_version);
CREATE INDEX IF NOT EXISTS idx_request_logs_experiment ON request_logs(experiment_id, variant);

-- M2: 评估结果 (一条 request 一行, 重跑覆盖)
-- C-1 修复: request_id UNIQUE 让 worker 用 ON CONFLICT 幂等写入
CREATE TABLE IF NOT EXISTS eval_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  job_id INTEGER,
  overall_score REAL,           -- 可空 (I2/C2: -1 改用 null)
  faithfulness_score REAL,
  answer_relevancy_score REAL,
  context_relevancy_score REAL,
  faithfulness_reason TEXT,
  answer_relevancy_reason TEXT,
  context_relevancy_reason TEXT,
  model_id TEXT,
  judge_model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (request_id) REFERENCES request_logs(request_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eval_results_request ON eval_results(request_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_created ON eval_results(created_at);
CREATE INDEX IF NOT EXISTS idx_eval_results_score ON eval_results(overall_score);

-- M2: 用户反馈 (补充 feedback-store.ts, 这里是 SQL 版)
-- reason: good | too_vague | wrong | unhelpful | other | thumbs_up | thumbs_down
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  message_id TEXT,
  reason TEXT NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_feedback_request ON feedback(request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_reason ON feedback(reason);

-- M2: 异步评估任务队列 (RLS 抽样驱动)
-- request_id UNIQUE 防重复入队 (C2)
CREATE TABLE IF NOT EXISTS eval_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  enqueued_at INTEGER NOT NULL DEFAULT (unixepoch()),
  -- I3: started_at 不要在 failEvalJob 时清空, 保留原始排队时间用于排查
  started_at INTEGER,
  last_attempt_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_eval_jobs_status ON eval_jobs(status);
CREATE INDEX IF NOT EXISTS idx_eval_jobs_priority ON eval_jobs(priority DESC);
-- I10: 复合索引覆盖 worker 的 dequeue 模式
CREATE INDEX IF NOT EXISTS idx_eval_jobs_queue ON eval_jobs(status, priority DESC, created_at);
-- I9/Perf-7: 让 auto-optimizer 走索引而非全表扫
CREATE INDEX IF NOT EXISTS idx_request_logs_query ON request_logs(query);
-- C-2 性能: request_logs.prompt_version 已在 idx_request_logs_prompt_version
-- C-2 性能: eval_results JOIN 用 (request_id, overall_score) 复合索引
CREATE INDEX IF NOT EXISTS idx_eval_results_request_score ON eval_results(request_id, overall_score);

-- M2: Golden 测试集 (人工标注期望答案, 用于 judge 校准)
CREATE TABLE IF NOT EXISTS golden_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  expected_faithfulness REAL,
  expected_relevancy REAL,
  context_docs TEXT,
  category TEXT,
  difficulty TEXT DEFAULT 'medium',
  tags TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_golden_category ON golden_tests(category);

-- M3: Prompt 版本注册表
CREATE TABLE IF NOT EXISTS prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_key TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL,
  prompt_content TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  change_description TEXT,
  author TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  is_experiment INTEGER NOT NULL DEFAULT 0,
  experiment_id TEXT,
  experiment_traffic REAL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_experiment ON prompt_versions(experiment_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_key ON prompt_versions(prompt_key);

-- M3: Langfuse trace 关联 (内部 request_id ↔ Langfuse trace_id)
CREATE TABLE IF NOT EXISTS trace_links (
  request_id TEXT PRIMARY KEY,
  langfuse_trace_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_trace_links_trace ON trace_links(langfuse_trace_id);
`;
