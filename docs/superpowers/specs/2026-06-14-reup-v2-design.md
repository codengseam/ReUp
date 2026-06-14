# ReUp v2 — Brand, Localize, Resume Optimization Design

**Date**: 2026-06-14
**Status**: Draft (pending user review)
**Branch**: `local-deploy`
**Author**: AI (with user direction)
**Supersedes**: `docs/specs/2026-06-14-reup-roadmap-design.md` (will be updated after implementation)

---

## 1. Overview

### 1.1 Brand Identity

| Attribute | Value |
|---|---|
| **Name** | ReUp |
| **Tagline** | Resume + Up = 东山再起 |
| **Pitch (37 chars)** | `ReUp=Resume+Up. RAG拒幻觉，专注晋升面试，Agent自主。` |
| **Differentiator 1** | RAG no-hallucination (hybrid retrieval + citation `[1][2]`) |
| **Differentiator 2** | Vertical focus: promotion & interview (8 Skill knowledge base) |
| **Differentiator 3** | Agent autonomy (multi-turn context + visible state + feedback loop) |

### 1.2 Old Name → New Name

| Old | New | Reason |
|---|---|---|
| BOSS Agent | ReUp | Broader scope: resume + promotion (not only interview/HR) |
| Coze platform dependency | Local-first | User can deploy without external platform account |

### 1.3 Target Users

- Engineers preparing for internal promotion defense
- Job-switchers polishing resumes for AI big-company interviews
- Fresh/seasoned job seekers
- Career consultants and HR assistants

---

## 2. Goals & Non-Goals

### 2.1 In-Scope (this spec)

1. **Brand rename**: BOSS Agent → ReUp across code, docs, UI, system prompts
2. **Localize**: Remove `coze-coding-dev-sdk` and `coze-knowledge-api`; introduce local LLM + local vector store
3. **Resume optimization v2**: Document parsing, STAR rewrite, ATS adaptation, match report, iteration, export, privacy
4. **Test-driven development**: All new modules ship with Vitest tests; browser verification at every milestone

### 2.2 Out-of-Scope (deferred to future specs)

- Multi-turn mock interview (Phase 2 of original roadmap)
- LangGraph multi-agent orchestration (Phase 3)
- Chroma / Milvus (Phase 3)
- Docker / SaaS / team edition (Phase 4)
- Scanned PDF OCR (v2.1)
- JD parsing (Phase 1 follow-up)

---

## 3. Architecture

### 3.1 Tech Stack (final)

| Layer | Choice | Cost | Rationale |
|---|---|---|---|
| **Framework** | Next.js 16 (App Router) + React 19 + TS 5 strict | — | Existing |
| **UI** | shadcn/ui (Radix UI) + Tailwind 4 | — | Existing |
| **LLM Client** | Alibaba Bailian (DashScope) Qwen — OpenAI-compatible mode | Free tier (user only has this key) | User mandate: "一分钱都不想花" |
| **Embedding** | BGE-M3 (local) — primary; DashScope text-embedding-v3 — fallback | Zero (local) | Reuse existing `lancedb_data` vectors directly |
| **Reranker** | BGE-reranker-v2-m3 (local, ~250MB model) | Zero marginal | Best local Chinese reranker |
| **Vector Store** | Pre-bundled `data/skill-vectors.json` (cosine similarity in-memory) | Zero | 50 chunks → trivial scale |
| **Knowledge Base** | 8 Skills SKILL.md + optional 2 book source files | — | Direct copy from old project |
| **Tests** | Vitest 4 (≥80% coverage on new modules) | — | Existing |
| **Package Mgr** | pnpm 9+ (preinstall hook) | — | Existing |

### 3.2 Module Map

