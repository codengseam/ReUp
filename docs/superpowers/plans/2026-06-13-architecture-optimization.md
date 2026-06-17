# BOSS Agent 架构优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 4 阶段对 BOSS Agent 做原地加固（稳定性 / 可控性 / AI 产出），全程不破坏现有功能，不引入字节系以外的技术栈。

**Architecture:** 拆 `rag.ts` 单文件；合并 4 个弱 LLM 调用为 1 个结构化分类器；合并分散的 Skill/HOT_QUERIES 配置为单 JSON；admin 鉴权迁后端；强制 Citation 编号 + 用户反馈闭环。

**Tech Stack:** Next.js 16 + React 19 + TypeScript 5 + coze-coding-dev-sdk (Doubao) + Coze Knowledge API + Vitest + shadcn/ui（**仅此而已**）

**Coze 空间部署约束**：仅使用 `coze-coding-dev-sdk` / Doubao 系列模型 / Coze Knowledge API；不引入 LangChain、Pinecone、Postgres、Redis 等。

---

## 文件结构

| 路径 | 阶段 | 职责 |
|------|------|------|
| `src/lib/rag/index.ts` | 1 | 公开 `retrieve()` 入口（re-export shim） |
| `src/lib/rag/search.ts` | 1 | semanticSearch / keywordAugmentedSearch / hybridSearch / generateHydeAnswer / compressContext |
| `src/lib/rag/route.ts` | 1 | routeQueryViaLLM / rewriteQueryViaLLM / inferQueryCategoryViaLLM / extractKeywordsViaLLM + 本地降级 |
| `src/lib/rag/safety.ts` | 1 | inputGuard / outputGuard / hallucinationCheck / 各种 prompt 常量 |
| `src/lib/rag/cache.ts` | 1 | LRU 缓存 + 缓存 key + simpleHash |
| `src/lib/rag/assess.ts` | 1 | assessConfidence / isHotQuery / HOT_QUERIES |
| `src/lib/rag/suggestions.ts` | 1 | SUGGESTION_DB / getInputSuggestions / formatContext / buildCitations |
| `src/lib/sse-client.ts` | 1 | SSE 解析 + 指数退避重连 |
| `src/lib/intent-classifier.ts` | 2 | 统一 LLM 调用：一次返回 intent/strategy/risk/rewrite |
| `src/lib/skills-loader.ts` | 3 | 启动加载 skills.json + schema 校验 |
| `src/lib/url-safety.ts` | 3 | SSRF 防护 |
| `src/lib/prompts/blocks.ts` | 3 | Prompt 模板分块 |
| `src/lib/feedback-store.ts` | 4 | 反馈持久化（feedback.json） |
| `src/app/api/admin/auth/route.ts` | 3 | 后端鉴权路由（bcrypt + cookie） |
| `data/skills.json` | 3 | Skill/HOT_QUERIES/QUICK_ENTRIES/SUGGESTION_DB 合并 |
| `src/lib/__tests__/rag/*.test.ts` | 1 | rag 子模块测试 |
| `src/lib/__tests__/intent-classifier.test.ts` | 2 | 分类器测试 |
| `src/lib/__tests__/skills-loader.test.ts` | 3 | 加载器测试 |
| `src/lib/__tests__/feedback-store.test.ts` | 4 | 反馈测试 |
| `src/app/api/chat/route.ts` | 1-4 | 主流程编排（增量修改） |
| `src/app/page.tsx` | 1,4 | SSE 客户端 + 反馈按钮 |
| `src/app/admin/page.tsx` | 3 | 鉴权改 fetch + cookie |
| `src/components/chat/ChatMessage.tsx` | 4 | Citation 编号解析渲染 |

---

## 验收门（每阶段必过）

```bash
pnpm ts-check              # 必须 0 错
pnpm lint:build            # 必须 0 错
pnpm test                  # 现有 22 + 新增全过
pnpm dev                   # 1 轮对话不报错（手工）
```

---

## 阶段 1：稳定性急救

### Task 1.1: 抽 `rag/cache.ts`

**Files:**
- Create: `src/lib/rag/cache.ts`
- Modify: `src/lib/rag.ts:44-111`

- [ ] **Step 1: 新建 `src/lib/rag/cache.ts`，迁移以下内容**（与原文件完全一致）

