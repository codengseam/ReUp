# Spec 03: 面经上传 + 深度分析 (P2)

## 目标

1. 面经上传：文字/语音上传面试经历，自动识别并整理成结构化面经
2. 面经分析：结合面经 + 简历 + JD，用 AI 智能体深度解释问题并提供改进指导

## 现状

| 模块 | 文件 | 状态 |
|------|------|------|
| 语音识别 | `app/page.tsx` 中的 `createRecognition()` | 已实现 Web Speech API 语音输入，但仅用于聊天输入 |
| 面试复盘 | `features/review/` | 已实现评分+存储，但需要手动输入，不支持语音 |
| RAG 引擎 | `server/rag/` | 已实现混合检索，可供面经分析复用 |

## 用户故事

### US-6: 面经上传
> 作为求职者，我将面试经历通过文字输入或语音录音上传，系统自动识别并整理成结构化面经（公司、职位、面试轮次、问题列表、我的回答、面试结果）。

**验收标准**：
- 支持文字输入：粘贴或手打面试经历
- 支持语音上传：录音后自动转文字（复用 Web Speech API）
- 支持长音频分段识别（>30 秒自动分段）
- LLM 自动结构化：提取公司、职位、面试轮次、每个问题+回答、面试结果
- 结构化后展示在「面经卡片」中，支持编辑修正

### US-7: 面经分析
> 作为求职者，系统结合我的面经、简历、JD，用 AI 智能体深度分析面试中的问题，解释面试官的考察意图，给出改进建议。

**验收标准**：
- 面经列表页，每条面经可点击「深度分析」
- 分析结果包含：
  - 每个问题的考察意图（面试官想了解什么）
  - 我的回答评估（优点、不足）
  - 改进建议（具体的回答话术）
  - 相关知识补充（RAG 检索相关知识点）
- 综合分析：多条面经的共性问题和趋势
- 与简历/JD 联动：如果面经中暴露了简历中的弱项，自动关联

## 技术方案

### 新增 API 路由

```
POST /api/interview/transcript/upload
  - 输入: { text?: string, audio?: File, meta?: { company, position, round } }
  - 输出: { transcript: InterviewTranscript }
  - 约束: ≤80 行

POST /api/interview/transcript/analyze
  - 输入: { transcriptId: string, resumeId?: string, jdText?: string }
  - 输出: SSE stream { analysis: InterviewAnalysis }
  - 约束: ≤80 行

GET /api/interview/transcripts
  - 输出: { transcripts: InterviewTranscript[] }
  - 约束: ≤80 行
```

### 新增 Service 模块

```
features/interview/transcript/parser.ts       # 新增：面经结构化解析
features/interview/transcript/audio-split.ts  # 新增：长音频分段
features/interview/analysis/analyzer.ts       # 新增：面经深度分析
features/interview/analysis/rag-enricher.ts   # 新增：RAG 知识补充
```

### 新增 UI 组件

```
components/shared/interview/TranscriptUpload.tsx   # 新增：面经上传（文字/语音）
components/shared/interview/TranscriptCard.tsx     # 新增：面经卡片
components/shared/interview/TranscriptList.tsx     # 新增：面经列表
components/shared/interview/AnalysisPanel.tsx      # 新增：深度分析面板
```

### Prisma Schema 变更

```
model InterviewTranscript {
  id        String   @id @default(cuid())
  company   String?
  position  String?
  round     String?
  questions String   // JSON: { question, answer, interviewerNote }[]
  result    String?
  rawText   String
  createdAt DateTime @default(now())
}
```

## 测试要求

| 类型 | 覆盖目标 | 关键用例 |
|------|----------|----------|
| 单元测试 | transcript parser ≥80% | 结构化解析准确率、长音频分段逻辑 |
| 集成测试 | transcript upload API | 文字上传→解析→存储 |
| 性能测试 | 语音识别 | 30 秒音频转文字 ≤5s |

## 验收检查清单

- [ ] 文字面经粘贴后自动结构化
- [ ] 语音录制后自动转文字
- [ ] 长音频自动分段识别
- [ ] 面经卡片展示结构化内容
- [ ] 深度分析包含考察意图+回答评估+改进建议
- [ ] 综合分析多条面经的共性问题
- [ ] `pnpm ts-check && pnpm lint && pnpm test` 全绿