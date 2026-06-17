# AI 聊天助手优化规格文档

> **创建日期**: 2026-06-13
> **范围**: 前端渲染、后端 Prompt、对话管理交互

## 上下文

当前 AI 聊天助手在回答生成、技能调用展示、对话管理等方面存在体验问题。用户反馈：技能名称展示为英文 key、原文引用带作者前缀、只能单技能调用、重新生成会重复添加用户消息、缺少对话管理功能。

## 当前状态验证

| 组件 | 文件路径 | 当前状态 |
|------|----------|----------|
| 聊天页面 | `src/app/page.tsx` | 单对话模式，无左侧栏，sessionStorage 存储 |
| 消息渲染 | `src/components/chat/ChatMessage.tsx` | `formatMarkdown` 把 `\n\n` 渲染为空行，`leading-relaxed` 行高大 |
| 聊天 API | `src/app/api/chat/route.ts` | Prompt 强制要求 `[^1]` 角标和 `— 作者,《书名》` 引用 |
| 技能 Prompt | `src/lib/rag.ts` | `SKILL_PROMPTS` 中 Skill 名包含英文 key 如 `（p8-lingyu-zhuanjia）` |
| 重新生成 | `src/app/page.tsx:498-505` | `regenerate` 调用 `sendMessage` 会重复创建 userMessage |
| 清空按钮 | `src/app/page.tsx:856-877` | 隐藏在右侧滑出面板底部，需点击 Menu 才能看到 |

---

## 需求规格

### 需求1：回答内容清洗优化

**目标**: LLM 输出和前端渲染中，Skill 名称只显示中文，原文引用不显示作者和出处。

**当前行为**:
- Skill 展示: `调用的 Skill: p8-lingyu-zhuanjia`
- 原文展示: `《大厂晋升指南》, 李运华。P8需具备"532精力分配"...`

**期望行为**:
- Skill 展示: `调用的 Skill: 领域专家演进`
- 原文展示: `> P8需具备"532精力分配": 50%领域深度...`（仅原文内容，无书名作者前缀）

**实现策略**:
1. **Prompt 层**: 修改 `SKILL_RULES`，明确要求 Skill 名只用中文，禁止英文 key；禁止在引用块后附加作者行
2. **前端兜底**: `formatMarkdown` 增加后处理——正则匹配英文 Skill key 替换为中文映射表；正则清洗 `《...》, 作者` 前缀行

**验收标准**:
- [ ] 任何场景下 Skill 展示不出现英文 key（如 `p8-lingyu-zhuanjia`）
- [ ] 原文引用块内不出现 `《书名》, 作者` 前缀
- [ ] 如果知识库原文本身不带前缀，直接展示原文；如果带前缀，前端清洗后展示

---

### 需求2：技能调用数量修复

**目标**: 一个问题涉及多个 Skill 时，同时调用并展示多个 Skill 的原文知识点。

**当前行为**:
- `buildSkillPrompt` 已支持注入多个 Skill（通过 `matchedSkillNames` Set）
- 但 `SKILL_RULES` 输出格式写为单数形式，LLM 只输出一个 Skill

**期望行为**:
- 如果问题涉及多个 Skill，【框架技能+原文知识点】板块依次列出每个 Skill 的名称和对应原文

**实现策略**:
1. 修改 `SKILL_RULES` 输出格式说明：明确要求"若涉及多个 Skill，请依次列出每组 **调用的 Skill** + **原文知识点**，禁止只选一个"
2. 前端 `formatMarkdown` 确保多组 Skill 行都能被渲染为 badge（当前正则 `**调用的 Skill**` 应该已支持多组）

**验收标准**:
- [ ] 当查询跨越多个 Skill 领域时，回答中展示 2+ 个 Skill 的原文知识点
- [ ] 每个 Skill 的原文知识点独立成组，格式统一

---

### 需求3：重新生成答案功能优化

