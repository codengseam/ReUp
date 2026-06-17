# AI Chat Scaffold

> A production-ready, general-purpose AI Chat application scaffold with RAG (Retrieval-Augmented Generation), streaming conversation, admin panel, and pluggable skill system.

Clone it, drop in your knowledge base, configure your skills and prompts, and you have a working AI chat application — no need to rebuild RAG pipelines, streaming infrastructure, or admin panels from scratch.

---

## What You Get

| Capability | Implementation |
|------------|---------------|
| **Streaming Chat** | SSE-based real-time AI conversation with status indicators |
| **RAG Engine** | Semantic + Sparse + HyDE retrieval, weighted fusion, reranking |
| **Admin Panel** | Knowledge base management, prompt editing, model config, RAG tuning |
| **Skill System** | Pluggable prompt templates via `skills/` directory |
| **LLM Integration** | DashScope OpenAI-compatible (Qwen, etc.), server-side only |
| **Local Embedding** | BGE-M3 (1024-dim, pre-bundled), no cloud dependency |
| **UI Components** | shadcn/ui (Radix UI), responsive, minimal & professional |
| **Safety** | Input/output guards, hallucination detection, topic boundary check |
| **Auth** | Admin PBKDF2 + httpOnly cookie authentication |

## Use Cases

- **Enterprise Customer Service**: FAQ + product documentation chatbot
- **Knowledge Q&A**: Internal wiki / handbook retrieval assistant
- **Writing Assistant**: Novel writing, content creation with reference materials
- **Education Tutor**: Course material retrieval + guided learning
- **Legal/Medical Advisor**: Domain-specific regulation/guideline retrieval
- ... any scenario where you need "chat with your documents"

---

## Tech Stack

| Category | Technology | Notes |
|----------|-----------|-------|
| Framework | Next.js 16 (App Router) | Latest App Router |
| UI Core | React 19 | RSC + Server Actions |
| Language | TypeScript 5 | strict mode |
| UI Components | shadcn/ui (Radix UI) | Pre-installed, reuse freely |
| Styling | Tailwind CSS 4 | CSS Variables theme system |
| Forms | React Hook Form + Zod | Type-safe |
| LLM SDK | OpenAI-compatible | Server-side only |
| Embedding | BGE-M3 local | 1024-dim, bundled |
| Rerank | BGE-reranker-v2-m3 | Lazy-loaded |
| RAG | Semantic + Sparse + HyDE | Weighted fusion + dedup |
| Test | Vitest 4 | >=80% coverage on new modules |
| Package mgr | pnpm 9+ | Enforced (preinstall hook) |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9 (preinstall hook blocks npm/yarn)

### Install & Run

```bash
# Clone
git clone <repo-url> my-ai-chat-app
cd my-ai-chat-app

# Install dependencies
pnpm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local: set DASHSCOPE_API_KEY (your LLM API key)

# Start dev server
pnpm run dev
# → http://localhost:8080
```

### Verify Everything Works

```bash
pnpm ts-check    # TypeScript strict type check
pnpm lint        # ESLint
pnpm test        # Vitest
pnpm run build   # Production build
```

---

## Project Structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx              # Chat page (welcome + conversation + side panel)
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Global styles + Design Tokens
│   │   ├── admin/                # Admin panel (Dashboard, Knowledge, Prompts, Model, RAG, Metadata)
│   │   └── api/
│   │       ├── chat/route.ts     # POST /api/chat — SSE streaming chat endpoint
│   │       └── admin/            # Admin API routes (auth, config, knowledge, skills, stats)
│   ├── components/
│   │   ├── chat/                 # Chat business components (messages, input, welcome, citations)
│   │   └── ui/                   # shadcn/ui base components
│   ├── hooks/                    # Custom React Hooks
│   └── lib/
│       ├── rag/                  # RAG engine (search, route, safety, cache, assess)
│       ├── llm-client.ts         # LLM provider integration
│       ├── embedder.ts           # BGE-M3 embedding
│       ├── vector-store.ts       # Vector storage & query
│       ├── reranker.ts           # BGE-reranker reranking
│       ├── skills-loader.ts      # Skill discovery & loading
│       ├── knowledge-base.ts     # Knowledge base management
│       ├── intent-classifier.ts  # Query intent classification
│       ├── admin-auth.ts         # Admin authentication
│       ├── runtime-config.ts     # Runtime configuration
│       └── prompts/              # Configurable prompt templates
├── skills/                       # Your domain skills (SKILL.md + test-prompts.json each)
├── data/
│   ├── skill-vectors.json        # Pre-bundled vector store (replace with your own)
│   └── server-config.json        # Server configuration
├── experts/                      # AI expert team prompts (orchestrator/PM/architect/QA/reviewer)
├── scripts/                      # Build/dev/validate utilities
├── examples/                     # Example configurations for common use cases
├── docs/                         # Specifications, ADRs, and plans
├── AGENTS.md                     # AI collaboration conventions
├── README.md                     # This file
├── DESIGN.md                     # Design specification
└── SPEC.md                       # Architecture specification
```

---

## How to Customize

### 1. Add Your Knowledge Base

```bash
# Place your documents in data/ directory
# Then generate vector embeddings:
pnpm run build   # or use scripts/export-vectors.py for custom pipeline
```

The scaffold supports any text/markdown documents. Vectors are stored in `data/skill-vectors.json`.

### 2. Create Skills

```bash
# Create a new skill:
mkdir skills/my-skill/
# Write skills/my-skill/SKILL.md with your domain methodology
# Register it in the Admin panel
```

Skills are pluggable prompt templates that inject domain knowledge into the AI's system prompt when relevant queries are detected.

### 3. Configure System Prompt

Two ways:
- **File**: Edit `src/lib/prompts/blocks.ts` for the base system prompt template
- **Admin Panel**: Navigate to `/admin` → Prompts tab for runtime overrides

### 4. Adjust Theme

Edit `src/app/globals.css` — primary color, background, and all design tokens are CSS Variables.

### 5. Configure Welcome Screen

Edit the welcome screen quick-action buttons in `src/app/page.tsx` to match your use case.

---

## Core Architecture

### Chat Flow

```
User message → POST /api/chat
  → Input guard (safety check)
  → RAG retrieval (semantic + sparse + HyDE → fusion → dedup)
  → Topic boundary check
  → Build system prompt (base + RAG context + skill definitions)
  → LLM streaming generation
  → Output guard + hallucination check + confidence assessment
  → SSE push to client (searching → generating → content chunks → [DONE])
