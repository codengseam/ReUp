# AI Chat Scaffold — Architecture Specification

> General-purpose AI Chat application scaffold: RAG + Streaming Chat + Admin Panel + Skill System.
> Clone, configure, deploy for any domain.

---

## 1. Project Background

### 1.1 What Is This

**AI Chat Scaffold** is a production-ready framework for building AI-powered chat applications. It provides the complete infrastructure layer — you bring the domain knowledge.

**Origin**: Extracted from ReUp (a career advisor product), keeping all general-purpose infrastructure while removing domain-specific code.

### 1.2 Core Value

- **Knowledge-driven**: RAG pipeline ensures AI answers are grounded in your documents
- **Streaming conversation**: Real-time SSE-based chat with status indicators
- **Admin management**: Full admin panel for knowledge, prompts, models, RAG params
- **Pluggable skills**: Drop-in prompt templates via `skills/` directory
- **Safety-first**: Input/output guards, hallucination detection, topic boundary checks
- **Local-first**: BGE-M3 embedding runs locally, no cloud dependency for vectors

### 1.3 Target Users (of the scaffold)

- Developers building AI chat applications
- Teams needing knowledge-base Q&A systems
- Product teams prototyping AI-powered features

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.1 |
| **Core** | React | 19.2.3 |
| **Language** | TypeScript | 5.x (strict) |
| **UI Components** | shadcn/ui (Radix UI) | - |
| **Styling** | Tailwind CSS | 4.x |
| **LLM** | DashScope OpenAI-compatible | - |
| **Embedding** | BGE-M3 local (1024-dim) | @xenova/transformers |
| **Rerank** | BGE-reranker-v2-m3 | @xenova/transformers |
| **Forms** | React Hook Form + Zod | 7.x / 4.x |
| **Charts** | Recharts | 2.15.4 |
| **Database** | SQLite + Prisma | 7.x |
| **Test** | Vitest | 4.x |
| **Package mgr** | pnpm | 9.0.0+ |

---

## 3. Directory Structure

```
src/
├── app/
│   ├── page.tsx              # Main chat page (welcome + conversation + side panel)
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles + Design Tokens
│   ├── admin/                # Admin panel (6 tabs)
│   │   ├── page.tsx          # Admin main page
│   │   ├── _components/      # Tab components (dashboard, knowledge, prompt, model, rag, metadata)
│   │   └── _lib/             # Admin types, constants, utils
│   └── api/
│       ├── chat/route.ts     # POST /api/chat — SSE streaming endpoint
│       ├── admin/            # Admin API (auth, config, knowledge, skills, stats)
│       └── feedback/route.ts # User feedback collection
├── components/
│   ├── chat/                 # Chat business components
│   │   ├── types.ts          # Message, Citation, ModelConfig types
│   │   ├── ChatMessage.tsx   # Message bubble rendering
│   │   ├── ChatInput.tsx     # Input component
│   │   ├── WelcomeScreen.tsx # Welcome page with quick actions
│   │   └── CitationDrawer.tsx# Citation sidebar
│   └── ui/                   # shadcn/ui base components (40+ components)
├── hooks/                    # Custom React Hooks
│   ├── use-debounce.ts
│   └── use-mobile.ts
└── lib/
    ├── rag/                  # RAG engine
    │   ├── search.ts         # Semantic + sparse + HyDE search
    │   ├── route.ts          # Query routing (direct/multiquery/hyde)
    │   ├── safety.ts         # Input/output guards + hallucination check
    │   ├── cache.ts          # LRU cache (500 entries, 5min TTL)
    │   ├── assess.ts         # Confidence assessment
    │   ├── suggestions.ts    # Follow-up suggestions
    │   ├── types.ts          # RAG type definitions
    │   ├── _retrieve-internal.ts  # Internal retrieval orchestration
    │   └── index.ts          # Public API
    ├── llm-client.ts         # LLM provider integration (DashScope)
    ├── embedder.ts           # BGE-M3 embedding (local, 1024-dim)
    ├── vector-store.ts       # Vector storage & cosine similarity
    ├── reranker.ts           # BGE-reranker reranking
    ├── skills-loader.ts      # Skill discovery from skills/ directory
    ├── knowledge-base.ts     # Knowledge base document management
    ├── intent-classifier.ts  # Query intent classification (configurable)
    ├── admin-auth.ts         # Admin authentication (PBKDF2)
    ├── admin-stats.ts        # Admin dashboard statistics
    ├── runtime-config.ts     # Runtime configuration management
    ├── conversation-store.ts # Conversation persistence (SQLite)
    ├── feedback-store.ts     # User feedback persistence
    ├── error-classifier.ts   # Error categorization
    ├── category-rules.ts     # Document categorization rules
    ├── sse-client.ts         # SSE client utilities
    ├── typo-correction.ts    # Typo correction helper
    ├── url-safety.ts         # URL safety validation
    ├── models.ts             # Model configuration types
    ├── prompts/
    │   └── blocks.ts         # Configurable system prompt templates
    ├── db.ts                 # Database connection
    └── utils.ts              # cn() and other utilities
```

