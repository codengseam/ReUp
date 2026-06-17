# Contracts — AI Chat Scaffold

> READ ORDER: spec.md → ADR → contracts.md → checklist.md

## Module Boundaries

| Module | Owner | Data Ownership | Notes |
|--------|-------|---------------|-------|
| `src/lib/rag/` | Framework | Retrieval pipeline, cache | No domain logic |
| `src/lib/llm-client.ts` | Framework | LLM provider integration | DashScope OpenAI-compatible |
| `src/lib/embedder.ts` | Framework | Embedding generation | BGE-M3 local |
| `src/lib/vector-store.ts` | Framework | Vector storage/query | JSON-backed |
| `src/lib/reranker.ts` | Framework | Reranking | BGE-reranker local |
| `src/lib/skills-loader.ts` | Framework | Skill discovery/loading | Reads `skills/` directory |
| `src/lib/knowledge-base.ts` | Framework | Knowledge base management | Generic document store |
| `src/lib/intent-classifier.ts` | Framework | Query intent classification | Configurable categories |
| `src/lib/admin-auth.ts` | Framework | Admin authentication | PBKDF2 + httpOnly |
| `src/lib/conversation-store.ts` | Framework | Conversation persistence | SQLite/Prisma |
| `src/lib/runtime-config.ts` | Framework | Runtime configuration | Server config |
| `src/lib/prompts/` | Framework | Prompt templates | **NEW**: configurable prompt blocks |
| `src/app/api/chat/` | Framework | Chat SSE endpoint | Generic pipeline |
| `src/app/api/admin/` | Framework | Admin API routes | Generic admin operations |
| `src/app/admin/` | Framework | Admin UI | Generic labels/tabs |
| `src/app/page.tsx` | Framework | Chat UI | Configurable welcome/prompt |
| `src/components/chat/` | Framework | Chat components | Generic rendering |
| `src/components/ui/` | Framework | shadcn/ui base | No changes |
| `data/` | User | Knowledge base vectors | User provides |
| `skills/` | User | Domain skills | User provides |
| ~~`src/lib/resume/`~~ | REMOVED | — | Domain-specific |
| ~~`src/lib/offer/`~~ | REMOVED | — | Domain-specific |
| ~~`src/lib/review/`~~ | REMOVED | — | Domain-specific |
| ~~`src/lib/jd/`~~ | REMOVED | — | Domain-specific |
| ~~`src/app/resume/`~~ | REMOVED | — | Domain-specific page |
| ~~`src/app/offer/`~~ | REMOVED | — | Domain-specific page |
| ~~`src/app/review/`~~ | REMOVED | — | Domain-specific page |
| ~~`src/app/api/resume/`~~ | REMOVED | — | Domain-specific API |
| ~~`src/app/api/offer/`~~ | REMOVED | — | Domain-specific API |
| ~~`src/app/api/review/`~~ | REMOVED | — | Domain-specific API |

## Public API Shape

### POST /api/chat (SSE)

```yaml
Request:
  body:
    messages: Array<{role: 'user'|'assistant', content: string}>  # required
    model: string  # optional, model ID
    customProvider: {providerType, endpoint, apiKey, modelId}  # optional
    ragParams: Record<string, unknown>  # optional, RAG overrides
    customPrompt: string  # optional, override system prompt

SSE Response:
  events:
    - {status: "searching"}
    - {status: "generating"}
    - {meta: {citations: Array<{id, title, content, score}>, strategy: string}}
    - {content: string}  # incremental text chunks
    - {confidence: string, confidenceReason: string}
    - "[DONE]"
```

### POST /api/admin/auth

```yaml
Request:
  body: {password: string}
Response:
  200: {success: true}  # sets httpOnly cookie
  401: {error: string}
```

### GET/PUT /api/admin/config

```yaml
GET Response:
  200: {config: ServerConfig}

PUT Request:
  body: Partial<ServerConfig>
PUT Response:
  200: {success: true, config: ServerConfig}
```

### GET/POST /api/admin/knowledge

```yaml
GET Response:
  200: {documents: Array<DocumentInfo>}

POST Request:
  body: FormData (file upload)
POST Response:
  200: {success: true, document: DocumentInfo}
```

### GET /api/admin/skills

```yaml
GET Response:
  200: {skills: Array<SkillDefinition>}
```

## State Machine

### Chat Session

```
states: [idle, searching, generating, streaming, error]
transitions:
  - {from: idle, to: searching, event: user_message}
  - {from: searching, to: generating, event: rag_complete}
  - {from: searching, to: error, event: rag_error}
  - {from: generating, to: streaming, event: llm_stream_start}
  - {from: generating, to: error, event: llm_error}
  - {from: streaming, to: idle, event: stream_complete}
  - {from: streaming, to: error, event: stream_error}
  - {from: error, to: idle, event: retry}
```

## Cross-Module Events

| Event | Producer | Consumer | Payload | Delivery |
|-------|----------|----------|---------|----------|
| SSE status update | chat/route.ts | page.tsx (client) | `{status: string}` | SSE push |
| RAG results | rag/ | chat/route.ts | `{chunks, citations, strategy}` | Direct return |
| Skill definitions | skills-loader | chat/route.ts | `SkillDefinition[]` | Direct return |
| Config changes | admin/config API | runtime-config.ts | `Partial<ServerConfig>` | File write + reload |

## Boundary Semantics

| Boundary | Timeout | Retry | Idempotency | Failure |
|----------|---------|-------|-------------|---------|
| LLM stream | 60s connect + 120s total | 1 retry on connect failure | N/A (streaming) | Return error SSE event |
| RAG retrieval | 30s | No retry | Yes (cache-backed) | Proceed without RAG context |
| Admin auth | 10s | No retry | Yes (cookie-based) | 401 response |
| Vector store | 5s | No retry | Yes (read-only) | Fall back to sparse search |

## Verification Commands

```bash
# Type check (validates all contracts compile)
pnpm ts-check

# Lint (validates no dead imports)
pnpm lint

# Test (validates behavior matches contracts)
pnpm test

# Domain residue check (validates module boundaries)
grep -rc "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx" | grep -v ":0$"
```