```
src/lib/
  llm-client.ts           # NEW: unified LLM abstraction (invoke/stream)
  vector-store.ts         # NEW: load vectors.json, in-memory cosine search
  knowledge-base.ts       # NEW: replace KnowledgeClient
  reranker.ts             # NEW: BGE-reranker wrapper (or simple weighted scoring)
  intent-classifier.ts    # MODIFIED: drop coze SDK, use llm-client
  rag/
    _retrieve-internal.ts # MODIFIED: replace KnowledgeClient with knowledge-base
    search.ts             # MODIFIED: same
    route.ts              # MODIFIED: replace LLMClient
    safety.ts             # MODIFIED: replace LLMClient
  resume/                 # NEW (Phase 3+)
    parser.ts             # PDF / Word / Markdown / Text parsing
    star-rewriter.ts      # STAR-based rewriting
    ats.ts                # ATS keyword extraction + coverage
    matcher.ts            # JD match report
    storage.ts            # localStorage + privacy
  coze-knowledge-api.ts   # REMOVED (or kept as optional KB backend via env var)
```

### 3.3 Data Flow (Chat — Local Mode)

```
User message
   ↓
intent-classifier (LLM call)
   ↓
rewriteQuery → embedQuery (BGE-M3 local, cached)
   ↓
hybridSearch: vector-store.cosine(queryVec, docVecs) + keyword.match
   ↓
rerank: BGE-reranker-v2-m3 (top 20 → top 5)
   ↓
buildCitations, formatContext
   ↓
systemPrompt = skill definitions + RAG context
   ↓
llm-client.stream(Qwen) → SSE
   ↓
Client receives {status, content, meta.citations, thinkingStep}
```

### 3.4 Data Flow (Resume Optimization)

```
Upload PDF/Word/MD/Text (or paste)
   ↓
parser.normalize() → ResumeDocument
   ↓
User confirms sections in preview UI
   ↓
Optional: paste/upload JD → ats.extractKeywords
   ↓
star-rewriter.rewrite(sections) → StreamRewriteResult
   ↓
matcher.compare(resume, jd) → MatchReport (if JD provided)
   ↓
UI: streaming rewrite + ATS coverage + report cards
   ↓
Optional: user clicks "重写此段" → multi-turn iteration
   ↓
Export: Markdown inline | PDF | DOCX
   ↓
Persist to localStorage (key: reup:resume:<userId>)
```

---

## 4. Phase 0 — Data Migration (Asset Reuse)

> **Goal**: Bootstrap the new project with proven assets from the old `boss-agent` project.
> **Source**: `/Users/user/Library/Mobile Documents/com~apple~CloudDocs/boss-agent`

### 4.1 Tasks

- [ ] **M1**. Copy 8 Skills `SKILL.md` files from old `skills/*/SKILL.md` → new `skills/*/SKILL.md` (verify content identical, no path changes)
- [ ] **M2**. Copy 8 Skills `test-prompts.json` files similarly
- [ ] **M3**. Run a one-shot Python script `scripts/export-vectors.py` that:
  - Connects to `lancedb_data/boss_agent_knowledge.lance/`
  - Reads all rows (id, text, retrieval_text, metadata, book, filename, doc_title, section_title, title_path, keyword_text, source_path, chunk_index, vector, sparse_vector)
  - Writes to `data/skill-vectors.json` (~50 chunks, ~5MB)
- [ ] **M4**. Copy user's real resume data from `用户数据/简历/` → `data/user-samples/resume/` (for resume v2 test data)
- [ ] **M5**. Copy user's project data from `用户数据/项目经历/` → `data/user-samples/projects/`
- [ ] **M6**. Copy `用户数据/AI大厂面试题.md` → `data/user-samples/`
- [ ] **M7**. Optional: Copy 2 book source files from `迭代开发记录/大厂晋升指南/` and `迭代开发记录/面试现场/` → `data/book-sources/` (51+31 files; for deeper RAG)

### 4.2 Acceptance

- [ ] `skills/` directory has 8 folders, each with `SKILL.md` (verified by diff)
- [ ] `data/skill-vectors.json` exists, valid JSON, vector dimension = 1024, count ≥ 50
- [ ] `data/user-samples/` has resume, projects, AI interview questions
- [ ] Sample query "晋升答辩技巧" returns top-3 relevant chunks with cosine ≥ 0.5

---

## 5. Phase 1 — Localize Architecture (Replace Coze)

> **Goal**: Remove all `coze-coding-dev-sdk` and `coze-knowledge-api` dependencies; introduce local LLM + local vector store.