```

### SSE Protocol

```
data: {"status": "searching"}
data: {"status": "generating"}
data: {"meta": {"citations": [...], "strategy": "..."}}
data: {"content": "text chunk"}
data: {"confidence": "high", "confidenceReason": "..."}
data: [DONE]
```

### RAG Pipeline

| Stage | Method | Purpose |
|-------|--------|---------|
| 1. Semantic | Vector cosine similarity, Top-K | Semantic relevance |
| 2. Sparse | BM25-like keyword matching | Keyword precision |
| 3. HyDE | LLM generates hypothetical answer → search with it | Improved recall |
| 4. Fusion | Weighted score combination + doc_id dedup | Best-of-both ranking |
| 5. Rerank | BGE-reranker-v2-m3 (optional) | Fine-grained relevance |

---

## Admin Panel

Navigate to `/admin` (password-protected):

| Tab | Purpose |
|-----|---------|
| Dashboard | System status, usage statistics |
| Knowledge | Document management, upload, metadata |
| Prompts | System prompt editing and preview |
| Model | Default model selection, provider config |
| RAG | Retrieval parameters (Top-K, weights, thresholds) |
| Metadata | Document tagging and categorization |

---

## Expert Team (AI Collaboration)

The scaffold includes 5 AI expert role prompts in `experts/`:

| Role | Purpose | When Active |
|------|---------|-------------|
| Orchestrator | Intent amplification, routing, quality gates | Every task |
| PM | What to build, acceptance criteria | All tasks |
| Architect | Module boundaries, contracts, ADR | L-size (cross-module) only |
| QA Strategist | What to test, risk analysis | When testing needed |
| Code Reviewer | Change correctness review | After code output |

These prompts enable structured AI-assisted development workflows. See `notes/专家团_分工总览.md` for the role map.

---

## Development Conventions

- **pnpm only** (preinstall hook enforces)
- **TypeScript strict**, no implicit `any`
- **Zod** for external data validation
- **LLM SDK server-side only**; client consumes SSE
- **TDD** on new modules (Vitest)
- **shadcn/ui** for UI components (don't reinvent)

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/dev.sh` | Dev server (port 8080, HMR) |
| `scripts/build.sh` | Production build |
| `scripts/start.sh` | Production start |
| `scripts/validate.sh` | CI validation |
| `scripts/count-tokens.mjs` | Token counting (tiktoken) |

---

## Environment Variables

```bash
# Required
DASHSCOPE_API_KEY=your_api_key_here

# Optional (see .env.local.example for full list)
ADMIN_PASSWORD_HASH=...     # Admin auth (generate via /api/admin/auth setup)
```

---

## Examples

See `examples/` directory for ready-to-use configurations:

- `examples/customer-service/` — Enterprise FAQ chatbot setup
- (More examples coming: writing assistant, education tutor, legal advisor)

---

## Deployment

```bash
pnpm run build
pnpm run start
# Behind reverse proxy (Nginx/Caddy) for production
```

---

## Documentation

- [SPEC.md](file:///Users/dev/.qoder/worktree/reup/FacUX5/SPEC.md) — Architecture specification
- [AGENTS.md](file:///Users/dev/.qoder/worktree/reup/FacUX5/AGENTS.md) — AI collaboration conventions
- [DESIGN.md](file:///Users/dev/.qoder/worktree/reup/FacUX5/DESIGN.md) — Design specification
- [docs/ai-pm/](file:///Users/dev/.qoder/worktree/reup/FacUX5/docs/ai-pm/) — PM specs and checklists
- [docs/architecture/](file:///Users/dev/.qoder/worktree/reup/FacUX5/docs/architecture/) — ADRs and contracts

---

## License

MIT

---

## References

- [Next.js 16](https://nextjs.org/docs)
- [React 19](https://react.dev)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS 4](https://tailwindcss.com/docs)
- [Zod](https://zod.dev)
