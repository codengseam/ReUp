# 跨 Agent 工作流技能统一加载（Cross-Agent Skills Migration）

**Date**: 2026-06-14
**Status**: Draft (pending user review)
**Branch**: `local-deploy`
**Scope**: 工作流技能（superpowers 框架，24 个目录）跨 Trae/Claude Code 共享

---

## 1. 背景

当前项目根同时存在两个"技能"目录，用途完全隔离：

| 目录 | 数量 | 来源 | 用途 | 加载方 |
|------|------|------|------|--------|
| `skills/` | 8 | 项目自维护 | 领域知识（晋升/面试框架） | RAG 编译进 `data/skills.json`（运行时只读 JSON） |
| `.trae/skills/` | 24 | superpowers 上游 | 工作流方法论（brainstorming/TDD/...） | AI agent 启动时由 IDE 注入 |

**问题**：24 个工作流技能**只在 Trae IDE 内被识别**。换到 Claude Code / Cursor / Qoder / Coze / Work Buddy 时：
- Claude Code 默认查 `.claude/skills/` → 找不到
- Cursor 默认查 `.cursor/rules/` → 找不到
- Qoder / Coze / Work Buddy 同上

**症结**：技能的唯一真源在 `.trae/skills/`，路径绑死 Trae 这一个 IDE。

**根因**：24 个技能是 superpowers 框架的目录规范，**与 Trae 命名空间无关**；Trae 只是恰好在该目录提供发现机制。

**目标**：把唯一真源迁到平台中性路径，为每个目标 IDE 留软链接入口；改动最小、零重复、零行为变化。

---

## 2. 硬约束

1. **不破坏 Trae 当前行为** —— 24 个技能在 Trae 内必须仍可被发现/调用
2. **不破坏 RAG 路径** —— `skills/` 8 个领域技能继续编译进 `data/skills.json`
3. **不污染仓库根** —— 不引入"team 必须 clone 后跑脚本"的硬依赖（方案 A 不需要脚本）
4. **macOS 优先** —— Trae 当前仅在 macOS，软链接为 Unix 语义，零额外配置
5. **零运行时开销** —— 软链接对 IDE 透明，技能元数据加载量不变（每会话仍 ~1.5K tokens）
6. **不破坏 skill frontmatter** —— 24 个 SKILL.md 的 `name` / `description` 维持现状

---

## 3. 设计

### 3.1 目录重命名（唯一真源迁移）

```
.trae/skills/   →   agent-skills/
```

**为什么不叫 `superpowers/`**：那是上游框架名；项目未来若引入非 superpowers 技能（私有 / 自研），名字会被绑架。`agent-skills/` 表达"agent 行为技能"，通用。

**为什么不隐藏（`.agent-skills/`）**：项目根已存在多个可见目录（`docs/` `data/` `scripts/` `skills/` `public/` `src/`），不藏；且 24 个技能是项目纪律的一部分，团队成员 clone 后应"看得到"。

### 3.2 软链接（多端入口）

| 软链接 | 目标 | 作用 |
|--------|------|------|
| `.trae/skills` | `../agent-skills` | **Trae IDE**：保持原行为 |
| `.claude/skills` | `../agent-skills` | **Claude Code**：项目级加载 |

**作用域外（本次不处理，写入后续任务）**：
- Cursor / Qoder / Coze / Work Buddy 的技能加载路径与机制需独立调研；调研完成后各加一条 symlink 即可（框架已支持）

### 3.3 `.gitignore` 调整

当前第 96 行：

```gitignore
.trae/
```

改为：

```gitignore
.trae/*
!.trae/skills
```

含义：
- `.trae/` 下其它 IDE 状态文件（settings、断点等）继续忽略
- `.trae/skills` 是 symlink，必须进 git（否则 fresh clone 后 Trae 找不到技能）
- `agent-skills/` **不忽略**，24 个 SKILL.md 进 git，是项目级共享工作流纪律

### 3.4 加载机制不变（关键确认）

迁移**不影响**会话级技能加载行为：

- 会话开始：IDE 扫描 `agent-skills/<name>/SKILL.md`，提取 YAML frontmatter 的 `name` + `description` → 注入 system prompt 的 `<available_skills>` 块（~1.5K tokens / 24 个）
- 调技能时：`Skill(name=...)` 工具按需加载整篇 SKILL.md
- 强约束（`using-superpowers/SKILL.md` 第 28-30 行）：**禁止用 `Read` 工具读 skill 文件**，必须走 Skill 工具

软链接对 IDE 透明，加载量与行为完全一致。

---

## 4. 实施步骤

按顺序执行，每步可独立验证：

1. **新增 `agent-skills/` 目录**，把 `.trae/skills/*` 全部迁入（24 个目录）
   ```bash
   mkdir agent-skills
   mv .trae/skills/* agent-skills/   # 或 rsync 后删源
   ```
2. **建软链接**
   ```bash
   ln -s ../agent-skills .trae/skills
   ln -s ../agent-skills .claude/skills
   ```
