# AI Chat Scaffold — General-Purpose RAG + Chat + Admin Framework

> **Spec**: [SPEC.md](file:///Users/dev/.qoder/worktree/reup/FacUX5/SPEC.md) — architecture overview
> **Scaffold plan**: [docs/architecture/ADR-20260617-scaffold-framework.md](file:///Users/dev/.qoder/worktree/reup/FacUX5/docs/architecture/ADR-20260617-scaffold-framework.md)

## Overview

Production-ready AI Chat scaffold: streaming RAG conversation + admin panel + pluggable skill system. Clone → configure → deploy for any domain (customer service, knowledge Q&A, writing assistant, education, etc.).

## Workflow: Sub-Agent Execution

- 5+ parallel sub-agents per batch (user preference, **multi-step / parallelizable work only**).
- Each task: goal / context / files / tests / acceptance / return-format.

## Personal Efficiency Rules

- See `docs/rules/efficiency.md` for the user's personal AI workflow rules
  (MUST DO 12 / MUST NOT 7 / SUGGESTED 9). Project-wide, applies to every agent.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5 strict + Tailwind 4 + shadcn/ui (Radix)
- **LLM**: DashScope OpenAI-compatible (Qwen / `gui-plus-2026-02-26`), `DASHSCOPE_API_KEY` in `.env.local`
- **Embedding**: BGE-M3 local (1024-dim, vectors in `data/skill-vectors.json`)
- **Rerank**: BGE-reranker-v2-m3 local (lazy load)
- **RAG**: `src/lib/rag/` (semantic + sparse + HyDE -> weighted fusion -> doc_id dedup, Top-K=5)
- **Test**: Vitest 4, >=80% coverage on new modules
- **Package mgr**: pnpm 9 only

## Expert Team (AI Expert Prompts)

- **Prompts**: `experts/` (orchestrator / ai-pm / system-architect / qa-strategist / code-reviewer)
- **Role map**: `notes/专家团_分工总览.md`
- **Output dirs**: `docs/ai-pm/` (PM) · `docs/architecture/` (Architect) · `docs/qa/` (QA) · `docs/review/` (Reviewer)
- **Chain**: Orchestrator amplifies intent -> routes by SIZE/TYPE -> PM -> Architect(L) -> executor -> QA -> Reviewer

## Project Structure

```
src/app/                # Pages + API routes (api/chat/route.ts = SSE entry)
src/components/ui/      # shadcn/ui library
src/lib/rag/            # search, route, safety, cache, assess, suggestions, types, index
src/lib/                # llm-client, embedder, vector-store, reranker, skills-loader,
                        #   knowledge-base, intent-classifier, admin-auth, runtime-config,
                        #   prompts/, conversation-store, models, utils
experts/                # 5 AI expert role prompts (framework infrastructure, not domain)
notes/                  # Shared role map (专家团_分工总览.md)
skills/                 # Domain skills: SKILL.md + test-prompts.json each (user provides)
data/                   # Vector store (skill-vectors.json) + server config
examples/               # Example configurations for common use cases
scripts/                # build/start/dev/validate, count-tokens, export-vectors
docs/                   # Specs, ADRs, contracts, PM plans
next.config.ts · package.json · tsconfig.json · vitest.config.ts
```

## Build & Run

- **Dev**: `pnpm run dev` (port 8080, HMR) · **Type check**: `pnpm ts-check` · **Lint**: `pnpm lint` · **Test**: `pnpm test`
- **Build**: `pnpm run build` · **Start**: `pnpm run start`
- **Tokens**: `pnpm tokens <file> [<file> ...]` (tiktoken cl100k_base)

## Core Modules

- **Chat SSE** (`src/app/api/chat/route.ts`): `searching -> generating -> content` flow; inject RAG + skill defs into system prompt; `LLMClient.stream()`
- **RAG** (`src/lib/rag/`): semantic + sparse + HyDE -> weighted fusion -> doc_id dedup. Top-K=5.
- **Intent** (`src/lib/intent-classifier.ts`): 1 LLM call; configurable categories
- **Frontend** (`src/app/page.tsx`): Welcome / Chat / Side-panel; streaming via `fetch` + `ReadableStream`; SSE status indicator
- **Admin**: `/api/admin/auth` + PBKDF2 + httpOnly cookie; dashboard/knowledge/prompts/model/rag/metadata tabs
- **Skills** (`src/lib/skills-loader.ts`): discovers and loads `skills/*/SKILL.md` from directory

## Scaffold Customization Points

| Point | How | File |
|-------|-----|------|
| System prompt | File + Admin panel | `src/lib/prompts/blocks.ts` + `/admin` Prompts tab |
| Welcome screen | Quick-action buttons config | `src/app/page.tsx` |
| Skills | Add `skills/<name>/SKILL.md` | `skills/` directory |
| Knowledge base | Replace vectors + documents | `data/skill-vectors.json` + `data/` |
| Theme | CSS Variables | `src/app/globals.css` |
| Model config | Admin panel or env vars | `/admin` Model tab + `.env.local` |

## Dev Conventions

- pnpm only · TS strict, no implicit `any` · Zod for external data
- LLM SDK server-side only; all LLM calls use `stream()`, client consumes SSE
- `HeaderUtils.extractForwardHeaders` required for header forwarding
- TDD first on new modules (Vitest, mocked `fetch` for HTTP)

## Design

Primary `#10b981` (emerald) · Background `#FFFFFF` · minimal & professional. Full tokens in `src/app/globals.css`.

## Conciseness Rules & Prohibitions

**Target**: AGENTS.md < 2000 tokens.

### Rules
1. Tables/code blocks > multi-line lists; one line over three when possible
2. AGENTS.md is "what / how-to-use" only — no "why / how-it-works" (-> spec)
3. Collapse module descriptions to single-line bullets; no sub-steps
4. After edits, rerun `pnpm tokens AGENTS.md` and update the self-reported value

### Prohibitions
- No principles, tutorials, or API workflows in AGENTS.md (-> spec)
- No creating/modifying README.md, DESIGN.md, SPEC.md without explicit request
- No emojis in code, docs, or replies (unless user asks)
- No helper functions / abstractions for one-time operations
- No dumping spec chapters or large docs into replies
- No claiming completion before verification (`pnpm ts-check && pnpm lint && pnpm test`)

---

Current `AGENTS.md` ~ 1700 tokens (measured 2026-06-17). Rerun `pnpm tokens AGENTS.md` to update.
