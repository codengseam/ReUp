# ReUp v2 — Execution Window Startup Prompt

> **How to use**: Open a new Trae IDE chat window. Paste this entire document as your first message. The new model will have zero context but full execution knowledge.

---

## 🎯 Mission (1 sentence)

ReUp v2: brand rename (BOSS Agent → ReUp), localize (remove coze SDK), and add resume optimization v2 (P0–P1–P2). Execute on `local-deploy` branch with **strict TDD** and **browser verification**.

## 🔒 Hard Constraints (Non-Negotiable)

| Constraint | Value |
|---|---|
| LLM | Alibaba DashScope Qwen (OpenAI-compatible). User has ONLY this API key. |
| Embedding | BGE-M3 local (primary) + DashScope text-embedding-v3 (fallback) |
| Reranker | BGE-reranker-v2-m3 local (~250MB model, lazy load) |
| Vector store | Pre-bundled `data/skill-vectors.json` + in-memory cosine similarity |
| Knowledge base | 8 Skills `SKILL.md` + optional book sources from old project |
| Coze SDK | REMOVED. No `coze-coding-dev-sdk` imports anywhere after Phase 1. |
| Dual-mode coze | NO. Single track only. User explicitly declined. |
| Native DB deps | NO. No LanceDB / Chroma / HNSW runtime. JSON cache only. |
| Test framework | Vitest 4, ≥80% coverage on new modules |
| Package manager | pnpm 9 only |
| Branch | `local-deploy` (current working branch) |
| Test fixture | `data/user-samples/resume/简历.md` (user's real resume) |

## 📂 Spec Reference

**Full spec**: `docs/superpowers/specs/2026-06-14-reup-v2-design.md` (15 sections, 6 phases, 50+ tasks)

**Read this spec first** before any execution. All decisions, interfaces, and acceptance criteria are documented there.

## 🏗️ Architecture (Reference)

```
src/lib/
  llm-client.ts           # NEW: OpenAI-compatible LLM (invoke + stream)
  vector-store.ts         # NEW: load vectors.json, cosine search
  reranker.ts             # NEW: BGE-reranker wrapper
  knowledge-base.ts       # NEW: replaces KnowledgeClient
  intent-classifier.ts    # MODIFIED: drop coze SDK
  rag/
    search.ts             # MODIFIED: use knowledge-base
    route.ts              # MODIFIED: use llm-client
    safety.ts             # MODIFIED: use llm-client
  resume/                 # NEW (Phase 3+)
    parser.ts             # PDF/Word/MD/Text → ResumeDocument
    star-rewriter.ts      # STAR-based rewriting
    ats.ts                # ATS keywords
    matcher.ts            # JD match report
    storage.ts            # localStorage + privacy
  coze-knowledge-api.ts   # REMOVED
```

## 🤖 Sub-Agent Dispatch Protocol

**Concurrent limit**: 5+ sub-agents (user choice).

**Each sub-agent invocation MUST include**:

1. **Goal**: 1-sentence objective
2. **Context**: spec section reference + relevant hard constraints
3. **Files to touch**: absolute paths
4. **Tests required**: specific test files/cases to write FIRST (TDD)
5. **Acceptance criteria**: how to verify success (test pass + manual check)
6. **Return format**: structured summary (≤200 words)

**Sub-agent rules**:
- Use `general_purpose_task` for code work (TDD, refactor)
- Use `search` for codebase exploration only
- Sub-agents work in `/Users/dev/Downloads/reup` (already on `local-deploy`)
- Sub-agents should NOT commit; main thread commits with clear messages

**Dispatching pattern**:

```typescript
// Parallel: 3 sub-agents for independent modules
Task(subagent_type="general_purpose_task", description="LLM client TDD", query="...")
Task(subagent_type="general_purpose_task", description="Vector store TDD", query="...")
Task(subagent_type="general_purpose_task", description="Reranker TDD", query="...")
// Wait for all 3 to return
// Verify outputs
// Commit
```

## ✅ Quality Check Protocol

1. **After every 1-2 sub-agents**: Main thread spot-checks the diff
2. **After every Phase**: Open `http://localhost:8080` in browser, verify acceptance criteria from spec Section 11
3. **Use `browse` skill** for browser QA when visual verification needed
4. **If a sub-agent's output is wrong**: Either re-dispatch with sharper prompt, or fix directly in main thread
5. **Never trust sub-agent summary alone** for critical paths (chat endpoint, RAG search) — verify by reading code or running tests

## 📋 Execution Order (6 Phases)

### Phase 0 — Data Migration (30 min, 1 sub-agent batch)
- **M1-M2**: Copy 8 Skills (`SKILL.md` + `test-prompts.json`) from old project
- **M3**: Run Python script to export `lancedb_data/` → `data/skill-vectors.json` (1024-dim, ≥50 chunks)
- **M4-M6**: Copy user data (简历/, 项目经历/, AI大厂面试题.md) → `data/user-samples/`
- **M7** (optional): Copy 2 book sources from `迭代开发记录/` → `data/book-sources/`
- **Source path**: `/Users/dev/Library/Mobile Documents/com~apple~CloudDocs/boss-agent`

### Phase 1 — Localize (2-3 days, 5+ sub-agents)
- **L1-L3**: `src/lib/llm-client.ts` (TDD, OpenAI-compatible)
- **V1-V3**: `src/lib/vector-store.ts` (TDD, cosine search)
- **R1-R3**: `src/lib/reranker.ts` (TDD, BGE-reranker)
- **K1-K2**: `src/lib/knowledge-base.ts` (TDD, hybrid search)
- **C1-C8**: Replace coze SDK imports, run `pnpm ts-check && pnpm lint && pnpm test`

### Phase 2 — Rebrand (1-2 hours, 1 sub-agent)
- **B1-B13**: Grep+replace "BOSS Agent" / "BossAgent" / "boss-agent" → "ReUp" in code, docs, UI, prompts

### Phase 3 — Resume v2 P0 (3-4 days, 4-5 sub-agents)
- **A1-A6**: Resume parsers (PDF/Word/MD/Text) with TDD
- **B1-B4**: STAR rewriter engine (TDD, streaming)
- **H1-H4**: UI (capsule button, upload page, preview, streaming result)
- **I1, I3**: Unit tests + E2E verification

### Phase 4 — Resume v2 P1 (2-3 days, 2-3 sub-agents)
- **C1-C3**: ATS keyword extraction
- **D1-D3**: Match report (strengths/gaps/priorities)
- **H5**: Report cards UI
- **I2**: Eval set (10+ resumes) + ATS accuracy benchmark

### Phase 5 — Resume v2 P2 (2-3 days, 3 sub-agents)
- **E1-E3**: Multi-turn iteration (section rewrite, diff view, feedback)
- **F1-F3**: Export (Markdown, PDF, DOCX)
- **G1-G3**: Privacy (localStorage, file cleanup, mode toggle)
- **H6**: Export buttons
- **I4**: E2E test (Playwright)

## 🛑 Hard Rules (Apply to Every Sub-Agent)

1. **TDD First**: Test code written BEFORE implementation. Sub-agent must run test, see it fail, then implement.
2. **No coze**: After Phase 1, `coze-coding-dev-sdk` and `coze-knowledge-api` are forbidden.
3. **No emojis**: In code, docs, replies (unless user explicitly asks).
4. **English in code**: Comments, commit messages, variable names in English.
5. **Type strict**: No `any`. No implicit any. Use Zod schemas for external data.
6. **Coverage**: New modules ≥80% test coverage.
7. **No scope creep**: Do not implement Phase 2/3/4 of original roadmap (multi-turn interview, LangGraph, Docker, etc.).
8. **No premature abstraction**: 3 similar lines > premature helper. Follow project AGENTS.md.
9. **Verification before completion**: Run `pnpm ts-check && pnpm lint && pnpm test` before claiming done. Show output.
10. **Browser verification**: Every Phase end = open browser, check `http://localhost:8080`, verify spec Section 11 acceptance.

## 🚀 First Actions (Main Thread, Before Dispatching)

1. Confirm branch:
   ```bash
   git status --short && git branch --show-current
   # Expected: on local-deploy, working tree may have untracked
   ```
2. Read full spec:
   ```
   docs/superpowers/specs/2026-06-14-reup-v2-design.md
   ```
3. List old project source files for reference:
   ```bash
   ls "/Users/dev/Library/Mobile Documents/com~apple~CloudDocs/boss-agent"
   ```
4. Check test data exists (it should, copied in Phase 0):
   ```bash
   ls /Users/dev/Downloads/reup/data/user-samples/
   ```
5. Start Phase 0 sub-agent (data migration)
6. Verify Phase 0 output, then dispatch Phase 1 batch (5+ parallel sub-agents)

## 📌 Key Files to Read Before Phase 1

- `src/app/api/chat/route.ts` — current chat endpoint (coze SDK usage)
- `src/lib/rag/_retrieve-internal.ts` — current RAG orchestration
- `src/lib/intent-classifier.ts` — current intent classification
- `src/lib/models.ts` — model config (needs to drop coze refs)
- `src/lib/server-config.ts` — server config
- `src/lib/coze-knowledge-api.ts` — what to remove/replace

## 🧪 Test Pattern (Vitest)

```typescript
// Test file: src/lib/llm-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from './llm-client';

describe('LLMClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('invoke() returns parsed content', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }))
    );
    const client = new LLMClient({ apiKey: 'test' });
    const result = await client.invoke([{ role: 'user', content: 'hello' }]);
    expect(result.content).toBe('hi');
  });
});
```

## 🌍 Environment Variables (to be set in `.env.local`)

```bash
# Required
DASHSCOPE_API_KEY=sk-xxx

# Optional (defaults shown)
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_CHAT_MODEL=qwen-plus
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v3
LLM_PROVIDER=dashscope
```

## 🎬 Ready Check

Before dispatching first sub-agent, confirm:
- [ ] On `local-deploy` branch
- [ ] Spec is committed and accessible
- [ ] Old project path is readable
- [ ] `pnpm install` has been run (or confirm `node_modules` exists)
- [ ] No lingering coze-related work in progress

## 📊 Progress Tracking

After each sub-agent batch:
1. Update `docs/superpowers/specs/2026-06-14-reup-v2-design.md` with checkmarks for completed tasks
2. Commit with semantic message: `feat(phase-N): <summary>`, `fix(phase-N): <summary>`, `test(phase-N): <summary>`
3. Note any deviations from spec for later original-spec update

## ⚠️ If You Get Stuck

1. **Sub-agent returns wrong result**: Read its output fully, then either re-dispatch with sharper prompt or fix in main thread
2. **Test fails persistently**: Use `systematic-debugging` skill — hypothesize, instrument, reproduce, analyze
3. **Architecture question**: Re-read spec Section 3. If still unclear, ask user
4. **Out of context**: Re-paste this startup prompt into another fresh window
5. **Spec gap**: Note in spec with `[GAP]` marker, continue, ask user later

## 🎯 End State

When all 6 Phases complete:
- `local-deploy` branch has ReUp brand (no BOSS Agent anywhere)
- Zero coze SDK imports
- Resume v2 fully functional: upload PDF/Word/MD/Text → STAR rewrite → ATS report → export
- All tests pass
- Browser-verified at every Phase boundary
- Original spec (`docs/specs/2026-06-14-reup-roadmap-design.md`) updated to reflect what was actually built

---

**You are now ready to begin. Start with verifying branch, reading the spec, then dispatching Phase 0.**
