# 比赛体验优化设计 - 专家团评估方案

> 背景：项目已报名参赛，裁判将体验产品。目标：用户体验更佳、展示更酷炫、内容更丰富，冲击第一名。
> 日期：2026-07-15 · 作者：专家团（架构师 + PM + QA）

## 一、问题根因分析（第一性原理）

### 问题一：低置信度告警频繁触发
**现象**：频繁弹出"建议转接人工顾问 / 当前问题置信度较低..."提示框。

**根因链**：
1. `assessConfidence`（[assess.ts](file:///workspace/src/server/rag/assess.ts)）打分公式：`score = (results.length/5)*0.5 + top*0.5`，阈值 `score<0.4` 即判 `low`。
2. `hybridSearch` 对分数做 min-max 归一化，单条结果或少量结果时绝对分被压低；`minScore=0.2` 过滤 + category 过滤常使召回仅 1-3 条。
3. 召回 2 条、top=0.3 → score=0.35 → `low` → [route.ts#L698](file:///workspace/src/app/api/chat/route.ts#L698) `shouldTransferToHuman=true`。
4. [ChatMessage.tsx#L498-L531](file:///workspace/src/components/chat/ChatMessage.tsx#L498-L531) 渲染蓝色转人工框 + 点踩≥2/重试≥3 也触发，三重来源叠加，裁判体验差。

### 问题二：原文内容缺失、输出变少
**现象**：之前展示大量原文段落，现在没了；回答变短、不全面。

**根因链**：
1. `compressContext`（[search.ts#L307](file:///workspace/src/server/rag/search.ts#L307)）硬限 `maxChars=3000`，多条结果被截断（[retrieve](file:///workspace/src/server/rag/_retrieve-internal.ts#L153) 传入）。
2. system prompt 措辞"用引用块 > 展示**核心内容**"——LLM 解读为"概述"而非"逐字引用"。
3. "忠实性要求"+"不编造"规则过强，LLM 趋保守、回答趋短。
4. 低置信度场景 LLM 更倾向简短兜底。
5. `formatContext` 实际传了全文，但被 3000 字截断 + prompt 未强制逐字引用，导致"有原文但不展示"。

### 问题三：UI 不够商业化/美观
**根因链**：
1. 卡片用裸 hex 色（`#e8e8e8`/`#f6fef9`/`#fafafa`/`#f0f0f0`），未走 design token，主题切换不一致。
2. 卡片平铺、细线框、缺层次感与深度（无阴影/渐变/微交互）。
3. "思考过程"默认折叠，裁判想看推理反而需点击，增加摩擦。
4. 欢迎屏/输入区/顶栏视觉平淡，缺"酷炫"记忆点。

## 二、解决方案设计（三轨并行）

### Track A：移除低置信度告警（后端 + 前端）
**目标**：裁判全程不再看到任何"低置信度/转人工"提示。

**改动**：
- [route.ts#L695-L708](file:///workspace/src/app/api/chat/route.ts#L695-L708)：
  - 保留 `assessConfidence` 后台计算（用于 analytics/日志，不删函数）。
  - **不再下发** `transferToHuman` / `transferReason` / `conversationContext` 字段。
  - `confidence`/`confidenceScore` 仍下发，但前端不展示 low/medium 徽标。
- [ChatMessage.tsx](file:///workspace/src/components/chat/ChatMessage.tsx)：
  - 删除 L415-L422 置信度徽标块。
  - 删除 L498-L507 `transferToHuman` 转人工提示框。
  - 删除 L510-L519 点踩≥2 转人工块。
  - 删除 L522-L531 重试≥3 转人工块。
- [page.tsx#L538-L547](file:///workspace/src/app/page.tsx#L538-L547)：删除 `transferToHuman` SSE 处理分支（保留字段读取不报错即可，或一并清理）。
- Message 类型中 `transferToHuman`/`transferReason` 字段保留（向后兼容已落盘对话），仅不渲染。

**不改**：`assess.ts` 评分逻辑、`hallucinationCheck`（幻觉校验是另一回事，保留）。

### Track B：恢复原文内容丰富度（后端 prompt + 检索参数）
**目标**：每条回答在"框架技能+原文知识点"板块展示 2-4 段原文逐字引用，回答更全面。

**改动**：
- [search.ts#L307](file:///workspace/src/server/rag/search.ts#L307)：`compressContext` 默认 `maxChars` 3000 → **5000**（[retrieve](file:///workspace/src/server/rag/_retrieve-internal.ts#L56) 的 `params?.maxChars ?? 3000` 同步改为 5000）。
- [search.ts#L27](file:///workspace/src/server/rag/search.ts#L27)：`semanticSearch` 默认 `minScore` 0.2 → **0.15**（[retrieve#L55](file:///workspace/src/server/rag/_retrieve-internal.ts#L55) 同步）。
- [route.ts BASE_SYSTEM_PROMPT / SKILL_RULES](file:///workspace/src/app/api/chat/route.ts#L48-L177)：
  - "展示核心内容" → 改为"**逐字引用**参考资料中的关键原文段落（每段 50-150 字），用 `>` 引用块展示，保留原文措辞，不要改写或概述"。
  - 强化"全面性"要求：每个调用的 Skill 必须配 1-2 段原文引用；若参考资料 relevant 则必须引用，不得仅概述。
  - 调整"忠实性"措辞：忠实=不编造，但鼓励**忠实引用**原文（引用不算编造）。
  - 增加最小篇幅软引导：四大板块需充实，避免一两句带过。
- `buildCitations`（[suggestions.ts#L21](file:///workspace/src/server/rag/suggestions.ts#L21)）：citation 抽屉内容 200 → **400** 字，让裁判点开引文看到更多原文。

**不改**：RAG 检索主流程、rerank、HyDE（保持性能）。

### Track C：UI 商业化重设计（前端，Linear/Vercel 现代 SaaS 风）
**目标**：视觉更高级、有记忆点、专业且不花哨。

**改动**（全部走 design token，禁用裸 hex）：
1. **全局色彩/阴影升级**（[globals.css](file:///workspace/src/app/globals.css)）：
   - 新增 token：`--shadow-card`/`--shadow-float` 已有，补 `--surface-gradient`（翡翠绿微渐变背景）。
   - body 背景由纯白 → 极浅翡翠绿渐变 `linear-gradient(180deg, #f8fdfb 0%, #ffffff 100%)`，营造层次。
2. **顶栏**（[page.tsx header](file:///workspace/src/app/page.tsx#L1112-L1151)）：加 `backdrop-blur` 玻璃质感 + 底部细线，logo 加微渐变阴影。
3. **消息卡片**（[ChatMessage.tsx renderAIContent](file:///workspace/src/components/chat/ChatMessage.tsx#L196)）：
   - 卡片 `border-[#e8e8e8]` → `border-border shadow-card`，hover 升 `shadow-float`。
   - 4 板块卡片头部 icon 容器加 `shadow-sm`，标题层级加重。
   - "我的分析"默认展开（裁判要看推理），保留可折叠。
4. **思考面板**（[ThinkingPanel](file:///workspace/src/components/chat/ChatMessage.tsx#L13)）：默认 `isCollapsed=false`（裁判可见推理链），时间线节点加微发光。
5. **欢迎屏**（WelcomeScreen）：重设计 hero 区——大标题渐变文字 + 副标题 + 快捷入口卡片网格（带 icon + hover 上浮）。
6. **输入区**（ChatInput）：圆角胶囊 + focus 翡翠绿发光环 + 发送按钮渐变。
7. **用户/AI 气泡**：AI 头像加渐变环，用户气泡渐变翡翠绿。
8. **引文角标**：`[1]` 角标加 hover 上浮 + 翡翠绿背景药丸。
9. **滚动条**美化、过渡动画统一 `duration-200`。

**不改**：组件结构、SSE 流、多对话逻辑、语音输入。

## 三、并行执行边界（无共享状态冲突）

| Track | 改动文件 | 与其他 Track 交集 |
|-------|---------|------------------|
| A | route.ts(后端段), ChatMessage.tsx(告警段), page.tsx(SSE分支) | 与 B 都改 route.ts，**不同函数段**；与 C 都改 ChatMessage.tsx，**不同行段** |
| B | search.ts, _retrieve-internal.ts, route.ts(prompt段), suggestions.ts | 与 A 在 route.ts 不同段 |
| C | globals.css, page.tsx(样式段), ChatMessage.tsx(样式段), WelcomeScreen.tsx, ChatInput.tsx | 与 A/B 在 ChatMessage.tsx/route.ts 不同段 |

**冲突缓解**：route.ts 由 Track A 改后端置信度段、Track B 改 prompt 段——分两段不相邻；ChatMessage.tsx 由 Track A 删告警块、Track C 改卡片样式——不同区域。三轨可真正并行。

## 四、验收标准

1. **Track A**：任意问题（含冷门/短问题）全程无"低置信度/转人工"提示；`pnpm test` 中 assess 相关用例仍绿（函数保留）。
2. **Track B**：典型问题（如"我绩效很好为什么没晋升"）回答含 ≥2 段 `>` 原文引用块；回答明显更长更全；引文抽屉显示 400 字。
3. **Track C**：首屏视觉有"高级感"（渐变/阴影/留白）；无裸 hex 色；思考面板默认展开；移动端不破。
4. **全局**：`pnpm ts-check && pnpm lint && pnpm test` 全绿；无回归。

## 五、质检计划（专家团 loop）

1. 三轨并行实现完成后，跑 `pnpm ts-check && pnpm lint && pnpm test`。
2. 视觉走查：`pnpm run dev` 启动，检查欢迎屏/对话/引文/思考面板/移动端。
3. 内容走查：问 3 个典型问题，确认原文引用丰富、无低置信度告警。
4. 发现问题 → 修复 → 复验（loop），直至全绿。
