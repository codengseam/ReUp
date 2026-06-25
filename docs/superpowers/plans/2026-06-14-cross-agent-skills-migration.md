# Cross-Agent Skills Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 24 superpowers workflow skills from `.trae/skills/` to `agent-skills/` and expose them to Trae + Claude Code via symlinks; zero behavior change.

**Architecture:** Single source of truth at `agent-skills/` (project root, platform-neutral). Per-IDE entry points as symlinks: `.trae/skills` (Trae) and `.claude/skills` (Claude Code). Both point to `../agent-skills`. No code changes, no build steps.

**Tech Stack:** Unix `ln -s`, `mv`, `git`, `pnpm` (regression only).

---

## File Structure

| Path | Action | Notes |
|------|--------|-------|
| `agent-skills/<24 subdirs>/SKILL.md[.tmpl]` | Create (moved from `.trae/skills/`) | Source of truth, tracked in git |
| `.trae/skills` | Replace dir with symlink | `→ ../agent-skills` (Trae entry) |
| `.claude/skills` | Create symlink | `→ ../agent-skills` (Claude Code entry) |
| `.gitignore` | Modify line 96 | `.trae/` → `.trae/*` + `!.trae/skills` |

No source code, package.json, tsconfig, or test files are touched.

---

## Task 1: Migrate `.trae/skills/*` → `agent-skills/`

**Files:**
- Create: `agent-skills/` (24 subdirs)
- Delete: `.trae/skills/` contents (replaced by symlink in Task 2)

- [ ] **Step 1.1: Verify source count**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
ls -d .trae/skills/*/ | wc -l
```

Expected: `24`

- [ ] **Step 1.2: Create `agent-skills/` and move all 24 subdirs**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
mkdir agent-skills
mv .trae/skills/* agent-skills/
ls -d agent-skills/*/ | wc -l
```

Expected: `24`

- [ ] **Step 1.3: Verify `.trae/skills/` is empty**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
ls -A .trae/skills/ | wc -l
```

Expected: `0`

- [ ] **Step 1.4: Commit migration (pre-symlink checkpoint)**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
git add agent-skills/
git commit -m "chore(agent-skills): migrate 24 superpowers skills to platform-neutral dir"
```

Expected: commit created, 24 subdirs tracked under `agent-skills/`.

---

## Task 2: Replace `.trae/skills` with symlink

**Files:**
- Delete: `.trae/skills/` (empty dir from Task 1)
- Create: `.trae/skills` (symlink → `../agent-skills`)

- [ ] **Step 2.1: Remove empty `.trae/skills/` directory**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
rmdir .trae/skills
```

Expected: no error (dir is empty, rmdir succeeds).

- [ ] **Step 2.2: Create symlink**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
ln -s ../agent-skills .trae/skills
ls -la .trae/skills
```

Expected: `.trae/skills -> ../agent-skills`

- [ ] **Step 2.3: Verify symlink resolves to 24 dirs**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
ls -d .trae/skills/*/ | wc -l
```

Expected: `24`

---

## Task 3: Create `.claude/skills` symlink

**Files:**
- Create: `.claude/skills` (symlink → `../agent-skills`)

- [ ] **Step 3.1: Ensure `.claude/` exists**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
mkdir -p .claude
```

Expected: no error.

- [ ] **Step 3.2: Create symlink**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
ln -s ../agent-skills .claude/skills
ls -la .claude/skills
```

Expected: `.claude/skills -> ../agent-skills`