```typescript
// src/lib/rag/cache.ts
// LRU 缓存 + 简单 hash + 缓存 key
interface CacheEntry<T> {
  data: T;
  expiry: number;
  lastAccess: number;
}

const MAX_CACHE_SIZE = 500;

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export function getCacheKey(
  query: string,
  chatHistory?: Array<{ role: string; content: string }>,
  params?: Record<string, unknown>
): string {
  const historyStr = chatHistory
    ?.slice(-3)
    .map(m => m.role.charAt(0) + ':' + simpleHash(m.content))
    .join('|') || '';
  const paramStr = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join('&')
    : '';
  return `${simpleHash(query)}::${historyStr}::${paramStr}`;
}

export function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) {
    entry.lastAccess = Date.now();
    return entry.data;
  }
  if (entry) cache.delete(key);
  return null;
}

export function setCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  data: T,
  ttlMs = 5 * 60 * 1000
): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now >= v.expiry) cache.delete(k);
  }
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestAccess = Infinity;
    for (const [k, v] of cache) {
      if (v.lastAccess < oldestAccess) {
        oldestAccess = v.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, expiry: now + ttlMs, lastAccess: now });
}

export const searchCache = new Map<string, CacheEntry<import('./types').RAGResult[]>>();
```

- [ ] **Step 2: 验证 ts-check 通过**

```bash
pnpm ts-check
```

预期：0 错。

### Task 1.2: 抽 `rag/safety.ts`

**Files:**
- Create: `src/lib/rag/safety.ts`
- Modify: `src/lib/rag.ts:680-1015`（拆出）

- [ ] **Step 1: 新建 `src/lib/rag/safety.ts`**

迁移 `SafetyCheckResult` 类型、`JAILBREAK_DETECTION_PROMPT` / `TOPIC_DETECTION_PROMPT` / `PROMISE_DETECTION_PROMPT` / `HALLUCINATION_CHECK_PROMPT` 常量、`llmJailbreakCheck` / `llmTopicCheck` / `inputGuard` / `outputGuard` / `hallucinationCheck` / `contentSafetyCheck` / `outputSafetyCheck`。

末尾导出 `assessConfidence` + `isHotQuery` + `HOT_QUERIES` 临时放这里（下一步再拆）。

所有从 `coze-coding-dev-sdk` 导入的 `Config / HeaderUtils / LLMClient` 保留原状。

- [ ] **Step 2: 验证**

```bash
pnpm ts-check
```

### Task 1.3: 抽 `rag/search.ts` + `rag/route.ts` + `rag/assess.ts` + `rag/suggestions.ts` + `rag/types.ts`

**Files:**
- Create: `src/lib/rag/types.ts` (导出 RAGResult / RAGResponse / Citation)
- Create: `src/lib/rag/search.ts` (semanticSearch / keywordAugmentedSearch / hybridSearch / generateHydeAnswer / compressContext)
- Create: `src/lib/rag/route.ts` (extractKeywordsViaLLM / routeQueryViaLLM / inferQueryCategoryViaLLM / rewriteQueryViaLLM / extractKeywordsLocal / routeQueryLocal / inferQueryCategoryLocal)
- Create: `src/lib/rag/assess.ts` (assessConfidence / isHotQuery / HOT_QUERIES 迁移)
- Create: `src/lib/rag/suggestions.ts` (SUGGESTION_DB / getInputSuggestions / formatContext / buildCitations)
- Create: `src/lib/rag/index.ts` (re-export shim + retrieve() 聚合函数)
- Modify: `src/lib/rag.ts:1-43, 1016-1366`（主 retrieve() 与 formatContext 移入 index.ts）

- [ ] **Step 1: types.ts**

```typescript
// src/lib/rag/types.ts
export interface RAGResult {
  content: string;
  score: number;
  docId?: string;
  source?: string;
  category?: string;
  skillName?: string;
}

export interface RAGResponse {
  results: RAGResult[];
  context: string;
  status: 'searching' | 'generating' | 'error';
  citations: Citation[];
  rewrittenQuery?: string;
  strategy?: string;
}

export interface Citation {
  id: number;
  content: string;
  source: string;
  skillName?: string;
  category?: string;
  fullContent?: string;
}

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high';
  category?: string;
}
```

- [ ] **Step 2: 迁移 search.ts**：1:1 复制 `rag.ts:113-481`（semanticSearch / keywordAugmentedSearch / extractKeywordsViaLLM / extractKeywordsLocal / hybridSearch / generateHydeAnswer / compressContext），从 `./types` 导入 `RAGResult`。

- [ ] **Step 3: 迁移 route.ts**：1:1 复制 `rag.ts:484-678`（routeQueryViaLLM / routeQueryLocal / inferQueryCategoryViaLLM / inferQueryCategoryLocal / rewriteQueryViaLLM）。

- [ ] **Step 4: 迁移 assess.ts**：1:1 复制 `rag.ts:953-1010`（assessConfidence / isHotQuery / HOT_QUERIES）。

- [ ] **Step 5: 迁移 suggestions.ts**：1:1 复制 `rag.ts:1138-1188`（formatContext / buildCitations / SUGGESTION_DB / getInputSuggestions）+ `rag.ts:1190-1211`（HOT_QUERIES 备用）。