### 5.1 Module: `src/lib/llm-client.ts` (NEW)

**Responsibility**: Unified LLM abstraction over OpenAI-compatible APIs.

**Interface**:
```ts
interface LLMClient {
  invoke(messages: Message[], opts?: InvokeOptions): Promise<LLMResponse>;
  stream(messages: Message[], opts?: InvokeOptions): AsyncIterable<LLMChunk>;
}
```

**Config** (env vars):
- `LLM_PROVIDER` (default: `dashscope`)
- `DASHSCOPE_API_KEY` (required)
- `DASHSCOPE_BASE_URL` (default: `https://dashscope.aliyuncs.com/compatible-mode/v1`)
- `DASHSCOPE_CHAT_MODEL` (default: `qwen-plus`)

**Tasks**:
- [ ] **L1**. Write Vitest unit tests for `llm-client` (mocked `fetch`): invoke, stream (3 chunks), error handling, timeout
- [ ] **L2**. Implement `llm-client.ts`:
  - `invoke`: POST `/v1/chat/completions` (non-stream), parse `choices[0].message.content`
  - `stream`: POST `/v1/chat/completions` (stream: true), parse SSE `data: {...}` lines, yield chunks
  - Error handling: 401/429/500 mapped to typed errors
  - Timeout: 60s default, configurable per call
- [ ] **L3**. Verify browser dev server still starts; existing chat endpoint compiles

### 5.2 Module: `src/lib/vector-store.ts` (NEW)

**Responsibility**: Load pre-bundled vectors + in-memory cosine similarity search.

**Interface**:
```ts
interface VectorStore {
  load(path: string): Promise<void>;
  search(query: number[], topK: number, opts?: SearchOptions): SearchResult[];
}
```

**Tasks**:
- [ ] **V1**. Write Vitest unit tests:
  - `load()` reads JSON, builds Float32Array index
  - `search()` returns top-K by cosine similarity
  - Filter by `category`, `skillName`, `book`
- [ ] **V2**. Implement `vector-store.ts`:
  - Lazy-load `data/skill-vectors.json` on first use
  - Cosine similarity: `dot(a,b) / (|a| * |b|)`
  - Score: `0.55 * rerank + 0.20 * dense + 0.15 * keyword + 0.10 * lexical` (match old project formula)
- [ ] **V3**. Cross-validate: top-3 results for "晋升答辩技巧" should match old `v2_retrieval_test.py` baseline

### 5.3 Module: `src/lib/reranker.ts` (NEW)

**Responsibility**: Local BGE-reranker-v2-m3 reranking.

**Decision**: Use BGE-reranker-v2-m3 via `@xenova/transformers` (CPU inference, ~1s for 20 candidates).

**Tasks**:
- [ ] **R1**. Write Vitest unit tests with mocked model:
  - Returns scored list in correct order
  - Empty input → empty output
  - Single candidate → top-1
- [ ] **R2**. Implement `reranker.ts`:
  - Lazy-load model on first use (avoids 250MB cost on cold start for tests)
  - `rerank(query: string, candidates: Chunk[], topK: number): Promise<ScoredChunk[]>`
- [ ] **R3**. Verify model loads in Node 20+ (no native binding issues)

### 5.4 Module: `src/lib/knowledge-base.ts` (NEW)

**Responsibility**: Replace `KnowledgeClient` with `vector-store` + `reranker`.

**Tasks**:
- [ ] **K1**. Write Vitest unit tests:
  - `semanticSearch(query, topK)` returns top-K chunks with scores
  - Filter by `category` (promotion / interview)
  - `hybridSearch` combines dense + keyword
- [ ] **K2**. Implement `knowledge-base.ts`:
  - `semanticSearch` → embed query (BGE-M3 local) → vector-store.search
  - `keywordSearch` → BM25-like scoring
  - `hybridSearch` → weighted merge
  - `rerank` → reranker.rerank

### 5.5 Remove Coze Dependencies

