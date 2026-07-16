# ReUp 上线前核心 Checklist

> 来源：历史 bug 清单（43 条）+ 项目现状摸底报告 + 比赛优化回顾
> 用法：每次发版/提交前逐项检查，P0 全部通过方可合并；未通过项禁止上线
> 维护：新增 bug 修复后，必须在此追加对应回归项（标注 bug 编号或 PR）
> 自动化：标有 `[auto]` 的项由 `scripts/pre-release-check.sh` 自动跑；标有 `[test]` 的项由 `src/server/rag/__tests__/regression-checklist.test.ts` 覆盖

---

## P0 阻断项（必须全部通过）

### 1. 构建与类型（bug#2 #3 #4 #6 #18）

- [ ] `[auto]` `pnpm ts-check` 零错误（bug#2 Prisma client 缺失会在此暴露）
- [ ] `[auto]` `pnpm lint` 零错误，警告不阻断（bug#3 #4 隐式 any 会在此暴露）
- [ ] `[auto]` `pnpm test` 全绿，无 failed（bug#1 #18 占位测试需真实断言）
- [ ] `[auto]` `pnpm run build` 成功（Next 16 生产构建）
- [ ] chat route（`src/app/api/chat/route.ts`，715 行 SSE 入口）至少有 1 条真实测试，非占位（bug#6 零测试）
- [ ] `phase5-e2e.test.tsx` 含真实端到端断言，非 `expect(true).toBe(true)` 占位（bug#18）

### 2. RAG 检索链路（历史高频 bug：reranker 死代码 / 归一化归零 / minScore 过高 / category 不匹配 / embedder 无降级）

- [ ] `[test]` 向量数据文件 `data/skill-vectors.json` 存在且 count > 0（当前 608 条）（bug#8）
- [ ] `[test]` 向量维度为 1024（BGE-M3），非空向量（bug#8 sparse_vector 死数据）
- [ ] `[test]` `semanticSearch` 默认 minScore 不高于 0.15（当前 0.15；历史 0.2 导致漏召回）
- [ ] `[test]` `retrieve` 默认 minScore 不高于 0.15（`_retrieve-internal.ts:55` 默认 0.15）
- [ ] `[test]` `compressContext` 默认 maxChars 不低于 5000（当前 5000；历史 3000 导致原文截断）
- [ ] `[test]` category filter 中文映射覆盖 promotion/interview（晋升类/面试类）（历史 category 不匹配导致漏召回）
- [ ] `[test]` `CATEGORY_RULES` 同时覆盖晋升类（8 类）与面试类（11 类）（历史 category 不匹配）
- [ ] `[test]` `hybridSearch` 加权融合：等分时分数不被归零（保留原分，历史归一化归零 bug）
- [ ] `[test]` Top-K=5 截取生效（`retrieve` 最终结果不超过 topK）
- [ ] `[test]` 同 docId 去重保留更高分（跨 sub-query 合并）
- [ ] embedder 失败时降级到纯文本检索，不返回空数组（历史 embedder 失败无降级）
- [ ] 引文 id 绑定 docId，非位置序号 i+1（bug#12 跨轮不稳定；当前 `buildCitations` 仍用 i+1，**手动验证**）
- [ ] 置信度不被 hotQuery 放大（bug#10；检查 `assess.ts` HOT_QUERIES 不参与分数加权）

### 3. SSE 流式（历史高频 bug：[DONE] 延迟 / 状态不关闭 / 首帧 XSS）

- [ ] 答案输出完成后 `[DONE]` 在 10s 内发出（`outputGuard`/`hallucinationCheck` 有超时兜底；历史 [DONE] 延迟）
- [ ] "正在生成答案"状态在答案完成后消失（历史状态不关闭）
- [ ] 置信度告警已移除，无"转接人工"提示（比赛优化：低置信度告警已下线）
- [ ] 首帧 HTML 已消毒（dompurify 同步处理，历史首帧 XSS）
- [ ] 幻觉检查 LLM 失败时不静默放行（bug#9 fail-open；检查 `hallucination-detector.ts` 失败分支）
- [ ] 流式 token 不触发整库 localStorage 读写（bug#14；前端按 token 增量更新，非全量序列化）

### 4. PDF 简历解析（历史高频 bug：末尾信息块 / | 分隔 / 日期行 / 严重程度英文 / 空简历）

- [ ] PDF 末尾信息块（页脚/水印）被剥离，不混入正文（历史末尾信息块 bug）
- [ ] `|` 分隔的经历行正确拆分为多段（历史 | 分隔 bug）
- [ ] 日期行（2020.01-2023.02）不切断下一段经历（历史日期行分割 bug）
- [ ] 严重程度标签为中文（高/中/低），非英文 critical/medium/low（历史严重程度英文 bug）
- [ ] 空简历 / 解析失败时降级提示，不抛白屏（历史空简历不降级 bug）
- [ ] `parser-pdf.test.ts` 覆盖以上 5 个场景且全绿

### 5. 基础设施与环境（bug#2 #13 #17 #19）