**目标**: 重新生成时保持用户原始输入不变，仅替换回答部分，不创建新的问题条目。

**当前行为**:
- `regenerate` 删掉了最后一条 assistant 消息
- 然后调用 `sendMessage`，`sendMessage` 内部又创建一条新的 userMessage 追加到列表
- 结果：messages 里出现两条连续的用户消息

**期望行为**:
- 点击重新生成后，最后一条 assistant 消息被删除（或进入加载态），user 消息保留且只出现一次
- 新生成的 assistant 消息替换原来的位置

**实现策略**:
1. 给 `sendMessage` 增加可选参数 `isRegenerating?: boolean`
2. 当 `isRegenerating = true` 时，跳过创建 userMessage，直接以当前 messages 发起 API 请求
3. `regenerate` 调用 `sendMessage(content, true)`

**验收标准**:
- [ ] 重新生成前后，messages 中 user 消息数量不变
- [ ] 重新生成后，assistant 消息替换最后一条，不追加新的 user/assistant 对
- [ ] 重新生成按钮在 assistant 消息气泡上可见

---

### 需求4：恢复清空对话记录按钮

**目标**: 用户能一键清空当前对话历史，按钮位置明显。

**当前行为**:
- 清空按钮存在于右侧滑出面板底部（`page.tsx:865-876`），需点击顶栏 Menu 图标才能看到

**期望行为**:
- 顶栏 Header 区域直接显示"清空对话"按钮（或在下拉菜单中），无需打开右侧面板

**实现策略**:
1. 在 `page.tsx` 的 header 区域（`max-w-4xl` 容器内）增加一个"清空对话"图标按钮
2. 点击后弹出确认对话框（复用已有的 `AlertDialog` 组件）
3. 确认后执行现有的 `clearMessages` 逻辑
4. 保留右侧面板中的原有按钮作为备选

**验收标准**:
- [ ] 未打开右侧面板时，顶栏可见清空按钮
- [ ] 点击清空按钮弹出确认对话框
- [ ] 确认后当前对话消息全部清除，回到欢迎页
- [ ] 右侧滑出面板中的清空按钮仍然可用

---

### 需求5：对话管理系统（仿豆包左侧栏）

**目标**: 实现多对话管理，左侧固定边栏展示对话列表，支持新建/切换/删除对话。

**当前行为**:
- 单对话模式，仅 sessionStorage 存储当前对话 messages
- 刷新页面后对话保留，但无法管理多个对话

**期望行为**（参考豆包 AI）:
- 左侧固定边栏（~260px），白色背景，阴影分隔
- 边栏顶部："新建对话"按钮（带 + 号图标）
- 边栏主体：对话列表，按时间分组（今天 / 昨天 / 更早）
- 当前对话高亮显示（背景色区分）
- 对话标题取第一条 user 消息前 10 字，默认"新对话"
- Hover 对话项显示删除按钮
- 点击对话项切换对话
- 响应式：小屏幕下左侧栏可折叠

**数据结构**:
```typescript
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
```

**存储策略**:
- localStorage key: `chat_conversations_v1`
- 当前选中对话 id: `chat_current_conversation_id`
- 页面加载时从 localStorage 恢复
- 发送消息、重新生成、清空等操作后自动保存

**实现策略**:
1. **数据层**: 新建 `src/lib/conversation-store.ts`，封装 localStorage 的 CRUD、当前对话切换、标题生成
2. **UI 层**: 新建 `src/components/chat/ConversationSidebar.tsx`，包含新建按钮、对话列表、分组、高亮、删除
3. **集成层**: 修改 `page.tsx`
   - 用 `react-resizable-panels` 或固定宽度实现左侧栏布局
   - 状态管理从 `messages` 升级为 `conversations` + `currentConversationId`
   - `sendMessage` / `clearMessages` / `regenerate` 等操作同步更新 store
   - 页面加载时从 store 初始化

