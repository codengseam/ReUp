# 长任务启动提示词 — 脚手架改造执行

> 复制下面整段内容，粘贴到新窗口发送即可。

---

## 提示词正文

```
你正在执行一个大型代码重构任务：将 ReUp（职场顾问产品）改造为通用的 AI Chat 脚手架框架。

## 背景

当前分支 `scaffold/ai-chat-framework` 已经完成了方案设计和文档改造阶段。现在需要进入**代码执行阶段**：删除所有领域特定代码，使框架通用化。

## 必读文档（按顺序）

开始任何改动前，先读这些文件建立完整上下文：

1. `docs/ai-pm/large-20260617-scaffold-framework/spec.md` — PM 规格（做什么、验收标准、禁止事项）
2. `docs/ai-pm/large-20260617-scaffold-framework/checklist.md` — 完成检查清单
3. `docs/architecture/ADR-20260617-scaffold-framework.md` — 架构决策记录
4. `docs/architecture/contracts-20260617-scaffold-framework.md` — 模块契约（保留什么、删除什么）
5. `AGENTS.md` — 项目约定和开发规范

读完后，用 checklist.md 作为你的任务看板，逐项执行。

## 执行循环（Loop Protocol）

严格按以下循环执行，每轮只做 ONE BATCH（一组相关改动），做完验证再进下一轮：

```
LOOP:
  1. PICK  — 从 checklist 中选下一个未完成的批次
  2. SCAN  — grep/read 确认要改的文件范围，列出改动清单
  3. ACT   — 执行改动（删文件、改代码、清理引用）
  4. FIX   — 修复因删除产生的编译错误（dead imports, broken references）
  5. VERIFY — 跑 `pnpm ts-check` 确认类型通过
              跑 `pnpm lint` 确认代码规范
              跑 `pnpm test` 确认测试通过（允许删除域特定测试）
  6. CHECK — 跑域残留检查：
              grep -rc "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx" | grep -v ":0$"
  7. REPORT — 简要汇报本轮做了什么、验证结果、下一步计划
  8. LOOP  — 如果 VERIFY 全过 + CHECK 无残留 → 进下一批
             如果 VERIFY 失败 → 回退到 FIX 修复后重新 VERIFY
             如果 CHECK 有残留 → 回退到 ACT 清理后重新 VERIFY
```

## 执行批次顺序（按依赖关系排序）

| 批次 | 内容 | 验证重点 |
|------|------|---------|
| B1 | 删除 `src/lib/resume/` 整个目录（含测试） | ts-check 通过 |
| B2 | 删除 `src/lib/offer/` 整个目录（含测试） | ts-check 通过 |
| B3 | 删除 `src/lib/review/` 整个目录（含测试） | ts-check 通过 |
| B4 | 删除 `src/lib/jd/` 整个目录（含测试） | ts-check 通过 |
| B5 | 删除 `src/app/resume/` 页面 + `src/app/api/resume/` 路由 | ts-check 通过 |
| B6 | 删除 `src/app/offer/` 页面 + `src/app/api/offer/` 路由 | ts-check 通过 |
| B7 | 删除 `src/app/review/` 页面 + `src/app/api/review/` 路由 | ts-check 通过 |
| B8 | 清理 `src/app/api/chat/route.ts` 中的域特定逻辑（硬编码 system prompt、4板块格式） | ts-check + 通用化 |
| B9 | 清理 `src/app/page.tsx` 中的域特定内容（欢迎页快捷按钮、侧边栏文案） | ts-check + 通用化 |
| B10 | 清理 admin 面板中的域特定标签和常量 | ts-check + 无中文域词汇 |
| B11 | 清理 `src/lib/intent-classifier.ts` 中的域特定分类 | ts-check |
| B12 | 清理 `src/lib/prompts/blocks.ts` → 改为通用可配置模板 | ts-check |
| B13 | 删除域特定 skills（8 个职场 Skill）+ 创建 1 个通用示例 Skill 模板 | 文件检查 |
| B14 | 删除 `data/book-sources/`、`data/resume-eval/`、`data/user-samples/` | 文件检查 |
| B15 | 清理 `data/skill-vectors.json`（替换为空模板或保留结构） | ts-check |
| B16 | 清理 `data/server-config.json` 中的域特定配置 | 文件检查 |
| B17 | 更新 `.env.local.example`（去掉域特定变量） | 文件检查 |
| B18 | 创建 `examples/` 目录 + `examples/customer-service/` 示例 | 文件存在性 |
| B19 | 最终全量验证：ts-check + lint + test + 域残留检查 + build | 全部 exit 0 |

## 硬约束（MUST）

1. **每轮只做一个批次** — 不要贪多，做完验证再进下一个
2. **每轮必须跑 ts-check** — 类型错误是最常见的连锁问题
3. **删除优先于抽象** — 不要试图"通用化"域代码，直接删
4. **不引入新依赖** — 只允许删除依赖，不允许 `pnpm add`
5. **不改基础设施** — RAG 管道、SSE 流、Admin 鉴权、shadcn/ui 不动
6. **不改 experts/** — 专家团提示词是框架基础设施
7. **不改 scripts/** — 构建脚本保持不变
8. **Git 每 3 个批次 commit 一次** — 保持可回退点
9. **遇到不确定的引用** — 先 grep 全项目确认无其他引用再删

## 禁止事项（MUST NOT）

- 不要新增功能（这是剥离，不是增强）
- 不要重构保留的模块（RAG、LLM client、admin 内部不改）
- 不要改 `.qoder/` 目录下的任何文件
- 不要删除 `src/components/ui/` 下的任何组件
- 不要删除测试框架配置（vitest.config.ts、test-setup.ts）
- 不要修改 Prisma schema（除非删除的模块有专属表）

## 异常处理

- **如果 ts-check 报大量错误（>20 个）**：停下来，列出所有错误文件，按依赖关系排序后逐个修复
- **如果删除一个模块导致 5+ 个其他文件报错**：先检查是否有共享类型/工具函数被误删，如果有则保留该文件只删域特定部分
- **如果 test 中有非域特定测试失败**：检查是否误删了共享代码，优先修复而非删除测试
- **如果不确定某段代码是否域特定**：grep 全项目搜索该符号的引用，如果只被域特定模块引用则一并删除

## 完成标志

当以下条件全部满足时，任务完成：

```bash
pnpm ts-check    # exit 0
pnpm lint        # exit 0
pnpm test        # exit 0
pnpm run build   # exit 0
grep -rc "resume\|晋升\|面试\|简历\|offer\|review" src/ --include="*.ts" --include="*.tsx" | grep -v ":0$"
# 上面这行无输出（零匹配）
```

## 启动

读完文档后，从 B1 开始执行。每轮结束时告诉我做了什么和下一步计划。如果遇到需要你决策的问题，列出来等我回复，不要自行猜测。

开始吧。
```
