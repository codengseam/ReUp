# 通用无冲突 Git 合并提示词 (ReUp 项目)

本项目已提供两种自动化方式来守护合并质量, 推荐组合使用:

1. **Git pre-push hook**: `githooks/pre-push`
   - 安装: `bash scripts/install-git-hooks.sh`
   - 每次 `git push` 时自动运行:
     - 提醒直推 master/main 将触发魔搭空间同步部署
     - `pnpm ts-check` (TypeScript 类型检查)
     - `pnpm lint:build` (ESLint)
     - `pnpm test` (Vitest, 允许无测试通过)
     - `python3 scripts/validate_commit_messages.py` (提交信息中文规范)
   - 任一校验失败即阻止 push
   - 严格模式 `REUP_STRICT_MASTER_GUARD=1`: 禁止直推 master/main, 必须走 PR
   - 紧急绕过: `git push --no-verify`

2. **GitHub Action 同步**: `.github/workflows/sync-to-modelscope.yml`
   - 触发: push 到 `master`
   - 同步策略三级降级: fast-forward → force-with-lease → merge unrelated histories
   - 同步到魔搭空间 `codengseam/re_up` (master 分支)

---

复制以下内容直接发给 AI, 让它按这个流程执行。

```markdown
请帮我完成一次安全的 Git 合并流程, 核心要求:
1. 不覆盖 master/main 主干上已修好的代码
2. 无冲突地把当前功能分支合入主干; 如有冲突, 停下来让我确认
3. 严禁 force push 到 master/main
4. 功能分支可以 force push, 但必须先 explain why

## 第 0 步: 检查当前状态

先运行:
```bash
git status --short
git branch -vv
git log --oneline -5
```

把结果汇报给我。确认:
- 当前不在 master/main 上
- 没有 .env / .env.local / *.db / token / 密钥等敏感未跟踪文件
- 如果有未提交改动, 先停下来问我要不要提交

## 第 1 步: 整理当前工作区 (如果有未提交改动)

按功能把未提交改动拆成 1-3 个小提交, 不要一次性 `git add -A`:
```bash
# 示例: 先提交 Skill / 规则 / 脚本
git add agent-skills/ .trae/rules/ .trae/checklists/ githooks/ scripts/install-git-hooks.sh scripts/validate_commit_messages.py
git commit -m "feat: 迁移前端 Skill 并新增 git 治理层 (pre-push hook + 提交校验)"

# 再提交文档
git add docs/git-merge-prompt.md
git commit -m "docs: 新增 Git 合并流程提示词"

# 最后提交配置变更
git add .gitignore
git commit -m "chore: 允许跟踪 .trae/rules 与 .trae/checklists"
```

如果改动太小, 也可以只提交一个:
```bash
git add -A
git commit -m "feat: 简短中文描述"
```

## 第 2 步: 同步 master 并 rebase

```bash
git fetch origin
git checkout master
git pull --rebase origin master
git checkout <当前功能分支名>
git rebase master
```

如果 rebase 出现冲突:
1. 立即停止, 不要自动 continue
2. 把冲突文件列表和冲突片段展示给我
3. 等我确认策略后再继续
4. 解决后: `git add <文件>`, 然后 `git rebase --continue`
5. 绝对不要运行 `git rebase --skip`

## 第 3 步: 本地验证 (必须全部通过)

```bash
pnpm ts-check
pnpm lint:build
pnpm test --passWithNoTests
python3 scripts/validate_commit_messages.py origin/master..HEAD
```

全部通过后再推送。如果失败, 先修复问题, 不要 push。

## 第 4 步: 推送到远程功能分支

```bash
git push origin <当前功能分支名>
```

如果提示 non-fast-forward (因为 rebase 改写了历史), 使用:
```bash
git push origin <当前功能分支名> --force-with-lease
```

如果 --force-with-lease 失败 (远程分支状态未知), 可以使用 --force, 但只限于功能分支:
```bash
git push origin <当前功能分支名> --force
```

严禁:
```bash
git push origin master --force
git push origin main --force
```

## 第 5 步: 发起 Pull Request

- 在 GitHub 页面发起 PR, 目标分支选 `master`
- 标题格式: `feat:` / `fix:` / `docs:` + 简短中文描述
- 描述里写明改动范围、验证结果
- 等待 CI 通过
- 推荐用 Squash Merge, 保持主干历史干净

## 第 6 步: 合并后清理

PR 合并后:
```bash
git checkout master
git pull origin master
git branch -d <旧功能分支名>
git push origin --delete <旧功能分支名>
```

## 第 7 步: 最终验证

```bash
pnpm ts-check
pnpm lint:build
pnpm test --passWithNoTests
```

确认 master 上的代码可正常部署到魔搭空间 (push 到 master 会自动触发同步)。

请严格按以上步骤执行, 每完成一步汇报一次状态。遇到任何不确定的情况先停下来问我。
```
