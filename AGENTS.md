# ReUp — Career Promotion & Resume Advisor

> **Spec (master plan)**: [docs/superpowers/specs/2026-06-14-reup-v2-design.md](file:///Users/user/Downloads/reup/docs/superpowers/specs/2026-06-14-reup-v2-design.md) — 6 phases, 50+ tasks
> **Exec prompt**: [docs/superpowers/specs/2026-06-14-reup-v2-exec-prompt.md](file:///Users/user/Downloads/reup/docs/superpowers/specs/2026-06-14-reup-v2-exec-prompt.md) — sub-agent dispatch protocol

**Brand note**: brand rename complete (Phase 2).

## Overview

Career advisor with "senior HR + CEO" perspective: promotion coaching, interview prep, resume optimization (v2). Web chat with streaming RAG answers.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5 strict + Tailwind 4 + shadcn/ui (Radix)
- **LLM (current)**: coze-coding-dev-sdk · model `doubao-seed-2-0-pro-260215` · **target Phase 1**: DashScope OpenAI-compatible (Qwen / `gui-plus-2026-02-26`), `DASHSCOPE_API_KEY` in `.env.local`
- **RAG**: Knowledge + Embedding SDK (vector + sparse + HyDE, hybrid)
- **Test**: Vitest 4, ≥80% coverage on new modules
- **Package mgr**: pnpm 9 only

## Project Structure

```
src/app/                # Pages + API routes (api/chat/route.ts = SSE entry)
src/components/ui/      # shadcn/ui library
src/lib/rag/            # search, route, safety, cache, assess, suggestions, types, _retrieve-internal, index
src/lib/                # intent-classifier, coze-knowledge-api (→ remove Phase 1), models, prompts/, skills-loader, admin-auth, etc.
src/lib/rag.ts          # re-export shim
skills/                 # 8 Skills: SKILL.md + test-prompts.json each
data/skill-vectors.json # 608 chunks, 1024-dim (BGE-M3) — pre-bundled cosine store
data/user-samples/      # resume/, projects/, AI大厂面试题.md (test fixtures)
data/book-sources/      # 大厂晋升指南/, 面试现场/ (optional RAG depth, 54 files)
scripts/                # build/start/dev/validate, count-tokens, export-vectors (lancedb→JSON)
docs/superpowers/specs/ # Specs & exec prompts (authoritative)
next.config.ts · package.json · tsconfig.json · vitest.config.ts
```

## Build & Run

- **Dev**: `pnpm run dev` (port 8080, HMR) · **Type check**: `pnpm ts-check` · **Lint**: `pnpm lint` · **Test**: `pnpm test`
- **Build**: `pnpm run build` · **Start**: `pnpm run start`
- **Tokens**: `pnpm tokens <file> [<file> ...]` (tiktoken cl100k_base; `node scripts/count-tokens.mjs <file>...`)

## Core Modules (current code shape)

- **Chat SSE** (`src/app/api/chat/route.ts`): `searching → generating → content` flow; inject RAG + 8 Skill defs into system prompt; `LLMClient.stream()`
- **RAG** (`src/lib/rag/`): semantic + sparse + HyDE → weighted fusion → doc_id dedup. Top-K=5.
- **Intent** (`src/lib/intent-classifier.ts`): 1 LLM call (was 4); `INTENT_CLASSIFIER_MODE=legacy` falls back to old chain
- **Frontend** (`src/app/page.tsx`): Welcome / Chat / Side-panel; streaming via `fetch` + `ReadableStream`; SSE status indicator
- **AI reply shape**: `【我的分析】·【框架技能+原文知识点】·【底层心法】·【开始引导】`; citation `[1][2]` enforced; confidence 0-1
- **Admin**: `/api/admin/auth` + PBKDF2 + httpOnly cookie; `NEXT_PUBLIC_ADMIN_*` deprecated (1-week fallback)

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
2. AGENTS.md is "what / how-to-use" only — no "why / how-it-works" (→ spec)
3. Collapse module descriptions to single-line bullets; no sub-steps
4. After edits, rerun `pnpm tokens AGENTS.md` and update the self-reported value

### Prohibitions
- No principles, tutorials, or API workflows in AGENTS.md (→ spec)
- No creating/modifying README.md, DESIGN.md, SPEC.md without explicit request
- No emojis in code, docs, or replies (unless user asks)
- No helper functions / abstractions for one-time operations
- No dumping spec chapters or large docs into replies
- No claiming completion before verification (`pnpm ts-check && pnpm lint && pnpm test`)

## Phase Status (ReUp v2)

| Phase | Status | Commit / Note |
|---|---|---|
| 0 — Data migration (8 Skills, skill-vectors, user-samples, book-sources) | ✅ done | `410f3a8` |
| 1 — Localize (drop coze, add DashScope Qwen client + vector-store + reranker + knowledge-base) | ✅ done | `fe5baaf` (L+V+R) · `42dfd6f` (K) · `45435c1` (C, drop coze) |
| 2 — Rebrand (rename to ReUp in code, UI, prompts) | ✅ done pending | spec §6 |
| 3 — Resume v2 P0 (parser, STAR rewriter, upload UI) | ✅ done | `ac700eb` (A + B + H1-H4 + I1) |
| 4 — Resume v2 P1 (ATS, match report) | ✅ done | `bb8a0e1` (C1-C3 + D1-D3) · `a97f13f` (H5 + I2) |
| 5 — Resume v2 P2 (iteration, export, privacy) | ✅ done | Phase 5 commit (E1-E3, F1-F3, G1-G3, H6, I4) |

Detailed task list in the spec file. Sub-agent dispatch protocol: 5+ parallel sub-agents per batch, each with goal/context/files/tests/acceptance/return-format.

---

Current `AGENTS.md` ≈ 1690 tokens (measured 2026-06-14). Rerun `pnpm tokens AGENTS.md` to update.
