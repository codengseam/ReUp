# Spec 02: 简历润色 + 面试指导 (P1)

## 目标

基于 Spec 01 的分析结果，提供两个进阶功能：
1. 简历润色：根据 JD 匹配弱点 + 诊断问题，用 STAR 法重写项目经历，支持导出 PDF
2. 面试指导：模拟面试官，多轮对话，覆盖自我介绍、项目经历、技术深挖等

## 现状

| 模块 | 文件 | 状态 |
|------|------|------|
| STAR 改写 | `features/resume/star-rewriter.ts` (212行) | 已实现流式改写，但入口分散，未与匹配分析联动 |
| 简历导出 | `features/resume/export-pdf.ts` | 已实现 PDF/DOCX/MD 导出，但导出的是原始简历，不含改写内容 |
| 对话系统 | `app/api/chat/route.ts` (719行) | 已实现 SSE 流式对话 + RAG，但无面试场景专用 system prompt |
| 面试提示词 | 无 | 无面试官角色预设 |

## 用户故事

### US-4: 简历润色
> 作为求职者，在查看匹配分析后，系统基于匹配弱点自动推荐改写方案，我用 STAR 法重写项目经历，改写后可直接导出为 PDF。

**验收标准**：
- 匹配分析页面有「一键改写」按钮，点击后跳转到 STAR 改写界面
- STAR 改写界面自动填充当前简历内容，高亮标记需要改写的段落
- 改写过程流式输出，用户可实时查看
- 支持逐段改写（用户选择特定项目经历改写）
- 改写完成后支持「改写前后对比」视图
- 导出 PDF 包含改写后的简历内容

### US-5: 面试指导
> 作为求职者，我进入面试模拟模式，AI 根据我的简历和 JD 扮演面试官，进行多轮面试对话，覆盖自我介绍、项目经历、技术深挖、行为面试等。

**验收标准**：
- 独立的面试模拟对话模式（复用 chat SSE 架构）
- 面试官角色预设：基于 JD + 简历生成专属 system prompt
- 覆盖 4 类问题：
  - 自我介绍（生成个性化自我介绍草稿 + 点评）
  - 项目经历（深挖 STAR 细节，追问技术决策）
  - 技术深挖（根据 JD 技能要求出技术题）
  - 行为面试（"说说你最大的失败"类问题）
- 每轮对话后 AI 给出点评和改进建议
- 面试结束后生成「面试表现报告」

## 技术方案

### 新增 API 路由

```
POST /api/resume/rewrite-v2
  - 输入: { resume: ResumeDocument, matchReport: MatchReport, targetSections: string[] }
  - 输出: SSE stream { rewrittenResume: ResumeDocument }
  - 约束: ≤80 行

POST /api/interview/coach/start
  - 输入: { resume: ResumeDocument, jd: JDDocument | null }
  - 输出: { sessionId: string, openingQuestion: string }
  - 约束: ≤80 行

POST /api/interview/coach/chat
  - 输入: { sessionId: string, message: string }
  - 输出: SSE stream { content: string, feedback?: string }
  - 约束: ≤80 行

POST /api/interview/coach/report
  - 输入: { sessionId: string }
  - 输出: { overallScore, strengths, weaknesses, suggestions }
  - 约束: ≤80 行
```

### 新增 Service 模块

```
features/resume/rewriter/contextual-rewriter.ts  # 新增：基于匹配结果的上下文改写
features/interview/coach/system-prompt.ts         # 新增：面试官 system prompt 构建
features/interview/coach/evaluator.ts             # 新增：面试表现评估
features/interview/coach/session.ts               # 新增：面试会话管理
```

### 新增 UI 组件

```
components/shared/resume/StarRewritePanel.tsx     # 新增：STAR 改写面板
components/shared/resume/RewriteDiff.tsx          # 新增：改写前后对比
components/shared/interview/InterviewChat.tsx     # 新增：面试模拟对话
components/shared/interview/InterviewReport.tsx   # 新增：面试表现报告
```

### Prisma Schema 变更

```
model InterviewSession {
  id          String   @id @default(cuid())
  resumeId    String?
  jdText      String?
  systemPrompt String
  messages    String   // JSON: Message[]
  report      String?  // JSON: InterviewReport
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## 测试要求

| 类型 | 覆盖目标 | 关键用例 |
|------|----------|----------|
| 单元测试 | rewriter/coach 模块 ≥80% | 上下文改写逻辑、system prompt 构建、面试评估算法 |
| 集成测试 | interview coach API | 完整面试流程: 开始→多轮对话→生成报告 |
| E2E 测试 | 改写→导出流程 | 上传简历→匹配→改写→导出 PDF |

## 验收检查清单

- [ ] 匹配分析页面有「一键改写」按钮
- [ ] STAR 改写流式输出，实时可见
- [ ] 改写前后对比视图可用
- [ ] 改写后导出 PDF 包含新内容
- [ ] 面试模拟多轮对话流畅
- [ ] 面试官角色根据 JD+简历定制
- [ ] 面试结束后生成表现报告
- [ ] `pnpm ts-check && pnpm lint && pnpm test` 全绿