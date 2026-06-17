# Checklist — Scaffold Framework Restructuring

> Business-level "is it done" check. NOT test design (see QA test-plan).

## L1: Acceptance Pass

- [ ] Fresh `pnpm install` + `pnpm run dev` starts without errors
- [ ] Chat page shows generic welcome screen (no career-specific content)
- [ ] Sending a message produces SSE streaming response
- [ ] RAG retrieval works with template/empty knowledge base
- [ ] Admin panel at `/admin` shows all tabs, no domain-specific labels
- [ ] System prompt is configurable via file + admin panel
- [ ] AI reply format is not hardcoded to 4-block career format

## L2: Existing Quality

- [ ] `pnpm ts-check` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm run build` succeeds
- [ ] No dead imports referencing removed modules
- [ ] No orphan test files for removed modules

## L3: Domain Residue Removal

- [ ] `grep -r "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx"` returns 0 matches
- [ ] Removed: `src/lib/resume/`, `src/lib/offer/`, `src/lib/review/`
- [ ] Removed: `src/app/resume/`, `src/app/offer/`, `src/app/review/`
- [ ] Removed: `src/app/api/resume/`, `src/app/api/offer/`, `src/app/api/review/`
- [ ] Removed: `src/lib/jd/`
- [ ] Removed: `data/resume-eval/`
- [ ] Removed: career-specific skills (8 skills replaced with example template)
- [ ] Removed: career-specific book sources (`data/book-sources/`)

## L4: Documentation Updated

- [ ] README.md rewritten (scaffold positioning)
- [ ] AGENTS.md rewritten (scaffold positioning)
- [ ] SPEC.md rewritten (scaffold architecture)
- [ ] package.json name changed to "ai-chat-scaffold"
- [ ] `.env.local.example` updated (no domain-specific vars)

## L5: Examples Provided

- [ ] `examples/customer-service/` directory exists
- [ ] Contains: sample skills, sample config, sample knowledge base structure
- [ ] `examples/README.md` explains how to use templates

## Forbidden Actions Check

- [ ] RAG pipeline NOT removed
- [ ] SSE streaming NOT removed
- [ ] Admin panel NOT removed
- [ ] shadcn/ui components NOT removed
- [ ] Expert team prompts (`experts/`) NOT removed
- [ ] Build scripts (`scripts/`) NOT removed
- [ ] No new npm dependencies introduced (only removals)

## Final Acceptance Command

```bash
pnpm ts-check && pnpm lint && pnpm test && \
grep -rc "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx" | grep -v ":0$" | wc -l | xargs test 0 -eq
```
