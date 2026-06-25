# AI Workflow Efficiency Rules

> Personal workflow rules for AI agents working on multi-phase projects.
> Extracted from ReUp v2 retrospective (2026-06-14, 11h → 8.5h with these rules).
> Categories: MUST DO (12), MUST NOT (7), SUGGESTED (9).

## MUST DO (12)

| # | Rule | Why | Verify |
|---|---|---|---|
| M1 | Data migration tasks: first command MUST be `rsync`/`cp`, never Read+Grep loop | Phase 0 took 1h 46m; single rsync should be ~20m | Check first effective command in task |
| M2 | AGENTS.md post-write: run 4-grep self-check (Phase Status, coze, BOSS, commit hash) | Today's AGENTS.md bloated 1693→1424 tokens after user QA | `grep -E "Phase Status\|coze\|BOSS\|commit hash" AGENTS.md` returns 0 |
| M3 | Each Phase: <= 2 commits | More = over-fragmented, git log unreadable | `git log --oneline \| grep "phase-N"` returns 1-2 |
| M4 | Post-write: MUST run `pnpm ts-check + pnpm lint + pnpm test` | 0-error / 100% pass = 0 regret | Acceptance report shows all green |
| M5 | Sub-agent 5+ parallel: ONLY for multi-step parallelizable work | Single-step tasks (typo fix) don't need dispatch | Ask "3+ steps, no dependencies?" before dispatching |
| M6 | Spec-first: write 1-page spec BEFORE starting any task | Prevents scope creep, AI scope drift | Spec file exists, < 200 lines |
| M7 | TDD: tests before implementation | 371/371 tests = today's 0-rework root cause | New files: `.test.ts` precedes `.ts` in git log |
| M8 | UI Phase: open `http://localhost:8080` browser to verify | Automated tests miss visual issues | Phase complete = 1-2 screenshots saved |
| M9 | Complex tasks (>= 3 steps): MUST `TodoWrite` first | Prevents scope creep, prevents forgotten steps | First tool call is TodoWrite |
| M10 | Before starting task: MUST `Read` available_skills, invoke relevant skill FIRST | Skills (test-driven-development, brainstorming, etc.) exist for a reason | First 2-3 tool calls include Skill tool |
| M11 | Before claiming Phase complete: MUST invoke `verification-before-completion` skill | Self-reporting "done" needs command evidence | Skill invoked before any completion claim |
| M12 | New features/modules: MUST invoke `test-driven-development` skill (red-green-refactor) | 371/371 test suite is the proof | `.test.ts` files exist for all `.ts` modules |

## MUST NOT (7)

| # | Rule | Anti-example |
|---|---|---|
| N1 | AGENTS.md: no historical status, no Phase Status table | History belongs in git log, not docs |
| N2 | AGENTS.md: no commit hashes | Same reason as N1 |
| N3 | Spec start: <= 1 page (~200 lines); detailed spec comes AFTER task done | Today's 3 spec docs (1035 lines) bloated startup cost |
| N4 | No Read+Grep loop to replace one shell command | AI tends to fall into read-find-edit cycles |
| N5 | No skipping tests to write implementation | Missing tests = missing acceptance = hidden landmines |
| N6 | No emojis in code / docs / replies | Project rule, hard ban |
| N7 | No skipping skills for direct static analysis or gut-feel fixes | Skills encode proven patterns; bypassing is gambling |

## SUGGESTED (9)

| # | Rule | Trigger |
|---|---|---|
| S1 | Detailed spec: write AFTER task completes, not before | Phase 0-5 closure: write full acceptance review |
| S2 | Sub-agent dispatch: use 6-field template (goal / context / files / tests / acceptance / return-format) | Every dispatch, template it |
| S3 | Refactor / data migration: do in ONE pass, not batched | When whole plan is known |
| S4 | Self-check commands: template them (e.g., `.trae/scripts/self-check.sh`) | Every Phase end runs automatically |
| S5 | Spec post-write self-review: grep `TBD\|TODO\|placeholder` | Spec complete = grep returns 0 |
| S6 | Spec done: invoke `writing-plans` to convert spec into checkable checklist | Multi-phase, multi-task specs |
| S7 | Bug investigation: invoke `systematic-debugging` | Test failure / unexpected behavior |
| S8 | Code review / security review: invoke `TRAE-code-review` / `TRAE-security-review` | Pre-PR / pre-major-change |
| S9 | Task complete: commit todo list + status to git log | Cross-session traceability |

## Quick Self-Check Commands

```bash
# M2: AGENTS.md hygiene
grep -E "Phase Status|coze|BOSS|commit hash" AGENTS.md

# M3: Phase commit count
git log --oneline | grep "phase-" | wc -l   # should be <= 2 per phase

# M4: Quality gate
pnpm ts-check && pnpm lint && pnpm test

# S5: Spec placeholder check
grep -E "TBD|TODO|placeholder|FIXME" docs/superpowers/specs/*.md
```

## Origin

Generated 2026-06-14 from ReUp v2 retrospective. 6 Phases, 50+ tasks, 371 tests,
17 commits, ~29000 lines. Without these rules, the same scope would re-take 11h;
with these rules applied, target is 8-9h (-20% time).
