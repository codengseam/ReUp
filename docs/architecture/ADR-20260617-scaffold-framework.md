# ADR-20260617-scaffold-framework

## 1. Context

**Problem**: ReUp is a vertical career-advisor product. Its infrastructure (RAG + streaming chat + admin + skills + UI) is general-purpose but entangled with domain code. We need a reusable AI Chat scaffold.

**Hard constraints**:
- Must pass `pnpm ts-check && pnpm lint && pnpm test` after restructuring
- Zero domain-specific residue in `src/` TypeScript/TSX files
- Must not break the RAG pipeline, SSE streaming, or admin panel

**Soft constraints**:
- Minimize restructuring scope (remove > abstract > rebuild)
- Keep existing tech stack unchanged
- Provide at least 1 example template for new projects

## 2. Decision

Restructure the project from a vertical product to a general-purpose AI Chat scaffold by: (1) removing all domain-specific modules (resume, offer, review, JD matching), (2) making system prompt and reply format configurable, (3) replacing career-specific skills/knowledge with generic templates, (4) rewriting all documentation for scaffold positioning.

## 3. Options

| Option | Pros | Cons | Cost | Reversibility |
|--------|------|------|------|--------------|
| A: Strip domain code (chosen) | Clean separation, minimal abstraction overhead, fast | Lose resume/offer/review code permanently | Low (1-2 days) | High (git history preserves everything) |
| B: Abstract into plugins | Reusable plugin system, domain code preserved as plugins | High complexity, over-engineering for 1 use case, plugin system design TBD | High (5+ days) | Medium (plugin system hard to undo) |
| C: Fork and template | Original product preserved, clean fork | Two repos to maintain, divergence risk | Medium (2-3 days) | High |

## 4. Why Rejected

- **Option B (Plugin system)**: YAGNI. We have exactly 1 domain to remove. Building a plugin system for hypothetical future domains is over-engineering. If plugins are needed later, they can be extracted from git history.
- **Option C (Fork and template)**: Creates maintenance burden of two repos. The original product (ReUp) can always be recreated by adding domain code to the scaffold.

## 5. Non-Goals

- Building a plugin/extension system
- Creating a CLI tool for scaffold initialization (`npx create-ai-chat-app`)
- Supporting multiple LLM providers simultaneously (DashScope only)
- Multi-tenant support
- Real-time collaboration features

## 6. Risks (top-3)

1. **Import chain breakage**: Removing resume/offer/review modules may leave dangling imports in shared code → Mitigation: Run `pnpm ts-check` after each removal batch; fix before proceeding
2. **Config over-engineering**: Making everything configurable may add complexity without clear benefit → Mitigation: File-based config first (markdown file for prompt, JSON for welcome actions), admin panel only where it already exists
3. **Documentation staleness**: Rewriting README/AGENTS/SPEC now, but code will continue evolving → Mitigation: Keep docs high-level, reference code as source of truth

## 7. Verification

```bash
# After each phase:
pnpm ts-check   # Type safety
pnpm lint        # Code quality
pnpm test        # Existing tests (removed module tests excluded)

# After all phases:
grep -rc "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx" | grep -v ":0$"
# Expected: empty output (zero matches)
```