3. **改 `.gitignore`**：`.trae/` → `.trae/*` + `!.trae/skills`
4. **验证**
   - `ls .trae/skills/ | wc -l` → 24（与原数量一致）
   - `ls .claude/skills/ | wc -l` → 24
   - `git check-ignore -v agent-skills` → 非 ignored（已纳入版本控制）
   - `git check-ignore -v .trae/skills` → 非 ignored（symlink 自身进 git）
   - `git check-ignore -v .trae/settings.json` → ignored（IDE 状态）
5. **回归测试**
   - `pnpm ts-check && pnpm lint && pnpm test`（项目代码不应受影响，但跑一遍确认）

---

## 5. 文件清单

| 路径 | 动作 | 备注 |
|------|------|------|
| `agent-skills/*` | 新增（来自 `.trae/skills/`） | 24 技能（含 `.tmpl` template 文件） |
| `.trae/skills` | 替换为 symlink | → `../agent-skills` |
| `.claude/skills` | 新增 symlink | → `../agent-skills` |
| `.gitignore` | 第 96 行修改 | `.trae/` → `.trae/* + !.trae/skills` |
| `AGENTS.md` | 可选更新 | 增一句"工作流技能位于 `agent-skills/`，IDE 通过 symlink 发现" |

**未改动**：`src/**`、`package.json`、`tsconfig.json`、`vitest.config.ts`、`AGENTS.md` 核心结构

---

## 6. 验收标准

| ID | 标准 | 验证方法 |
|----|------|----------|
| AC-1 | `.trae/skills` 仍指向 24 个技能 | `ls .trae/skills \| wc -l` == 24 |
| AC-2 | `.claude/skills` 指向同一份源 | `ls .claude/skills \| wc -l` == 24 |
| AC-3 | `agent-skills/` 实际文件数 == 24 | `ls agent-skills \| wc -l` == 24 |
| AC-4 | Trae IDE 内启动新会话能列出所有技能 | 重启 Trae，新建对话，system prompt 包含 `<available_skills>` 全 24 项 |
| AC-5 | Claude Code 内启动项目能列出所有技能 | 在 Claude Code 打开项目，验证 system prompt 含同 24 项 |
| AC-6 | `agent-skills/` 纳入版本控制 | `git ls-files agent-skills \| wc -l` ≥ 24 |
| AC-7 | `.trae/skills` symlink 纳入版本控制 | `git ls-files --stage .trae/skills` 显示 mode `120000` |
| AC-8 | `.trae/` 其它文件仍被忽略 | `git check-ignore -v .trae/随便写一个文件` 输出 ignored |
| AC-9 | 项目代码无回归 | `pnpm ts-check && pnpm lint && pnpm test` 全部 pass |

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Windows clone 后 symlink 丢失 | 低（macOS 优先） | Trae 找不到技能 | 后续任务：方案 B prepare 脚本 |
| 软链接被 IDE 误识为"未发现" | 极低 | 技能列表为空 | AC-4/AC-5 启动期验证即可发现 |
| 24 个 SKILL.md 内嵌相对路径失效 | 极低 | 文档渲染错误 | 实测确认无内嵌相对引用（如有，迁移时同步） |
| `agent-skills/` 与 `skills/` 命名混淆 | 低 | 团队认知负担 | AGENTS.md 加一行说明 |

---

## 8. 后续任务（本次不做）

| 任务 | 内容 | 优先级 |
|------|------|--------|
| F-1 | 调研 Cursor 的 skill/rules 发现机制；按需加 `.cursor/...` 软链接 | P2 |
| F-2 | 调研 Qoder 的 skill 发现机制；按需加链接 | P2 |
| F-3 | 调研 Coze 是否支持本地技能目录导入；若不支持，评估云端 sync 方案 | P2 |
| F-4 | 调研 Work Buddy 的 skill 发现机制 | P3 |
| F-5 | 若团队扩到 Windows：实现 `scripts/setup-skills.sh`（方案 B prepare 脚本） | P3 |
| F-6 | AGENTS.md 增补"工作流技能位置"说明 | P3 |

---

## 9. 决策日志

- **不用 `superpowers/` 命名**：见 §3.1，平台中性 > 框架自描述
- **不放用户级 `~/.claude/skills/`**：项目级链接确保"项目纪律随仓库走"，不依赖个人配置
- **不引入 build/sync 步骤**：当前 24 技能静态，无动态生成需求；方案 A 足够
- **不清理 `.trae/` 其它内容**：避免改动 IDE 用户态，仅精确控制 `.trae/skills`

---

## 10. 自审（Spec Review）

- ✅ 无 TODO / TBD / 占位符
- ✅ 内部一致：步骤 ↔ 验收 ↔ 文件清单互相对齐
- ✅ 作用域清晰：本次只覆盖 Trae + Claude Code，4 个其它平台显式列入后续
- ✅ 风险列举具体：每条都有概率评估和缓解措施
- ✅ 验收可机器验证：9 条 AC 中 7 条是命令级检查