---

## 4. Core Module Details

### 4.1 Chat SSE Endpoint (`src/app/api/chat/route.ts`)

**Flow**:
```
POST /api/chat
  → Parse messages + model config
  → Input guard (safety check)
  → RAG retrieval (retrieve())
  → Topic boundary check
  → Build grounded system prompt (base + RAG context + skills)
  → LLM streaming generation (LLMClient.stream())
  → Output guard + hallucination check + confidence assessment
  → SSE response
```

**Request**:
```typescript
POST /api/chat
{
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  model?: string,
  customProvider?: { providerType, endpoint, apiKey, modelId },
  ragParams?: Record<string, unknown>,
  customPrompt?: string
}
```

**SSE Response Protocol**:
```
data: {"status": "searching"}
data: {"status": "generating"}
data: {"meta": {"citations": [...], "strategy": "..."}}
data: {"content": "incremental text"}
data: {"confidence": "high", "confidenceReason": "..."}
data: [DONE]
```

### 4.2 RAG Engine (`src/lib/rag/`)

**Pipeline**:
| Stage | Method | Purpose |
|-------|--------|---------|
| Semantic search | Vector cosine similarity, Top-K=5 | Semantic relevance |
| Sparse search | BM25-like keyword matching | Keyword precision |
| HyDE generation | LLM generates hypothetical answer → search | Recall improvement |
| Weighted fusion | Score combination + doc_id dedup | Best-of-both ranking |
| Reranking | BGE-reranker-v2-m3 (optional) | Fine-grained relevance |

**Query routing strategies**:
- `direct`: Clear questions, direct retrieval
- `multiquery`: Complex questions, decompose into sub-queries
- `hyde`: Vague questions, generate hypothetical answer first

**Cache**: LRU, max 500 entries, 5-min TTL

### 4.3 Admin Panel (`src/app/admin/`)

| Tab | Purpose |
|-----|---------|
| Dashboard | System status, usage statistics |
| Knowledge | Document management, upload, metadata |
| Prompts | System prompt editing and preview |
| Model | Default model selection, provider configuration |
| RAG | Retrieval parameters (Top-K, weights, thresholds) |
| Metadata | Document tagging and categorization |

**Auth**: PBKDF2 password hash + httpOnly cookie session

### 4.4 Skill System (`src/lib/skills-loader.ts` + `skills/`)

Skills are pluggable prompt templates. Each skill lives in `skills/<name>/SKILL.md` and contains:
- Metadata (name, category, trigger signals)
- Core methodology (frameworks, principles, steps)
- Example dialogues
- Source references

The skills-loader discovers all skills at startup and injects relevant ones into the system prompt based on query intent classification.

### 4.5 UI Components (`src/components/`)

- **shadcn/ui** (`src/components/ui/`): 40+ Radix UI components (button, dialog, tabs, table, drawer, etc.)
- **Chat components** (`src/components/chat/`): Message bubbles, input, welcome screen, citation drawer
- **Design**: Primary `#10b981` (emerald), background `#FFFFFF`, minimal & professional