- [ ] **Step 6: 创建 `src/lib/rag/index.ts`**

```typescript
// src/lib/rag/index.ts
// 公开 API：与原 src/lib/rag.ts 行为一致
import type { RAGResponse, RAGResult, Citation } from './types';
import { searchCache, getCacheKey, getCached, setCache } from './cache';
import { retrieve as _retrieve } from './_retrieve-internal';

export type { RAGResult, RAGResponse, Citation, SafetyCheckResult } from './types';

export async function retrieve(
  query: string,
  topK = 5,
  customHeaders?: Record<string, string>,
  chatHistory?: Array<{ role: string; content: string }>,
  params?: Record<string, unknown>
): Promise<RAGResponse> {
  return _retrieve(query, topK, customHeaders, chatHistory, params, {
    searchCache,
    getCacheKey,
    getCached,
    setCache,
  });
}
```

- [ ] **Step 7: 创建 `src/lib/rag/_retrieve-internal.ts`**

迁移原 `rag.ts:1024-1136` 的 `retrieve()` 函数，把 `searchCache / getCacheKey / getCached / setCache` 改为从参数注入。

- [ ] **Step 8: 改 `src/lib/rag.ts` 为 shim**

```typescript
// src/lib/rag.ts - 临时 shim，新代码请从 '@/lib/rag' 导入
export * from './rag/index';
```

- [ ] **Step 9: 验证**

```bash
pnpm ts-check && pnpm lint:build && pnpm test
```

预期：全过。`pnpm dev` 跑 1 轮对话不报错。

### Task 1.4: 新建 `sse-client.ts`

**Files:**
- Create: `src/lib/sse-client.ts`

- [ ] **Step 1: 实现**

```typescript
// src/lib/sse-client.ts
// SSE 解析 + 指数退避重连。纯 fetch/ReadableStream，不引第三方。

export interface SSEOptions {
  url: string;
  method?: 'POST' | 'GET';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onEvent: (event: Record<string, unknown>) => void;
  onError?: (err: Error) => void;
  onDone?: () => void;
  maxRetries?: number;
}

export async function consumeSSE(opts: SSEOptions): Promise<void> {
  const maxRetries = opts.maxRetries ?? 3;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    if (opts.signal?.aborted) return;
    try {
      const res = await fetch(opts.url, {
        method: opts.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneSeen = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') { doneSeen = true; continue; }
          try { opts.onEvent(JSON.parse(data)); } catch { /* skip */ }
        }
      }
      if (doneSeen) { opts.onDone?.(); return; }
      throw new Error('stream ended without [DONE]');
    } catch (err) {
      if (opts.signal?.aborted) return;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxRetries) break;
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  opts.onError?.(lastError ?? new Error('SSE failed'));
}
```

- [ ] **Step 2: 验证**

```bash
pnpm ts-check
```

### Task 1.5: RAG 分层超时

**Files:**
- Modify: `src/app/api/chat/route.ts:303-368`

- [ ] **Step 1: 抽出 `withTimeout` 工具到 `src/lib/rag/index.ts`**

