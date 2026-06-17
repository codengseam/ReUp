# READ ORDER: spec.md → checklist.md → contracts.md → ADR

## 1. Context

**Stack**: Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind 4 + shadcn/ui + DashScope LLM + BGE-M3 local embedding + Vitest 4
**Package mgr**: pnpm 9 only
**Test + Lint**: `pnpm test` / `pnpm ts-check` / `pnpm lint`
**Entry**: `src/app/api/chat/route.ts` (SSE chat) · `src/app/page.tsx` (frontend)
**Area**: Full project restructuring — all modules affected

## 2. Problem & User Value

**Problem**: The project is a vertical product (ReUp — career advisor for resume/interview). The underlying infrastructure (RAG + streaming chat + admin panel + skill system + UI components) is general-purpose and reusable, but currently entangled with domain-specific code. Creating a new AI chat application (e.g., novel writing assistant, enterprise customer service, knowledge Q&A) requires either forking and manually stripping domain code, or rebuilding from scratch.

**User Value**: After restructuring, developers can clone this scaffold and immediately have a working AI chat application by:
1. Dropping in their own knowledge base documents
2. Configuring skills via `skills/` directory + JSON
3. Customizing system prompt via admin panel or config file
4. Adjusting theme colors in `globals.css`

No RAG pipeline, streaming infrastructure, admin panel, or chat UI needs to be rebuilt.

## 3. Acceptance Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Clean scaffold boots | Fresh clone + `pnpm install` + `.env.local` configured | `pnpm run dev` | App starts on port 8080, shows generic welcome screen with configurable quick actions |
| Generic chat works | App running | User types a message | SSE streaming response with RAG context from configured knowledge base |
| Custom knowledge base | User places documents in `data/` directory + runs vector export | New chat query | RAG retrieves from the new knowledge base, citations reference new documents |
| Custom skills | User adds a new skill in `skills/<name>/SKILL.md` + registers in admin | Chat query matching skill triggers | Skill content injected into system prompt, AI uses skill methodology |
| Admin panel | Admin login configured | Navigate to `/admin` | All 6 tabs functional: Dashboard, Knowledge, Prompts, Model, RAG, Metadata — no domain-specific labels |
| No domain residue | Post-restructuring | `grep -r "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx"` | Zero matches in framework code (domain content only in removed/archived locations) |
| Build passes | Post-restructuring | `pnpm ts-check && pnpm lint && pnpm test` | All commands exit 0 |
| Template example works | User copies `examples/customer-service/` template | Replaces `skills/` + `data/` + config | Working customer service chatbot with minimal changes |

## 4. Edge Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| Empty knowledge base (no vectors) | Chat still works, RAG returns empty, AI responds with base system prompt only |
| No skills configured | Welcome screen shows "no skills available", chat works with system prompt only |
| Missing `.env.local` | Clear error message pointing to `.env.local.example` with required vars listed |
| Admin not configured | Admin page shows setup instructions, not crash |
| LLM API unreachable | Graceful error: "AI service temporarily unavailable" with retry button |

## 5. Invariants

- RAG pipeline: semantic + sparse + HyDE → weighted fusion → doc_id dedup → Top-K=5 (see Architect contracts)
- SSE protocol: `searching → generating → content chunks → [DONE]` (unchanged)
- Admin auth: PBKDF2 + httpOnly cookie (unchanged)
- LLM SDK server-side only, client consumes SSE (unchanged)
- All external data validated with Zod (unchanged)

## 6. Forbidden Actions

- DO NOT remove the RAG pipeline, SSE streaming, admin panel, or shadcn/ui components
- DO NOT remove the expert team prompts (`experts/`) — they are framework infrastructure
- DO NOT remove build/dev/test scripts (`scripts/`)
- DO NOT change the LLM provider integration pattern (DashScope OpenAI-compatible)
- DO NOT introduce new npm dependencies unless replacing a removed domain-specific one
- DO NOT remove `data/skill-vectors.json` — replace with empty template or generation script
- DO NOT modify `.qoder/repowiki/` content (auto-generated)
- DO NOT leave dead imports or unused references to removed modules

## 7. Acceptance Command

```bash
# Must all pass after restructuring:
pnpm ts-check && pnpm lint && pnpm test && \
grep -r "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx" -l | wc -l | xargs test 0 -eq
```

## 8. Definition of Done + Definition of Failed

### DoD (Done)
- [ ] All domain-specific modules removed (resume/, offer/, review/)
- [ ] All domain-specific API routes removed (/api/resume/*, /api/offer/*, /api/review/*)
- [ ] All domain-specific pages removed (/resume, /offer, /review/[sessionId])
- [ ] System prompt extracted to configurable template (file + admin panel editable)
- [ ] AI reply shape configurable (no hardcoded 4-block format)
- [ ] Welcome screen quick actions configurable via JSON config
- [ ] `skills/` directory has example skill template (not career-specific)
- [ ] `data/` directory has empty/template vector store + generation script
- [ ] Admin panel labels generalized (no "晋升"/"面试" references)
- [ ] README.md rewritten for scaffold positioning
- [ ] AGENTS.md rewritten for scaffold positioning
- [ ] SPEC.md rewritten for scaffold positioning
- [ ] At least 1 example template in `examples/` directory
- [ ] `pnpm ts-check && pnpm lint && pnpm test` all exit 0
- [ ] `pnpm run build` succeeds

### DoF (Failed)
- Any domain-specific string found in `src/` TypeScript/TSX files
- Build or test fails
- Dead imports referencing removed modules
- Admin panel showing career-specific content

## 9. Decision Ledger

| # | Decision | Assumption | Reason | Risk | Counter-evidence | Resolution |
|---|----------|-----------|--------|------|-----------------|------------|
| D1 | Remove resume/offer/review modules entirely (not abstract) | These are 100% domain-specific with no reusable infra | YAGNI — no current reuse path | May lose useful patterns (PDF export) | PDF export could be a plugin later | Auto: remove now, plugin later |
| D2 | Make system prompt a config file + admin editable | Every AI chat app needs custom prompts | Core scaffold requirement | Config complexity | Keep it simple: one markdown file + admin override | Auto |
| D3 | Make AI reply shape configurable | Different apps need different output formats | The 4-block format is career-specific | Template engine complexity | Use simple placeholder-based templates, not full template engine | Auto |
| D4 | Keep RAG pipeline as-is | RAG is the core value of the scaffold | Semantic+sparse+HyDE is proven | Over-engineering for simple use cases | RAG params already configurable via admin panel | Auto |
| D5 | Keep BGE-M3 local embedding | Avoid cloud dependency for embedding | Privacy + cost + already bundled | Large initial download | Provide option to use API-based embedding in config | Auto |
| D6 | Add `examples/` directory with 1 template | Developers need concrete examples to get started | Abstract docs alone are insufficient | Maintenance burden | Start with 1 example (customer-service), grow organically | Auto |
| D7 | Rename package from "reup" to "ai-chat-scaffold" | Name should reflect purpose | "reup" is product-specific | Breaking existing references | Update all references in one pass | Auto |

## 10. Top-3 Risks

1. **Scope creep**: Temptation to add new features during restructuring → Mitigation: Strict DoD, no new features
2. **Broken RAG after module removal**: Removing resume modules may break import chains → Mitigation: Run tests after each removal batch
3. **Over-abstraction**: Making everything configurable may create complexity → Mitigation: Start with file-based config, add UI config only where admin panel already supports it