**验收标准**:
- [ ] 左侧栏固定在页面左侧，宽度 ~260px
- [ ] 点击"新建对话"创建空白对话，显示欢迎页
- [ ] 对话列表按今天/昨天/更早分组
- [ ] 当前对话高亮显示
- [ ] 点击对话项切换到该对话，消息正确加载
- [ ] 发送第一条消息后，对话标题自动更新为消息前 10 字
- [ ] Hover 对话项显示删除按钮，点击删除后从列表移除
- [ ] 刷新页面后对话列表和当前对话状态恢复
- [ ] 小屏幕（<768px）左侧栏可折叠/隐藏

---

## 测试计划

### 单元测试（Vitest + React Testing Library）

| 测试文件 | 覆盖内容 |
|----------|----------|
| `src/lib/__tests__/conversation-store.test.ts` | Conversation 的 CRUD、标题生成、分组、localStorage 持久化 |
| `src/components/chat/__tests__/formatMarkdown.test.ts` | `formatMarkdown` 的换行压缩、Skill key 替换、作者前缀清洗 |
| `src/components/chat/__tests__/ChatMessage.test.tsx` | 消息渲染、重新生成按钮点击、各板块展示 |
| `src/components/chat/__tests__/ConversationSidebar.test.tsx` | 对话列表渲染、切换、删除、新建 |

### 集成验证（手动）

| 验证项 | 步骤 |
|--------|------|
| 内容清洗 | 发送测试消息，检查 Skill 名是否为中文，原文是否无作者前缀 |
| 多技能调用 | 发送涉及多个 Skill 的问题，检查是否展示多个 Skill |
| 重新生成 | 点击重新生成，检查 Network 面板无重复 user 消息，DOM 中 user 消息不翻倍 |
| 清空对话 | 点击顶栏清空按钮，确认对话框，确认后消息清空 |
| 对话管理 | 新建多个对话，发送消息，切换，删除，刷新页面验证持久化 |

### 代码质量验证

- `pnpm run ts-check` — TypeScript 无错误
- `pnpm run lint:build` — ESLint 无错误
- `pnpm test` — 所有单元测试通过

---

## 范围界定

**在范围内**:
- 后端 Prompt 修改（`route.ts`）
- 前端消息渲染优化（`ChatMessage.tsx`）
- 重新生成逻辑修复（`page.tsx`）
- 清空按钮位置调整（`page.tsx`）
- 多对话管理数据层 + UI（新建文件 + `page.tsx` 集成）
- 单元测试覆盖核心逻辑

**不在范围内**:
- 后端 RAG 检索算法优化（只改 Prompt 和展示，不改向量检索）
- 用户登录/多设备同步（仅本地 localStorage）
- 消息导出/分享功能增强（已有导出功能保持不变）
- 移动端独立 App 适配（仅响应式 Web）
- 后端 API 架构重构

---

## 文件引用汇总

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/app/api/chat/route.ts` | 修改 | Prompt 格式约束、引文标注要求 |
| `src/components/chat/ChatMessage.tsx` | 修改 | `formatMarkdown` 换行压缩、Skill 清洗、行高调整 |
| `src/app/page.tsx` | 修改 | 重新生成逻辑、清空按钮位置、对话状态管理集成 |
| `src/lib/conversation-store.ts` | 新建 | 对话数据管理（CRUD、localStorage、标题生成） |
| `src/components/chat/ConversationSidebar.tsx` | 新建 | 左侧边栏 UI（对话列表、新建、删除） |
| `src/lib/__tests__/conversation-store.test.ts` | 新建 | 对话存储单元测试 |
| `src/components/chat/__tests__/formatMarkdown.test.ts` | 新建 | Markdown 格式化单元测试 |
| `package.json` | 修改 | 添加 vitest、@testing-library/react、jsdom 等依赖 |
| `vitest.config.ts` | 新建 | Vitest 配置 |