```typescript
// src/lib/rag/index.ts 新增
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

- [ ] **Step 2: 在 route.ts 中改用分层超时**

```typescript
// route.ts - 替换原 retrieve + setTimeout 块
try {
  // 总 10s 兜底
  const retrievePromise = (async () => {
    return await withTimeout(
      retrieve(latestUserMessage, 5, customHeaders, chatHistory, ragParams as any),
      10000,
      'RAG total'
    );
  })();
  const ragResponse = await retrievePromise;
  // ... 余下逻辑不变
} catch (ragError) {
  console.error('[Chat] RAG retrieval failed:', ragError);
  ragContext = ''; citations = []; ragResults = [];
}
```

- [ ] **Step 3: 验证**

```bash
pnpm ts-check && pnpm test
```

---

## 阶段 2：LLM 调用合并

### Task 2.1: 新建 `intent-classifier.ts`

**Files:**
- Create: `src/lib/intent-classifier.ts`
- Create: `src/lib/__tests__/intent-classifier.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/lib/__tests__/intent-classifier.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('parseIntentResponse', () => {
  it('parses valid JSON', () => {
    const raw = '{"intent":"promotion","strategy":"direct","rewrittenQuery":"P7 升 P8","riskLevel":"low","reason":"ok"}';
    const r = parseIntentResponse(raw);
    expect(r.intent).toBe('promotion');
    expect(r.strategy).toBe('direct');
    expect(r.riskLevel).toBe('low');
  });
  it('extracts JSON from prose', () => {
    const raw = '好的，结果是：{"intent":"interview","strategy":"multiquery","subQueries":["a","b"],"riskLevel":"low","reason":"ok"} 完';
    const r = parseIntentResponse(raw);
    expect(r.intent).toBe('interview');
    expect(r.subQueries).toEqual(['a','b']);
  });
  it('falls back gracefully on garbage', () => {
    const r = parseIntentResponse('not json at all');
    expect(r.intent).toBe('general');
    expect(r.strategy).toBe('direct');
    expect(r.riskLevel).toBe('low');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test -- intent-classifier
```

预期：FAIL（函数未定义）

- [ ] **Step 3: 实现 `parseIntentResponse`**

```typescript
// src/lib/intent-classifier.ts
export interface IntentResult {
  intent: 'promotion' | 'interview' | 'general' | 'off_topic' | 'jailbreak';
  strategy: 'direct' | 'multiquery' | 'hyde';
  rewrittenQuery: string;
  subQueries?: string[];
  riskLevel: 'low' | 'medium' | 'high';
  reason: string;
  category?: string;
}

export function parseIntentResponse(raw: string): IntentResult {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) {
    return { intent: 'general', strategy: 'direct', rewrittenQuery: '', riskLevel: 'low', reason: 'fallback' };
  }
  try {
    const j = JSON.parse(m[0]);
    return {
      intent: ['promotion','interview','general','off_topic','jailbreak'].includes(j.intent) ? j.intent : 'general',
      strategy: ['direct','multiquery','hyde'].includes(j.strategy) ? j.strategy : 'direct',
      rewrittenQuery: typeof j.rewrittenQuery === 'string' ? j.rewrittenQuery : '',
      subQueries: Array.isArray(j.subQueries) ? j.subQueries.filter((s: unknown) => typeof s === 'string') : undefined,
      riskLevel: ['low','medium','high'].includes(j.riskLevel) ? j.riskLevel : 'low',
      reason: typeof j.reason === 'string' ? j.reason : '',
      category: typeof j.category === 'string' ? j.category : undefined,
    };
  } catch {
    return { intent: 'general', strategy: 'direct', rewrittenQuery: '', riskLevel: 'low', reason: 'parse_error' };
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test -- intent-classifier
```

预期：PASS

- [ ] **Step 5: 实现 `classifyIntent` (LLM 调用)**

```typescript
// src/lib/intent-classifier.ts 追加
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';
import type { LLMConfig } from 'coze-coding-dev-sdk';

const INTENT_PROMPT = `你是一个查询分析 + 安全审核 AI。一次输出 JSON 即可，不要其他内容。

## 任务
分析用户查询，同时完成四件事：
1. intent: 话题意图（promotion=晋升 / interview=面试 / general=通用职场 / off_topic=非职场 / jailbreak=越狱）
2. strategy: 检索策略（direct / multiquery / hyde）
3. rewrittenQuery: 标准化后的查询（口语→正式，补全指代）
4. subQueries: 多子问题时给 2-3 个子查询；其他策略给 []
5. riskLevel: 风险等级（low / medium / high）
6. reason: 一句话说明
7. category: 仅 off_topic / jailbreak 时填子类别

## 输出格式（严格 JSON，无 markdown）
{"intent":"...","strategy":"...","rewrittenQuery":"...","subQueries":[],"riskLevel":"...","reason":"...","category":"..."}

## 对话历史（可选）
{CHAT_HISTORY}

## 用户查询
{QUERY}`;

export async function classifyIntent(
  query: string,
  chatHistory: Array<{ role: string; content: string }> = [],
  customHeaders?: Record<string, string>
): Promise<IntentResult> {
  const mode = process.env.INTENT_CLASSIFIER_MODE ?? 'unified';
  if (mode === 'legacy') {
    // 返回兼容结果，让调用方走旧逻辑
    return { intent: 'general', strategy: 'direct', rewrittenQuery: query, riskLevel: 'low', reason: 'legacy_mode' };
  }
  try {
    const config = new Config();
    const headers = customHeaders ?? HeaderUtils.extractForwardHeaders({});
    const llmClient = new LLMClient(config, headers);
    const historyStr = chatHistory.length > 0
      ? chatHistory.slice(-4).map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.substring(0, 100)}`).join('\n')
      : '（无）';
    const prompt = INTENT_PROMPT
      .replace('{CHAT_HISTORY}', historyStr)
      .replace('{QUERY}', query);
    const llmConfig: LLMConfig = { model: 'doubao-seed-2-0-lite-260215', temperature: 0.1 };
    const response = await llmClient.invoke([{ role: 'user', content: prompt }], llmConfig);
    if (response?.content) {
      const result = parseIntentResponse(response.content);
      if (!result.rewrittenQuery) result.rewrittenQuery = query;
      return result;
    }
  } catch (err) {
    console.warn('[intent-classifier] LLM failed, fallback:', err);
  }
  return { intent: 'general', strategy: 'direct', rewrittenQuery: query, riskLevel: 'low', reason: 'fallback' };
}
```

- [ ] **Step 6: 验证**

```bash
pnpm ts-check && pnpm test
```

### Task 2.2: route.ts 改用 unified classifier

**Files:**
- Modify: `src/app/api/chat/route.ts:268-368`

- [ ] **Step 1: 替换 `inputGuard` + 4 个弱 LLM 调用为单次 `classifyIntent`**

```typescript
// route.ts - 替换原 inputGuard + retrieve 块
import { classifyIntent } from '@/lib/intent-classifier';
import { inputGuard, outputGuard, hallucinationCheck, assessConfidence, type Citation } from '@/lib/rag';

// 1. 单次 LLM 调用获取 intent + 风险等级
const intent = await classifyIntent(latestUserMessage, chatHistory, customHeaders);
if (intent.intent === 'jailbreak') {
  return new Response(JSON.stringify({ error: BLOCKED_RESPONSE }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

// 2. RAG 检索（重写 query 用 intent.rewrittenQuery，categoryFilter 用 intent.intent）
const retrievePromise = (async () => {
  return await withTimeout(
    retrieve(intent.rewrittenQuery || latestUserMessage, 5, customHeaders, chatHistory, ragParams),
    10000, 'RAG total'
  );
})();
const ragResponse = await retrievePromise;
// ...
```

- [ ] **Step 2: 保留旧 `inputGuard` 导入以备 fallback**

```typescript
// 阶段 2 暂保留，阶段 4 完整切换
// 旧的 inputGuard 还在 lib/rag/safety.ts，不删除
```

- [ ] **Step 3: 验证**

```bash
pnpm ts-check && pnpm lint:build && pnpm test
```

预期：全过。`pnpm dev` 跑对话不报错。

---

## 阶段 3：可控性加固

### Task 3.1: `data/skills.json`

**Files:**
- Create: `data/skills.json`
- Create: `src/lib/skills-loader.ts`
- Create: `src/lib/__tests__/skills-loader.test.ts`

- [ ] **Step 1: 写 skills.json**

```json
{
  "version": 1,
  "skills": [
    {
      "id": "jinsheng-dicing-luoji",
      "name": "晋升底层逻辑",
      "category": "promotion",
      "trigger": "我绩效很好，为什么没晋升？",
      "framework": "先精通当前级别，再做下一级别的事",
      "steps": ["确认晋升通道", "评估当前级别", "对标下一级", "寻找越级机会"]
    }
    // ... 全部 8 个 skill，字段与上方一致
  ],
  "hotQueries": [
    { "id": 1, "text": "我绩效很好，为什么没晋升？", "category": "promotion" }
    // ... 共 14 条
  ],
  "quickEntries": [
    { "label": "晋升困惑", "icon": "TrendingUp", "query": "我绩效很好，为什么没晋升？" }
    // ... 共 4 条
  ],
  "suggestions": [
    { "keywords": ["晋升","升职"], "suggestion": "我绩效很好，为什么没晋升？" }
    // ... 共 12 条
  ]
}
```

从 `route.ts` 的 `SKILL_PROMPTS` + `rag.ts` 的 `HOT_QUERIES` + `page.tsx` 的 `QUICK_ENTRIES` + `SUGGESTION_DB` 1:1 合并。

- [ ] **Step 2: 写失败测试**

```typescript
// src/lib/__tests__/skills-loader.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSkills, getHotQueries, getSkillById } from '@/lib/skills-loader';

describe('skills-loader', () => {
  beforeAll(async () => { await loadSkills(); });
  it('loads 8 skills', () => {
    expect(getHotQueries().length).toBeGreaterThanOrEqual(8);
  });
  it('finds skill by id', () => {
    const s = getSkillById('jinsheng-dicing-luoji');
    expect(s?.name).toBe('晋升底层逻辑');
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
pnpm test -- skills-loader
```

- [ ] **Step 4: 实现 `skills-loader.ts`**

```typescript
// src/lib/skills-loader.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['promotion','interview']),
  trigger: z.string(),
  framework: z.string(),
  steps: z.array(z.string()),
});

const SkillsFileSchema = z.object({
  version: z.number(),
  skills: z.array(SkillSchema),
  hotQueries: z.array(z.object({ id: z.number(), text: z.string(), category: z.enum(['promotion','interview']) })),
  quickEntries: z.array(z.object({ label: z.string(), icon: z.string(), query: z.string() })),
  suggestions: z.array(z.object({ keywords: z.array(z.string()), suggestion: z.string() })),
});

export type SkillsFile = z.infer<typeof SkillsFileSchema>;
let cache: SkillsFile | null = null;

export async function loadSkills(): Promise<SkillsFile> {
  if (cache) return cache;
  const raw = readFileSync(join(process.cwd(), 'data', 'skills.json'), 'utf-8');
  cache = SkillsFileSchema.parse(JSON.parse(raw));
  return cache;
}

export function getHotQueries() { return cache?.hotQueries ?? []; }
export function getSkillById(id: string) { return cache?.skills.find(s => s.id === id); }
export function getAllSkills() { return cache?.skills ?? []; }
export function getQuickEntries() { return cache?.quickEntries ?? []; }
export function getSuggestions() { return cache?.suggestions ?? []; }
```

- [ ] **Step 5: 验证**

```bash
pnpm test -- skills-loader && pnpm ts-check
```

### Task 3.2: Prompt 模板分块

**Files:**
- Create: `src/lib/prompts/blocks.ts`

- [ ] **Step 1: 实现**

```typescript
// src/lib/prompts/blocks.ts
export const PERSONA_BLOCK = `你是 BOSS Agent，一个以资深 HR + 总裁视角提供职场建议的智能顾问。
角色：资深 HR + 总裁视角的职场顾问
专长：晋升指导、面试辅导、职业发展`;

export const CONSTRAINTS_BLOCK = `## 工作方式
1. 引导式对话：通过提问引导用户思考，不直接给答案
2. 展示分析：先分析再建议
3. 引用原文：引用知识库中的原文（用 [1][2] 编号）
4. 提炼心法：每次回复一句底层原理
5. 避免：暴力/色情/仇恨/恐怖/政治/宗教/赌博/毒品/娱乐八卦/薪资隐私/高管隐私/安全凭证`;

export const FORMAT_BLOCK = `## 输出格式（严格遵守，按顺序）
## 【我的分析】
- 用 ✅ / ❌ 标记关键判断

## 【框架技能+原文知识点】
**调用的 Skill**: [Skill中文名]
**原文知识点**: 
> 引用知识库原文（用 [1][2] 编号标注出处）
无原文时写"原文中暂无相关知识点"

## 【底层心法】
1-3 句精辟原理

## 【开始引导】
2-3 个引导提问`;

export const SKILL_SUMMARIES_BLOCK = `### 晋升类
1. 晋升底层逻辑：先精通当前级别，再做下一级别的事
2. 晋升三大原则：主动/成长/价值三原则过滤任务
3. 能力三重境界：基础(会做)/熟练(做好)/精通(优化)三层定位
4. 领域专家演进：532 精力分配+梯队+领域破局

### 面试类
5. 素质模型对齐：经验-技能-潜力-动机四层冰山模型
6. 亮点挖掘：价值/结果/创新/动机四维挖掘
7. 盲区导航：坦诚+平移/降维到主场
8. 反问框架：三元交集模型`;

export function buildSystemPrompt(options: {
  skillDetail?: string;  // RAG 命中时的具体 Skill 详情
  ragContext?: string;
  sensitiveWarning?: string;
}): string {
  const parts: string[] = [PERSONA_BLOCK, '', options.skillDetail ?? SKILL_SUMMARIES_BLOCK, '', CONSTRAINTS_BLOCK, '', FORMAT_BLOCK];
  if (options.ragContext) {
    parts.push('', `## 知识库检索结果\n严格基于以下内容回答：\n\n${options.ragContext}`);
  }
  if (options.sensitiveWarning) {
    parts.push('', `## 注意\n${options.sensitiveWarning}`);
  }
  return parts.join('\n');
}
```

- [ ] **Step 2: 验证**

```bash
pnpm ts-check
```

### Task 3.3: Admin 鉴权迁移

**Files:**
- Create: `src/app/api/admin/auth/route.ts`
- Modify: `src/app/admin/page.tsx:39-44, 56-92`
- Modify: `.env.example`

- [ ] **Step 1: 安装 bcryptjs**

```bash
pnpm add bcryptjs && pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: 新建 `src/app/api/admin/auth/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const USERNAME = process.env.ADMIN_USERNAME;
const PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? 'dev-secret-change-me';

function signCookie(value: string): string {
  // 简化版：base64(value).secret 形式
  return Buffer.from(`${value}.${SESSION_SECRET}`).toString('base64url');
}

function verifyCookie(value: string): boolean {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf-8');
    const [payload, secret] = decoded.split('.');
    return secret === SESSION_SECRET && payload === 'authed';
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!USERNAME || !PASSWORD_HASH) {
    return NextResponse.json({ error: 'admin_not_configured' }, { status: 503 });
  }
  const { username, password } = await req.json();
  if (username !== USERNAME) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, PASSWORD_HASH);
  if (!ok) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set('boss_admin_session', signCookie('authed'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24,
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete('boss_admin_session');
  return res;
}

export async function GET() {
  const c = cookies().get('boss_admin_session');
  return NextResponse.json({ authenticated: c ? verifyCookie(c.value) : false });
}
```

- [ ] **Step 3: 改 `admin/page.tsx` 鉴权**

```typescript
// 删除硬编码 ADMIN_CREDENTIALS（行 39-44）
// 删 AUTH_KEY sessionStorage 相关
// handleLogin 改 fetch('/api/admin/auth', { method: 'POST', body: { username, password } })
// useEffect 中检查 fetch('/api/admin/auth', { method: 'GET' }) → 决定 isAuthenticated
```

- [ ] **Step 4: 改 `.env.example`**

```bash
# 旧 NEXT_PUBLIC_ADMIN_USERNAME / NEXT_PUBLIC_ADMIN_PASSWORD 删除
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=$(node -e "console.log(require('bcryptjs').hashSync('your_password', 10))")
ADMIN_SESSION_SECRET=$(openssl rand -hex 32)
```

- [ ] **Step 5: 验证**

```bash
pnpm ts-check && pnpm lint:build
```

### Task 3.4: SSRF 防护

**Files:**
- Create: `src/lib/url-safety.ts`
- Modify: `src/app/api/chat/route.ts:432`

- [ ] **Step 1: 实现 url-safety**

```typescript
// src/lib/url-safety.ts
const BLOCKED_HOSTS = new Set(['localhost','127.0.0.1','0.0.0.0','169.254.169.254','metadata.google.internal']);
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1$|fc00:|fe80:)/i;

export function isSafeEndpoint(url: string): { safe: boolean; reason?: string } {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return { safe: false, reason: 'unsupported_protocol' };
    }
    if (BLOCKED_HOSTS.has(u.hostname) || PRIVATE_IP_RE.test(u.hostname)) {
      return { safe: false, reason: 'private_or_loopback' };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: 'invalid_url' };
  }
}
```

- [ ] **Step 2: route.ts 改用**

```typescript
// route.ts:432 处 customProvider 分支前
const urlSafety = isSafeEndpoint(customProvider.endpoint);
if (!urlSafety.safe) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'endpoint_blocked', reason: urlSafety.reason })}\n\n`));
  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
  return;
}
```

- [ ] **Step 3: 验证**

```bash
pnpm ts-check
```

---

## 阶段 4：AI 产出优化

### Task 4.1: Citation 强制编号

**Files:**
- Modify: `src/app/api/chat/route.ts:155-187`（SKILL_RULES）
- Modify: `src/components/chat/ChatMessage.tsx`（formatMarkdown）

- [ ] **Step 1: 在 Prompt 末尾加约束**

```typescript
// SKILL_RULES 末尾追加
- **强制引用编号**：引用知识库原文时必须用 [1][2] 形式标注，编号对应 meta.citations
```

- [ ] **Step 2: `formatMarkdown` 解析 [1]**

```typescript
// ChatMessage.tsx 的 formatMarkdown 函数中，把 [1] 转换为 <sup><button data-citation="1">[1]</button></sup>
// 点击事件由 ChatMessage 处理，打开 CitationDrawer
```

- [ ] **Step 3: 验证**

```bash
pnpm ts-check && pnpm test
```

### Task 4.2: 置信度重做

**Files:**
- Modify: `src/lib/rag/assess.ts:25-50`

- [ ] **Step 1: 改写 `assessConfidence`**

```typescript
export function assessConfidence(results: RAGResult[], query?: string): { level: 'high'|'medium'|'low'; reason?: string; score: number } {
  if (query && isHotQuery(query)) {
    return { level: 'high', score: 0.9 };
  }
  if (results.length === 0) return { level: 'low', score: 0.1, reason: 'no_results' };
  const top = results[0]?.score ?? 0;
  const score = Math.min(1, (results.length / 5) * 0.5 + top * 0.5);
  if (score >= 0.7) return { level: 'high', score };
  if (score >= 0.4) return { level: 'medium', score, reason: 'partial_match' };
  return { level: 'low', score, reason: 'weak_match' };
}
```

- [ ] **Step 2: route.ts 调整 `transferToHuman` 判定**

```typescript
const shouldTransfer = confidence.level === 'low';  // 不变
// meta 加 score 字段方便前端显示
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ confidence: confidence.level, confidenceScore: confidence.score, confidenceReason: confidence.reason, transferToHuman: shouldTransfer })}\n\n`));
```