- [ ] **C1**. Replace `coze-coding-dev-sdk` import in `src/app/api/chat/route.ts` with `llm-client.ts`
- [ ] **C2**. Replace `coze-coding-dev-sdk` import in `src/lib/intent-classifier.ts` with `llm-client.ts`
- [ ] **C3**. Replace `KnowledgeClient` import in `src/lib/rag/search.ts` with `knowledge-base.semanticSearch`
- [ ] **C4**. Replace `LLMClient` import in `src/lib/rag/route.ts` with `llm-client.ts`
- [ ] **C5**. Replace `LLMClient` import in `src/lib/rag/safety.ts` with `llm-client.ts`
- [ ] **C6**. Remove `coze-knowledge-api.ts` (or keep as optional KB backend via `KB_BACKEND=coze` env var)
- [ ] **C7**. Run `pnpm ts-check && pnpm lint` → zero errors
- [ ] **C8**. Run `pnpm test` → all existing tests pass

---

## 6. Phase 2 — Brand Rename (BOSS Agent → ReUp)

> **Goal**: All references to "BOSS Agent" become "ReUp".

### 6.1 Tasks

- [ ] **B1**. `package.json`: `name: "reup"`, `version: "0.2.0"`
- [ ] **B2**. `README.md`: Replace title, intro, all mentions of "BOSS Agent" → "ReUp"
- [ ] **B3**. `AGENTS.md`: Update brand name in Overview section
- [ ] **B4**. `src/app/layout.tsx`: Update `<title>` and meta description
- [ ] **B5**. `src/app/page.tsx`: Update welcome screen brand text
- [ ] **B6**. `src/app/api/chat/route.ts`: Update `BASE_SYSTEM_PROMPT` brand line
- [ ] **B7**. `src/app/admin/page.tsx`: Update dashboard title
- [ ] **B8**. `src/components/chat/WelcomeScreen.tsx`: Update hero text
- [ ] **B9**. `data/skills.json` (if exists): Update brand metadata
- [ ] **B10**. `favicon.ico`: Replace with ReUp logo (or keep generic for now)
- [ ] **B11**. Grep for "BOSS" / "boss" / "boss-agent" / "BossAgent" across the repo → zero hits
- [ ] **B12**. Run `pnpm ts-check && pnpm lint && pnpm test` → all green
- [ ] **B13**. Browser verification: `pnpm run dev` → http://localhost:8080 → header says "ReUp"

---

## 7. Phase 3 — Resume Optimization v2 (P0: Core MVP)

> **Goal**: User can upload a PDF/Word/Markdown/Text resume → see STAR-rewritten output in 30s.
> **Source data**: User's `data/user-samples/resume/简历.md` is the test fixture.

### 7.A Document Parsing (P0, A1–A6)

- [ ] **A1**. Define `ResumeDocument` schema in `src/lib/resume/types.ts`:
  ```ts
  type ResumeDocument = {
    meta: { version: string; source: 'pdf' | 'word' | 'md' | 'text'; createdAt: string };
    basic: { name?: string; title?: string; yearsOfExperience?: number; contact?: Record<string, string> };
    experience: Array<{ company: string; role: string; period: string; bullets: string[] }>;
    projects: Array<{ name: string; period?: string; bullets: string[] }>;
    skills: string[];
    education: Array<{ school: string; degree: string; period: string }>;
    raw: string;
  };
  ```
- [ ] **A2**. Plain-text parser (lowest cost, highest coverage): `src/lib/resume/parser-text.ts`
  - Tests: parse `data/user-samples/resume/简历.md` → expect ≥4 experience entries, ≥5 projects
- [ ] **A3**. PDF parser: `pdf-parse` library, pure Node, no cloud
  - Tests: parse sample PDF (generate from Markdown) → expect text matches original
- [ ] **A4**. Word parser: `mammoth.js` library
  - Tests: parse sample DOCX → expect text extracted