- [ ] **Step 3.3: Verify symlink resolves to 24 dirs**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
ls -d .claude/skills/*/ | wc -l
```

Expected: `24`

---

## Task 4: Update `.gitignore` (selective ignore of `.trae/`)

**Files:**
- Modify: `.gitignore:96`

- [ ] **Step 4.1: Read current line 96**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
sed -n '96p' .gitignore
```

Expected: `.trae/`

- [ ] **Step 4.2: Replace line 96 with two lines**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
sed -i.bak '96c\
.trae/*\
!.trae/skills' .gitignore
sed -n '95,98p' .gitignore
```

Expected output:
```
.trae/*
!.trae/skills
```

- [ ] **Step 4.3: Remove backup file**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
rm .gitignore.bak
ls .gitignore*
```

Expected: only `.gitignore` (no `.bak`).

---

## Task 5: Verify gitignore behavior + commit symlinks

- [ ] **Step 5.1: `agent-skills/` must NOT be ignored**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
git check-ignore -v agent-skills brainstorming/SKILL.md 2>&1; echo "---"
```

Expected: empty output (both paths NOT ignored). If output shows a `.gitignore:N:pattern ...` line, the path is ignored — fail the task.

- [ ] **Step 5.2: `.trae/skills` symlink must NOT be ignored**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
git check-ignore -v .trae/skills
```

Expected: empty output (symlink is tracked).

- [ ] **Step 5.3: `.trae/settings.json` (example IDE state) MUST be ignored**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
git check-ignore -v .trae/settings.json
```

Expected output includes: `.gitignore:96:.trae/* .trae/settings.json`

- [ ] **Step 5.4: Stage symlinks + gitignore change**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
git add .trae/skills .claude/skills .gitignore
git status --short
```

Expected:
```
A  .claude/skills
M  .gitignore
A  .trae/skills
```

(Note: `.trae/skills` shows `A` even though it's a symlink — git tracks it as mode 120000.)

- [ ] **Step 5.5: Verify symlink mode in index**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
git ls-files --stage .trae/skills .claude/skills
```

Expected: each line starts with `120000` (symlink mode).

- [ ] **Step 5.6: Commit**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
git commit -m "chore(skills): add .trae/skills + .claude/skills symlinks, refine .gitignore"
```

Expected: commit created, 3 files changed (2 symlinks + .gitignore).

---

## Task 6: Regression — confirm project still builds & tests pass

- [ ] **Step 6.1: Type check**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
pnpm ts-check 2>&1 | tail -20
```

Expected: no new errors (pre-existing failures in `src/app/api/admin/config/route.test.ts` etc. are out of scope; we are only verifying this migration didn't introduce *new* ones).

- [ ] **Step 6.2: Lint**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
pnpm lint 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 6.3: Test (focused, full suite is slow)**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
pnpm test src/lib/skills-loader.test.ts 2>&1 | tail -10
```

Expected: PASS (skills-loader covers RAG-side skills, not workflow skills, but confirms no project-level breakage).

- [ ] **Step 6.4: Final cross-check of acceptance criteria**

Run:
```bash
cd /Users/dengxiongshihao/Downloads/reup
echo "AC-1 (Trae symlink): $(ls -d .trae/skills/*/ | wc -l)"
echo "AC-2 (Claude symlink): $(ls -d .claude/skills/*/ | wc -l)"
echo "AC-3 (agent-skills count): $(ls -d agent-skills/*/ | wc -l)"
echo "AC-6 (tracked): $(git ls-files agent-skills | wc -l)"
echo "AC-7 (symlink mode): $(git ls-files --stage .trae/skills | awk '{print substr($1,1,6)}')"
```

Expected output:
```
AC-1 (Trae symlink): 24
AC-2 (Claude symlink): 24
AC-3 (agent-skills count): 24
AC-6 (tracked): 24
AC-7 (symlink mode): 120000
```

(Note: AC-6 count of 24 is for subdirs; total tracked files will be higher because each subdir has SKILL.md + scripts/references/etc.)

---

## Self-Review

**Spec coverage:**
- §1 背景 — addressed by Tasks 1-3 (migrate) + Task 5.1-5.3 (verify not ignored)
- §3.1 目录重命名 → `agent-skills/` — Task 1
- §3.2 软链接 `.trae/skills` + `.claude/skills` — Tasks 2-3
- §3.3 `.gitignore` 调整 — Task 4
- §3.4 加载机制不变 — implicit (no SKILL.md content touched); verified by AC-4/AC-5 (manual in Trae/Claude Code, not automatable from CLI)
- §4 实施步骤 — Tasks 1-5 mirror the spec's steps 1-5
- §5 文件清单 — all 5 entries present in tasks
- §6 验收标准 — AC-1/AC-2/AC-3/AC-6/AC-7/AC-8 covered in Task 5.1-5.3, 6.4; AC-4/AC-5 (manual IDE checks) noted in Task 6; AC-9 (regression) in Task 6.1-6.3

**Placeholder scan:** No "TBD"/"TODO"/"similar to Task N". Each step has exact commands and expected output.

**Type consistency:** Only one "type" matters here — symlink target path. Used consistently as `../agent-skills` in Tasks 2, 3, 5.

**Gap noted:** AC-4 (Trae IDE restart, manual) and AC-5 (Claude Code open project, manual) cannot be automated from the CLI plan. The user must perform these after the plan completes; both should be ≤2 minutes.