- [ ] **Step 3: 验证**

```bash
pnpm ts-check && pnpm test
```

### Task 4.3: 反馈持久化

**Files:**
- Create: `src/lib/feedback-store.ts`
- Create: `src/lib/__tests__/feedback-store.test.ts`
- Modify: `src/app/page.tsx`（thumbsDown 调用）

- [ ] **Step 1: 写失败测试**

```typescript
// src/lib/__tests__/feedback-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { recordFeedback, listFeedback, _resetForTest } from '@/lib/feedback-store';

describe('feedback-store', () => {
  beforeEach(() => _resetForTest());
  it('records and lists feedback', async () => {
    await recordFeedback({ messageId: 'm1', conversationId: 'c1', reason: 'too_vague' });
    const list = await listFeedback();
    expect(list.length).toBe(1);
    expect(list[0].reason).toBe('too_vague');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test -- feedback-store
```

- [ ] **Step 3: 实现 `feedback-store.ts`**

```typescript
// src/lib/feedback-store.ts
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export interface Feedback {
  id: string;
  messageId: string;
  conversationId: string;
  reason: 'too_vague' | 'wrong' | 'unhelpful' | 'other';
  comment?: string;
  query: string;
  response: string;
  createdAt: number;
}

const FILE = join(process.cwd(), 'feedback.json');
let buffer: Feedback[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Feedback[]> {
  if (buffer) return buffer;
  try {
    const raw = await readFile(FILE, 'utf-8');
    buffer = JSON.parse(raw) as Feedback[];
  } catch {
    buffer = [];
  }
  return buffer!;
}

function flush() {
  writeQueue = writeQueue.then(async () => {
    if (buffer) await writeFile(FILE, JSON.stringify(buffer, null, 2), 'utf-8');
  }).catch(err => console.error('[feedback-store] write failed:', err));
  return writeQueue;
}

export async function recordFeedback(input: Omit<Feedback, 'id'|'createdAt'>): Promise<Feedback> {
  const list = await load();
  const fb: Feedback = { ...input, id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, createdAt: Date.now() };
  list.push(fb);
  await flush();
  return fb;
}

export async function listFeedback(): Promise<Feedback[]> {
  return [...(await load())];
}

export function _resetForTest() { buffer = null; }
```

