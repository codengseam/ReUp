# ReUp 开发自检 Checklist

本 checklist 用于 ReUp 开发完成后的自检。配合 `.trae/rules/dev-workflow.md` 使用, 也可由 `.trae/skills/verification-before-completion/SKILL.md` 触发。

**使用方式**: 逐项检查, 标注 [PASS] 通过 / [FAIL] 未通过 / [N/A] 不适用。未通过项必须修复或说明原因。

---

## 一、代码质量

- [ ] TypeScript 类型检查通过: `pnpm ts-check` (TS strict, no implicit `any`)
- [ ] ESLint 通过: `pnpm lint:build` (无 error, warning 已处理或标注)
- [ ] 外部数据用 Zod 校验 (API 入参 / LLM 输出 / 用户上传文件解析结果)
- [ ] 无 emoji 写入代码 / 文档 / reply (除非用户明确要求)
- [ ] 无 helper / abstraction for one-time operations (避免过度工程化)
- [ ] 无 backwards-compat hack (未使用的 `_var` / re-export / `// removed` 注释)
- [ ] 改动范围最小化: 只改直接请求或明确必要的部分, 不顺手重构

## 二、RAG / Intent 质量

- [ ] RAG 管线未破坏: semantic + sparse + HyDE → weighted fusion → doc_id dedup, Top-K=5
- [ ] Intent 分类器未退化: 1 LLM call (除非 `INTENT_CLASSIFIER_MODE=legacy` 回落)
- [ ] 向量索引未漂移: 若改了 `skills/` 或 `data/`, 确认 `data/skill-vectors.json` 仍匹配 (或已 `pnpm rebuild-vectors`)
- [ ] AI reply 结构未破坏: `【我的分析】·【框架技能+原文知识点】·【底层心法】·【开始引导】`; citation `[1][2]`; confidence 0-1
- [ ] RAG safety / url-safety / cache 模块单测通过

## 三、测试

- [ ] `pnpm test` 全绿 (允许 `--passWithNoTests` 仅限纯文档/配置变更)
- [ ] 新模块 coverage >=80% (Vitest + coverage-v8)
- [ ] 新增 HTTP 调用有 mock `fetch` 测试
- [ ] 未引入 flaky test (并发 / 时序 / 网络依赖已隔离)
- [ ] 回归 bug 修复附带回归测试 (防止复发)

## 四、安全

- [ ] LLM SDK 仅 server-side 使用 (`src/app/api/**` 或 `src/lib/**`)
- [ ] 所有 LLM 调用用 `stream()`, 客户端仅消费 SSE
- [ ] `HeaderUtils.extractForwardHeaders` 在需要 header 转发的 API 已调用
- [ ] 管理员鉴证: PBKDF2 + httpOnly cookie; 不依赖 `NEXT_PUBLIC_ADMIN_*` (已废弃, 1 周 fallback)
- [ ] 敏感文件未提交: `.env` / `.env.local` / `*.db` / `data/.runtime-config.json` / `prisma/dev.db`
- [ ] 用户上传文件解析有大小 / 类型限制 (resume parser PDF/DOCX/MD/TXT)
- [ ] 无硬编码 API key / token / 密码

## 五、部署

- [ ] Docker 构建成功: `make build PROD=1` (多阶段: deps → builder → runner)
- [ ] 健康检查端点正常: `curl http://localhost:<port>/api/health` 返回 200
- [ ] 环境变量齐全: `DASHSCOPE_API_KEY` (必须) / `ZHIPU_API_KEY` (可选) / `LLM_PROVIDER`
- [ ] 端口约定: 镜像默认 7860 (魔搭), compose/fly 用 `PORT=5000` 覆盖; `src/server.ts` 只读 `process.env.PORT`
- [ ] 持久化目录: 魔搭 `/mnt/workspace` (config + db + model cache); compose/fly 用 volume 挂载 `/app/data` + `/app/.cache`
- [ ] `data/skill-vectors.json` (27MB) 已 bake 进镜像或挂载覆盖
- [ ] prisma client 已生成 (`prisma/generated`), `docker-entrypoint.sh` 会幂等 `db push`

## 六、Trae Skill 边界 (新增 / 修改 Skill 时检查)

- [ ] Skill 文件未声称能"调度 sub-agents"或"直接调用 MCP tools" (Skill 文件本身做不到)
- [ ] Skill 需要真并行时, 优先引导主 Agent 用 `Task` 工具启动 subagent (路径 C, 主路径)
- [ ] Skill 触发条件清晰, 不与 `agent-skills/` 下现有 Skill 重叠
- [ ] Skill 与 `.trae/rules/dev-workflow.md` 声明的边界一致
- [ ] 新增 Skill 后跑 `pnpm tokens AGENTS.md` 确认 token 数 < 2000

## 七、文档与规范

- [ ] AGENTS.md 未超 2000 tokens (改动后 `pnpm tokens AGENTS.md` 复核)
- [ ] AGENTS.md 只含 "what / how-to-use", 无 "why / how-it-works" (后者进 spec)
- [ ] 未创建 README.md / DESIGN.md / SPEC.md (除非用户明确要求)
- [ ] 模块描述折叠为单行 bullet, 无子步骤
- [ ] spec / plan / checklist 放对目录 (`docs/superpowers/specs/` / `plans/` / `checklists/`)

## 八、Git 提交

- [ ] 提交信息标题含中文, <=72 字符, 正文说明"为什么改"
- [ ] `python3 scripts/validate_commit_messages.py origin/master..HEAD` 通过
- [ ] 未提交未验证的"完成"声明 (先 `pnpm ts-check && pnpm lint && pnpm test`)
- [ ] 未 force push master/main
- [ ] 功能分支 rebase 过 master, 本地验证通过后再 push

## 九、LoopAgent 沉淀 (每次开发完成后必做)

- [ ] 本次改动是否暴露了开发流程的新共性问题?
- [ ] 是否需要更新 `.trae/rules/` 下的规则文件?
- [ ] 是否需要更新 `.trae/checklists/dev-checklist.md`?
- [ ] 是否需要在 `docs/superpowers/plans/` 追加一条开发沉淀记录?
- [ ] 若修复了历史遗留 bug, 是否已记录回归测试?
- [ ] 本次无新沉淀时, 明确说明"本次无新沉淀"

---

## 自检报告模板

```
## 自检报告

### 一、代码质量
- [PASS]/[FAIL] ts-check: ____
- [PASS]/[FAIL] lint:build: ____
- [PASS]/[FAIL] Zod 校验: ____
- ...

### 二、RAG / Intent 质量
- [PASS]/[FAIL] RAG 管线: ____
- [PASS]/[FAIL] Intent 分类器: ____
- ...

### 三、测试
- [PASS]/[FAIL] pnpm test: ____
- [PASS]/[FAIL] coverage >=80%: ____
- ...

### 四、安全
- [PASS]/[FAIL] LLM SDK server-side only: ____
- [PASS]/[FAIL] 敏感文件未提交: ____
- ...

### 五、部署
- [PASS]/[FAIL] Docker 构建: ____
- [PASS]/[FAIL] 健康检查: ____
- ...

### 六、Trae Skill 边界
- ...

### 七、文档与规范
- [PASS]/[FAIL] AGENTS.md < 2000 tokens: ____
- ...

### 八、Git 提交
- [PASS]/[FAIL] 提交信息规范: ____
- [PASS]/[FAIL] 未 force push master: ____
- ...

### 九、LoopAgent 沉淀
- 新共性问题: ____
- 规则更新: ____
- checklist 更新: ____

### 总结
- 通过项: __ / 总项数 __
- 未通过项及处理: ____
```