- [ ] **A5**. Markdown parser: reuse `markdown-it`
  - Tests: parse `简历.md` → expect section detection (## 工作经历)
- [ ] **A6**. Normalization: `src/lib/resume/parser.ts` dispatches by MIME type → produces `ResumeDocument`
  - Tests: each source type → same `ResumeDocument` shape

### 7.B STAR Rewriting Engine (P0, B1–B4)

- [ ] **B1**. Few-shot library: 1–2 anonymized example resumes at `src/lib/resume/examples/*.json`
- [ ] **B2**. Rewrite prompt template in `src/lib/resume/prompts/star.ts`:
  - Inject 8 Skills + Few-shot
  - Output 4 sections: 我的分析 / STAR改写 / 底层心法 / 建议
- [ ] **B3**. Section-level rewrite: `src/lib/resume/star-rewriter.ts`
  - Each section independently prompted (avoid context overflow)
  - Stream chunks via `llm-client.stream`
- [ ] **B4**. SSE protocol: client uses existing `fetch` + `ReadableStream` pattern (reuse chat SSE)

**Tests**:
- [ ] `star-rewriter.test.ts`: 1 sample resume → STAR output has 4 sections, all bullets traceable to original

### 7.H UI Integration (P0, H1–H4)

- [ ] **H1**. Add "简历优化" capsule button on welcome screen (`src/app/page.tsx`)
- [ ] **H2**. Build upload/paste UI at `src/app/resume/page.tsx`:
  - Drag-drop zone
  - Paste textarea
  - Format selector (PDF/Word/MD/Text)
- [ ] **H3**. Build parse preview UI: section-by-section list with edit affordance
- [ ] **H4**. Build rewrite result UI: streaming output + 4-section cards
- [ ] **H5**. Browser verification: upload `简历.md` → see 4-section STAR rewrite in <30s

### 7.I Testing (P0, I1, I3)

- [ ] **I1**. Unit tests for parsers (A2–A5): each ≥ 80% coverage
- [ ] **I2**. E2E test: `vitest` + `playwright` or manual browser:
  - Upload `简历.md` → preview → rewrite → 4 sections appear

---

## 8. Phase 4 — Resume v2 P1 (ATS + Match Report)

### 8.C ATS Adaptation (C1–C3)

- [ ] **C1**. `src/lib/resume/ats.ts`: extract keywords from JD (user input or upload)
- [ ] **C2**. Compute keyword coverage: `hits / total * 100%`
- [ ] **C3**. Generate position suggestions: which section needs which keyword

### 8.D Match Report (D1–D3)

- [ ] **D1**. `MatchReport` schema in `src/lib/resume/types.ts`:
  ```ts
  type MatchReport = {
    strengths: Array<{ dimension: string; evidence: string }>;
    gaps: Array<{ dimension: string; severity: 'high' | 'medium' | 'low' }>;
    priorities: Array<{ rank: 1 | 2 | 3; action: string; expectedImpact: string }>;
  };
  ```
- [ ] **D2**. Dimension classification based on 8 Skills tags
- [ ] **D3**. Priority generation: LLM-based (single `llm-client.invoke` call)

### 8.H UI Integration (P1, H5)

- [ ] **H5**. Match report cards UI:
  - 优势 (Strengths) — green
  - 短板 (Gaps) — yellow/red with severity
  - 优先级建议 (Priorities) — numbered list
  - 进度条 (Coverage %) — bar chart

### 8.I Testing (P1, I2)

- [ ] **I2**. Build eval set `data/resume-eval/`: 10+ real resumes with manual STAR scoring
- [ ] **I2**. ATS accuracy benchmark: ≥85% keyword coverage on eval set

---

## 9. Phase 5 — Resume v2 P2 (Iteration + Export + Privacy)

### 9.E Multi-turn Iteration (E1–E3)

- [ ] **E1**. User clicks "重写此段" → single-section re-prompt with current text
- [ ] **E2**. Diff view: original vs. rewritten, highlighted changes
- [ ] **E3**. Feedback button: 👍 / 👎 → persist to `feedback.json` (reuse existing schema)

### 9.F Output & Export (F1–F3)

- [ ] **F1**. Markdown inline render (reuse `formatMarkdown`)
- [ ] **F2**. PDF export: `pdfkit` (server-side) or print-CSS
- [ ] **F3**. DOCX export: `docx` library

### 9.G Data & Privacy (G1–G3)

- [ ] **G1**. localStorage: `reup:resume:<userId>` — `ResumeDocument` JSON
- [ ] **G2**. File cleanup: after parse, remove uploaded file from memory
- [ ] **G3**. Privacy mode toggle: `NEXT_PUBLIC_PRIVACY_MODE=local-only` → disable any cloud upload

### 9.H UI Integration (P2, H6)

- [ ] **H6**. Export buttons: PDF / DOCX / Copy Markdown

### 9.I Testing (P2, I4)

- [ ] **I4**. E2E test (Playwright): upload → parse → rewrite → iterate → export full chain

---

## 10. Testing Strategy

### 10.1 TDD Discipline (Hard Rule)

For every new module:
1. **Write failing test first** (Vitest)
2. **Run test** → confirm it fails for the right reason
3. **Write minimum code** to pass
4. **Run test** → confirm it passes
5. **Refactor** if needed
6. **Commit** with `test:` prefix

### 10.2 Coverage Targets

| Module | Min Coverage |
|---|---|
| `llm-client.ts` | 90% |
| `vector-store.ts` | 95% |
| `reranker.ts` | 85% |
| `knowledge-base.ts` | 90% |
| `resume/parser*.ts` | 80% |
| `resume/star-rewriter.ts` | 80% |

### 10.3 Browser Verification (Hard Rule)

After every Phase (0–5):
1. `pnpm run dev` → server starts on port 8080
2. Open browser (use `browse` skill if needed) → `http://localhost:8080`
3. Verify acceptance criteria for that phase
4. If broken → fix → re-verify
5. Commit with `feat:` or `fix:` prefix

### 10.4 Required Commands

```bash
pnpm ts-check          # Type check
pnpm lint              # ESLint
pnpm test              # Vitest
pnpm run dev           # Dev server (background)
pnpm run build         # Production build
```

---

## 11. Acceptance Criteria

### 11.1 Phase 0 (Migration)
- [ ] 8 Skills copied and verified
- [ ] `data/skill-vectors.json` valid, ≥50 chunks, 1024-dim
- [ ] `data/user-samples/` populated

### 11.2 Phase 1 (Localize)
- [ ] Zero `coze-coding-dev-sdk` imports
- [ ] Zero `coze-knowledge-api` imports
- [ ] `pnpm ts-check && pnpm lint && pnpm test` all pass
- [ ] Browser: `pnpm run dev` → chat works end-to-end with DashScope Qwen
- [ ] Retrieval smoke test: "晋升答辩技巧" returns top-3 with cosine ≥ 0.5

### 11.3 Phase 2 (Rebrand)
- [ ] Zero "BOSS" / "BossAgent" / "boss-agent" mentions in code/docs/UI
- [ ] Browser: welcome screen shows "ReUp"

### 11.4 Phase 3 (Resume v2 P0)
- [ ] Upload `data/user-samples/resume/简历.md` → preview within 5s
- [ ] Trigger STAR rewrite → 4-section result within 30s
- [ ] All output bullets traceable to original (no hallucination)

### 11.5 Phase 4 (Resume v2 P1)
- [ ] ATS keyword extraction: paste sample JD → keywords identified
- [ ] Match report: shows strengths/gaps/priorities for user's resume + sample JD
- [ ] Coverage ≥ 85% on eval set

### 11.6 Phase 5 (Resume v2 P2)
- [ ] "重写此段" works on any section
- [ ] Export to PDF / DOCX / Markdown all functional
- [ ] Privacy mode toggle: setting `local-only` disables all cloud uploads
- [ ] localStorage persists across reloads

---

## 12. Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| BGE-reranker-v2-m3 model download fails | Medium | Medium | Fallback to weighted scoring (no rerank) |
| BGE-M3 has different dimension than 1024 | Low | High | Verify with sample before bundling vectors.json |
| DashScope API rate limit | Medium | Low | Client-side throttling + retry with backoff |
| PDF parser fails on scanned PDF | High (known) | Low | Out of scope (v2.1); show clear error + suggest paste-text |
| LLM hallucination in STAR rewrite | Medium | High | Test I3: every bullet must trace to original; use grounded prompt |
| Resume privacy leak | Medium | High | localStorage-first; explicit "not uploaded to cloud" badge; privacy mode toggle |
| macOS native binding issue (if we add LanceDB) | High | High | **Avoided**: we use pre-bundled JSON, no native deps |
| Test coverage drops below target | Medium | Medium | CI check: `vitest --coverage` fails if < threshold |

---

## 13. Out of Scope (Explicit)

The following are **not** in this spec. They are tracked in the original roadmap for future phases:

- ❌ Multi-turn mock interview (Phase 2)
- ❌ LangGraph multi-agent orchestration (Phase 3)
- ❌ Chroma / Milvus (Phase 3)
- ❌ Docker / SaaS / team edition (Phase 4)
- ❌ Scanned PDF OCR (v2.1)
- ❌ JD parsing (Phase 1 follow-up)
- ❌ Coze platform compatibility layer (user explicitly declined)

---

## 14. Execution Order

```
Phase 0 (M1-M7)        [Data migration]              30 min
   ↓
Phase 1 (L1-L3, V1-V3, R1-R3, K1-K2, C1-C8)  [Localize]    2-3 days
   ↓
Phase 2 (B1-B13)        [Rebrand]                     1-2 hours
   ↓
Phase 3 (A1-A6, B1-B4, H1-H4, I1, I3)        [Resume v2 P0]  3-4 days
   ↓
Phase 4 (C1-C3, D1-D3, H5, I2)               [Resume v2 P1]  2-3 days
   ↓
Phase 5 (E1-E3, F1-F3, G1-G3, H6, I4)        [Resume v2 P2]  2-3 days
```

**Total estimate**: 10-13 days of focused work, with browser verification at every phase boundary.

---

## 15. Open Questions (to resolve during implementation)

- [ ] **Q1**. BGE-reranker-v2-m3 download: bundle in repo (~250MB) or download on first use? (Recommend: download on first use to keep repo small)
- [ ] **Q2**. Should `llm-client.ts` support multiple providers at runtime, or single provider with env-var config? (Recommend: single, simpler)
- [ ] **Q3**. STAR rewriting: keep "我的分析" / "STAR 改写" / "底层心法" / "建议" 4 sections, or simplify to 2 sections for resume context? (Recommend: keep 4, matches chat format)
- [ ] **Q4**. PDF export: `pdfkit` (server, ~1MB) or print-CSS (zero deps)? (Recommend: print-CSS for v1, upgrade if quality insufficient)

---

## Appendix A: Files to Reuse from Old Project

| Old Path | New Path | Action |
|---|---|---|
| `boss-agent/skills/*/SKILL.md` | `reup/skills/*/SKILL.md` | Copy verbatim |
| `boss-agent/skills/*/test-prompts.json` | `reup/skills/*/test-prompts.json` | Copy verbatim |
| `boss-agent/lancedb_data/boss_agent_knowledge.lance/` | `reup/data/skill-vectors.json` (via export script) | Export once |
| `boss-agent/用户数据/简历/` | `reup/data/user-samples/resume/` | Copy |
| `boss-agent/用户数据/项目经历/` | `reup/data/user-samples/projects/` | Copy |
| `boss-agent/用户数据/AI大厂面试题.md` | `reup/data/user-samples/` | Copy |
| `boss-agent/迭代开发记录/大厂晋升指南/*.md` | `reup/data/book-sources/` (optional) | Copy if Phase 3 needs deeper RAG |
| `boss-agent/迭代开发记录/面试现场/*.md` | `reup/data/book-sources/` (optional) | Copy if Phase 3 needs deeper RAG |

## Appendix B: Outdated Code to Remove

- `src/lib/coze-knowledge-api.ts` (replace with `knowledge-base.ts`)
- All imports of `coze-coding-dev-sdk` (replace with `llm-client.ts`)
- Hardcoded `/Users/bytedance/...` paths in any inherited scripts (fix in new export script)

## Appendix C: Skills Schema (from old project, for reference)

Each Skill directory contains:
- `SKILL.md` — Skill definition (R-I-A-E-B structure: Reading, Interpretation, Application, Execution, Boundary)
- `test-prompts.json` — Test cases for the Skill

The 8 Skills are stable and copy-verbatim from the old project. No changes needed in Phase 0.