- [ ] **Step 4: 验证测试通过**

```bash
pnpm test -- feedback-store
```

- [ ] **Step 5: 接入 page.tsx（thumbsDown 时调用）**

```typescript
// src/app/page.tsx 的 thumbsDown handler
await recordFeedback({
  messageId: msg.id,
  conversationId: currentConversationId,
  reason: 'unhelpful',
  query: msg.userQuery ?? '',
  response: msg.content,
});
```

- [ ] **Step 6: 验证**

```bash
pnpm ts-check && pnpm lint:build && pnpm test
```

---

## 收尾：Wiki 同步

### Task 5.1: AGENTS.md / SPEC.md 增量同步

**Files:**
- Modify: `AGENTS.md`（仅追加 1 段"架构演进"）
- Modify: `SPEC.md`（仅追加 1 节"近期架构变更"）

- [ ] **Step 1: AGENTS.md 追加**

```markdown
## 架构演进（2026-06-13）

- `src/lib/rag.ts` 拆分为 `src/lib/rag/{index,search,route,safety,cache,assess,suggestions,types}.ts`，原文件保留为 re-export shim
- 4 个弱 LLM 调用合并为 `src/lib/intent-classifier.ts::classifyIntent`，通过 `INTENT_CLASSIFIER_MODE=legacy` 可回退
- Skill/HOT_QUERIES/QUICK_ENTRIES/SUGGESTION_DB 合并到 `data/skills.json`，由 `src/lib/skills-loader.ts` 启动加载
- Admin 鉴权迁移到后端 `/api/admin/auth`（bcrypt + httpOnly cookie），env 从 `NEXT_PUBLIC_*` 改为 `ADMIN_*`
- Citation 强制使用 [1][2] 编号，置信度改为线性打分，用户反馈持久化到 `feedback.json`
```

- [ ] **Step 2: SPEC.md 追加**

```markdown
## 近期架构变更（2026-06-13）

详见 [docs/superpowers/specs/2026-06-13-architecture-optimization-design.md](../specs/2026-06-13-architecture-optimization-design.md)。
核心变化：RAG 拆 4 文件 + LLM 调用合并 4→1 + Skill 配单 JSON + Admin 鉴权后端化。
```

- [ ] **Step 3: 验证两文件 < 3000 tokens**

```bash
pnpm tokens AGENTS.md SPEC.md
```

预期：AGENTS.md < 3000 tokens（规则要求）

---

## 总验收

- [ ] `pnpm ts-check` 通过
- [ ] `pnpm lint:build` 通过
- [ ] `pnpm test` 全过（22 原有 + 新增）
- [ ] `pnpm dev` 跑 1 轮对话不报错
- [ ] AGENTS.md < 3000 tokens
- [ ] 设计文档 / 计划文档已 commit（或文件已落盘）