---

## 5. Scaffold Customization Guide

### Adding Your Domain

1. **Knowledge Base**: Place documents in `data/`, generate vectors via `scripts/export-vectors.py`
2. **Skills**: Create `skills/<your-skill>/SKILL.md` with your domain methodology
3. **System Prompt**: Edit `src/lib/prompts/blocks.ts` or use Admin panel Prompts tab
4. **Welcome Screen**: Modify quick-action buttons in `src/app/page.tsx`
5. **Theme**: Adjust CSS Variables in `src/app/globals.css`
6. **Admin Labels**: Customize in `src/app/admin/_lib/constants.ts`

### Example: Customer Service Bot

```
skills/
  faq-handler/SKILL.md        # FAQ response methodology
  escalation/SKILL.md         # When to escalate to human agent
data/
  skill-vectors.json          # Vectors from product docs + FAQ
  server-config.json          # Custom RAG params for customer service
```

### Example: Writing Assistant

```
skills/
  plot-structure/SKILL.md     # Story arc frameworks
  character-dev/SKILL.md      # Character development methodology
data/
  skill-vectors.json          # Vectors from writing guides + reference novels
```

---

## 6. Development Conventions

| Rule | Detail |
|------|--------|
| Package mgr | pnpm only (preinstall hook enforced) |
| TypeScript | strict mode, no implicit any |
| Validation | Zod for all external data |
| LLM calls | Server-side only, always `stream()` |
| Header forwarding | `HeaderUtils.extractForwardHeaders` required |
| Testing | TDD first on new modules (Vitest) |
| UI | Prefer shadcn/ui, use `cn()` for className |

---

## 7. Build & Run Commands

```bash
pnpm run dev          # Dev server, port 8080, HMR
pnpm ts-check         # TypeScript strict type check
pnpm lint             # ESLint
pnpm test             # Vitest run
pnpm run build        # Production build
pnpm run start        # Production start
pnpm validate         # Parallel ts-check + lint:build
pnpm tokens <file>    # Token counting (tiktoken)
```

---

## 8. Environment Variables

```bash
# Required
DASHSCOPE_API_KEY=your_api_key    # DashScope LLM API key

# Optional
ADMIN_PASSWORD_HASH=...           # Pre-hashed admin password
INTENT_CLASSIFIER_MODE=legacy     # Fallback to legacy intent chain
```

---

## 9. Design Specification

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#10b981` (emerald) | Buttons, accents, AI status |
| Background | `#FFFFFF` (white) | Page background |
| Text | Gray scale | See `globals.css` |

Style: Minimal, professional, clean. 4/8px spacing grid. Unified border-radius.

Full Design Tokens in `src/app/globals.css` (CSS Variables, light/dark mode support).

---

## 10. Architecture Decisions

See `docs/architecture/` for full ADRs:
- [ADR-20260617-scaffold-framework.md](file:///Users/dev/.qoder/worktree/reup/FacUX5/docs/architecture/ADR-20260617-scaffold-framework.md) — Decision to restructure from vertical product to general scaffold

See `docs/ai-pm/` for PM specs and checklists:
- [large-20260617-scaffold-framework/spec.md](file:///Users/dev/.qoder/worktree/reup/FacUX5/docs/ai-pm/large-20260617-scaffold-framework/spec.md) — Restructuring specification

---

## 11. Quick Reference

| Need | Location |
|------|----------|
| Modify chat UI | `src/app/page.tsx` |
| Modify chat API | `src/app/api/chat/route.ts` |
| Modify RAG engine | `src/lib/rag/` |
| Modify admin panel | `src/app/admin/` |
| Modify system prompt | `src/lib/prompts/blocks.ts` |
| Modify UI components | `src/components/ui/` |
| Modify global styles | `src/app/globals.css` |
| Add a skill | `skills/<name>/SKILL.md` |
| Add knowledge | `data/` + regenerate vectors |

---

*Document generated: 2026-06-17. Based on scaffold/ai-chat-framework branch.*