- [ ] `[auto]` `.env.local` 存在且含 `DASHSCOPE_API_KEY`（缺失则 LLM 不可用）
- [ ] `[auto]` Prisma generated client 存在（`node_modules/.prisma/client` 或 `src/server/db` 生成的 client；bug#2 阻塞测试+TS）
- [ ] `[auto]` `data/skill-vectors.json` 存在且 count > 0（bug#8）
- [ ] 双 DB 层不争抢同一 SQLite 文件（bug#13；检查 `src/server/db/connection.ts` 与 `src/lib/db.ts` 路径不冲突）
- [ ] 端口统一为单一来源（bug#19 三套并存；`scripts/dev.sh` / `scripts/start.sh` / `next.config.ts` 端口一致）
- [ ] admin legacy login TODO 已清理或标记为废弃（bug#17；`NEXT_PUBLIC_ADMIN_*` 已下线）

---

## P1 重要项（强烈建议通过）

### 6. 缓存与会话（bug#11 #15）

- [ ] cache key 不使用 32-bit `simpleHash`（bug#11 碰撞风险；`cache.ts:14` 当前仍用，建议换 SHA-256 或 FNV-1a 64-bit）
- [ ] `consumeSSE` 退避重连逻辑有引用、有测试（bug#15 零引用死代码；`src/shared/utils/sse-client.ts`）

### 7. 页面入口与导航（bug#16）

- [ ] `/interview`、`/offer`、`/review` 三页面有导航入口（bug#16 三页面无入口；首页或侧栏可跳转）
- [ ] `/review/[sessionId]` 路由可正常加载历史会话

### 8. 检索质量与体验（比赛优化 + 历史）

- [ ] RAG 检索结果含原文内容，非仅框架摘要（比赛优化：原文内容缺失）
- [ ] 原文知识点与框架技能分开展示（AI 回复 shape：`【我的分析】·【框架技能+原文知识点】·【底层心法】·【开始引导】`）
- [ ] 引文 `[1][2]` 在答案正文中出现且与 citations 列表对应
- [ ] `intent-classifier` 单次 LLM 调用（历史 4 次→1 次；`INTENT_CLASSIFIER_MODE=legacy` 回退可用）

### 9. CI 与部署（历史魔搭同步 + bug#1）

- [ ] `.github/workflows/sync-to-modelscope.yml` 同步脚本可跑（历史 10+ fix 提交）
- [ ] `deployment-config` 测试与 CI 策略同步（bug#1 测试回归）
- [ ] `pnpm run build` 在 CI 环境（无 DASHSCOPE_API_KEY）不硬失败

---

## P2 改进项（已知技术债）

### 10. 代码结构（bug#5 #7 #8）

- [ ] `src/lib/` 与 `src/server/` 双代码树合并为单一 `src/server/`（bug#5；54 文件 import 旧路径，`src/lib/rag/*` 已是 re-export shim）
- [ ] BGE-reranker 死代码清理（bug#7；`reranker.ts` 宣称 rerank 实为 LLM 重排，`rerankResults` 在 search.ts 内）
- [ ] `sparse_vector` 608 条全量死数据清理或接入真实 BM25（bug#8；当前无真正稀疏检索）

### 11. 测试债务（bug#6 #18）

- [ ] chat route SSE 入口补测试（bug#6；715 行零测试）
- [ ] 主 UI（`src/app/page.tsx`）补交互测试（bug#6）
- [ ] `phase5-e2e` 替换占位断言为真实流程（bug#18）

### 12. 其他

- [ ] `src/features/` 与 `src/lib/` 重复模块去重（review/、offer/、resume/ 在两处都有）
- [ ] `admin legacy login` TODO 过期清理（bug#17）
- [ ] 三套端口配置统一（bug#19）

---

## 附：历史已修复 bug 回归区（每次发版抽样验证）

| 模块 | 历史 bug | 回归验证方式 |
|------|---------|-------------|
| 魔搭 CI | 同步脚本 10+ fix | 触发 workflow 或 dry-run |
| Prisma/DB | 表不创建、client 未导出、hostname 缺失 | `pnpm test --run` 含 db.test.ts |
| RAG 检索 | reranker 死代码、归一化归零、minScore 过高、category 不匹配、embedder 无降级 | regression-checklist.test.ts |
| SSE 流式 | [DONE] 延迟、状态不关闭、首帧 XSS | route.sse.test.ts + 手动验证 |
| PDF 解析 | 末尾信息块、\| 分隔、日期行、严重程度英文、空简历 | parser-pdf.test.ts |
| 比赛体验 | 低置信度告警、原文缺失、UI 不商业化 | 手动 + e2e |

---

## 执行命令速查

```bash
# 自动化 P0 检查（构建/类型/测试/数据完整性）
bash scripts/pre-release-check.sh

# RAG 回归测试
pnpm test src/server/rag/__tests__/regression-checklist.test.ts

# 全量测试
pnpm test

# 类型 + lint 并行
pnpm validate
```
