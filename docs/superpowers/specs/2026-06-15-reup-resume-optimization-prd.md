# ReUp 简历评估与优化模块 — 产品需求文档（PRD）

**版本**: V2.0  
**日期**: 2026-06-15  
**分支**: `local-deploy`  
**状态**: Phase 1 已完成 A-I，J 待实现；Phase 2-3 规划中  

---

## 1. 产品概述

### 1.1 产品定位

ReUp = Resume + Up，专注帮助用户优化简历以应对晋升答辩和求职面试。核心差异化：

1. **RAG 拒幻觉**：混合检索 + 引用标注 `[1][2]`，所有建议可溯源
2. **垂直聚焦**：8 大 Skill 知识库（晋升底层逻辑、亮点挖掘、STAR 法则等）
3. **Agent 自主**：多轮上下文 + 可见状态 + 反馈闭环

### 1.2 目标用户

- 准备内部晋升答辩的工程师
- 跳槽准备 AI 大厂面试的求职者
- 应届生 / 经验求职者
- 职业顾问和 HR 助手

### 1.3 使用流程

```
上传简历(PDF/Word/Markdown/文本)
    ↓
解析为结构化数据（ResumeDocument）
    ↓
STAR 智能改写（4 段流式输出）
    ↓
填写目标 JD → 生成匹配报告
    ↓
单段迭代优化 → 导出最终简历
```

---

## 2. 功能模块总览

| 模块 | 子功能 | 状态 | 优先级 |
|------|--------|------|--------|
| **简历解析** | PDF 解析 | ✅ 完成 | P0 |
| | Word 解析 | ✅ 完成 | P0 |
| | Markdown 解析 | ✅ 完成 | P0 |
| | 纯文本解析 | ✅ 完成 | P0 |
| | 标题字典扩充 | ✅ 完成 | P0 |
| | 文末信息块识别 | ✅ 完成 | P0 |
| | Pipe 分隔多 key | ✅ 完成 | P0 |
| | 技能长句拆分 | ✅ 完成 | P0 |
| | 段落式经验切分 | ✅ 完成 | P0 |
| | 粘连字段解析 | ✅ 完成 | P0 |
| | **LLM 兜底** | ❌ 待实现 | P1 |
| **ATS 评估** | JD 关键词提取（TF/LLM 双路径） | ✅ 完成 | P0 |
| | 覆盖率计算 | ✅ 完成 | P0 |
| | 缺失关键词推荐 | ✅ 完成 | P0 |
| | 单字 CJK 去噪 | ✅ 完成 | P1 |
| | **JD 结构解析** | ❌ 待实现 | P1 |
| **匹配报告** | 覆盖率可视化（Progress 组件） | ✅ 完成 | P0 |
| | 优势维度分析 | ✅ 完成 | P0 |
| | 短板维度分析 | ✅ 完成 | P0 |
| | 优先级建议（LLM 生成） | ✅ 完成 | P0 |
| | Severity 中文标签 | ✅ 完成 | P0 |
| | 空简历降级提示 | ✅ 完成 | P1 |
| | **历史对比** | ❌ 待实现 | P2 |
| **STAR 改写** | 4 段流式输出（分析/改写/心法/建议） | ✅ 完成 | P0 |
| | 跨段泄漏过滤 | ✅ 完成 | P0 |
| | 空简历占位 | ✅ 完成 | P0 |
| | 单段迭代重写 | ✅ 完成 | P0 |
| | **改写历史对比** | ❌ 待实现 | P2 |
| **导出** | Markdown 导出 | ✅ 完成 | P0 |
| | **PDF 导出** | ❌ 待实现 | P2 |
| | **Word 导出** | ❌ 待实现 | P2 |
| **存储** | localStorage 持久化 | ✅ 完成 | P0 |
| | 多简历列表 | ✅ 完成（基础） | P2 |
| | **版本管理** | ❌ 待实现 | P2 |
| **隐私** | 本地模式开关 | ✅ 完成 | P0 |
| | 强制本地模式（环境变量） | ✅ 完成 | P0 |
| **管理配置** | Prompt 运行时覆盖 | ✅ 完成 | P1 |
| | 运行时参数配置 | ✅ 完成 | P1 |
| **Chat 联动** | RAG 检索（4 层） | ✅ 完成 | P0 |
| | **Chat 引用简历** | ❌ 待实现 | P2 |

---

## 3. 核心数据模型

### 3.1 ResumeDocument

```typescript
interface ResumeDocument {
  meta: {
    version: string;      // 'reup.v2.phase3'
    source: 'pdf' | 'word' | 'md' | 'text' | 'pdf+llm';
    createdAt: string;    // ISO 8601
  };
  basic: {
    name?: string;
    title?: string;
    city?: string;
    yearsOfExperience?: number;
    contact?: Record<string, string>;
  };
  experience: Array<{
    company: string;
    role: string;
    period: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    period?: string;
    bullets: string[];
  }>;
  skills: string[];
  education: Array<{
    school: string;
    degree: string;
    period: string;
    notes?: string[];
  }>;
  raw: string;  // 原始文本备份
}
```

### 3.2 ATSResult

```typescript
interface ATSResult {
  jdKeywords: Array<{ term: string; weight: number }>;
  coverage: { hits: number; total: number; percentage: number };
  missing: Array<{ term: string; suggestedSection: 'basic' | 'experience' | 'projects' | 'skills' }>;
}
```

### 3.3 MatchReport

```typescript
interface MatchReport {
  strengths: Array<{ dimension: string; evidence: string }>;
  gaps: Array<{ dimension: string; severity: 'high' | 'medium' | 'low' }>;
  priorities: Array<{ rank: 1 | 2 | 3; action: string; expectedImpact: string }>;
}
```

---

## 4. 模块详细需求

### 4.1 简历解析模块

#### 4.1.1 输入支持

| 格式 | 输入方式 | 解析路径 |
|------|----------|----------|
| PDF | 文件上传 | `pdf-parse` → 纯文本 → `parseTextResume` |
| Word | 文件上传 | `mammoth` → 纯文本 → `parseTextResume` |
| Markdown | 粘贴 / 文件 | `parseMdResume` → `parseTextResume` |
| 纯文本 | 粘贴 | `parseTextResume` |

#### 4.1.2 纯文本解析器能力（parseTextResume）

**必须支持的标题格式**：
- Markdown 格式：`## 工作经历`、`### 字节跳动`
- 纯文本格式：`工作经历`、`专业技能`（通过 `PLAINTEXT_HEADER_PATTERNS` 匹配）
- 带编号前缀：`一、教育经历`、`1. 项目经历`
- 带括号：`【专业技能】`

**必须支持的字段格式**：
- Key:Value 单行：`姓名：张三`
- Pipe 分隔多 key：`电话：x | 邮箱：y | 微信：z`
- Bullet 列表：`- 负责 xxx`、`1. 完成 yyy`
- 转义 bullet：`\- 负责 xxx`
- 加粗 key：`- **数据库**：MySQL`

**必须支持的日期格式**：
- `2022年10月 - 至今`
- `2020.03-2022.05`
- `2016年09月 - 2020年07月`
- `2020-2023`

**必须支持的经验条目格式**：
- Markdown 子节：`### 公司名` + bullet 列表
- 段落式：日期行开头 + 描述段落（无 bullet）
- 粘连式：`字节跳动 - 懂车帝 2022年10月 - 至今`
- 元信息内联：`AI教育（测试工程师，2019年07月 - 2021年04月，北京）`

**文末信息块识别**：
- 当个人信息出现在文件末尾时（而非开头），应识别为 `basic` section
- 触发条件：最后 N 行中 >60% 为 key:value 模式，且不以 bullet 开头

#### 4.1.3 LLM 兜底（J — 待实现）

**触发条件**：
- `basic.name` 为空
- `experience.length === 0`
- `projects.length === 0`
- `skills.length === 0`
- `raw.length > 200`

**实现要求**：
- 环境变量 `RESUME_PDF_LLM_FALLBACK=true` 启用（默认 false）
- 调用 `LLMClient.invoke()` 一次，prompt 要求输出结构化 JSON
- 使用 zod 校验 LLM 输出
- 失败时回退到 plain-text 结果
- `meta.source` 标记为 `'pdf+llm'`

**隐私要求**：
- `privacyMode` 开启时跳过 LLM 兜底
- 文档化 `.env.local` 配置

### 4.2 ATS 评估模块

#### 4.2.1 JD 关键词提取

**双路径设计**：
1. **主路径（LLM）**：调用 LLM 解析 JD 为 `[{term, weight}]` 数组
2. **兜底路径（TF）**：当 LLM 不可用时，使用 token 频率提取

**TF 路径要求**：
- 支持 CJK bigram + unigram
- 过滤停用词（中英文）
- **过滤单字 CJK token**（已完成）
- 过滤跨标点 bigram 噪声
- 输出 topK（默认 20）

#### 4.2.2 覆盖率计算

- 大小写不敏感子串匹配
- 按关键词权重加权
- 百分比保留 1 位小数
- Benchmark：avg coverage >= 84%（12 个 fixture）

#### 4.2.3 缺失关键词推荐

- 对未命中的关键词，推荐应插入的简历 section
- 映射规则：技术栈 → skills，项目经验 → projects，软技能 → basic

### 4.3 匹配报告模块

#### 4.3.1 UI 组件

**CoverageBadge**：
- 显示覆盖率百分比
- 颜色阈值：>=70% 绿色，>=40% 琥珀色，<40% 红色
- 使用 Radix Progress 组件

**StrengthsCard**：
- 显示优势维度数量
- 每条优势包含证据引用

**GapsCard**：
- 显示短板维度
- Severity 标签：**高/中/低**（中文，已完成）
- 颜色映射：high=红色，medium=琥珀色，low=灰色

**PrioritiesList**：
- 编号 1/2/3 列表
- 每条包含 action + expectedImpact 标签（高/中/低影响）

**MissingKeywordsCard**：
- 关键词 chip 列表
- 每个 chip 显示 section 标签（技能/项目经历/个人信息/工作经历）
- **空简历降级**：当简历结构为空时，显示降级提示而非关键词列表（已完成）

### 4.4 STAR 改写模块

#### 4.4.1 4 段流式输出

| 段名 | 内容 |
|------|------|
| 我的分析 | 分析简历当前优劣势 |
| STAR改写 | 将经验描述改写为 STAR 格式 |
| 底层心法 | 提炼可复用的方法论 |
| 建议 | 给出具体优化建议 |

**流式要求**：
- 每段独立流式输出
- 跨段泄漏过滤（丢弃【下一节】及后续段标头）
- 自身段标头剥离
- Confidence = min(1, 累计字符数 / 2000)

#### 4.4.2 单段迭代

- 支持对任意一段重新改写
- 保留当前段文本作为上下文
- 流式输出兼容原 4 段接口

#### 4.4.3 空简历处理

- 当 experience + projects 都为空时，直接输出 4 段占位符 `（暂无内容）`
- 不调 LLM，节省成本

### 4.5 导出模块

#### 4.5.1 Markdown 导出（已完成）

- 包含完整简历结构 + STAR 改写结果
- 空字段显示 `（暂无内容）`
- 纯函数，无 I/O

#### 4.5.2 PDF 导出（待实现）

- 基于 Markdown 内容生成 PDF
- 支持自定义模板

#### 4.5.3 Word 导出（待实现）

- 基于 Markdown 内容生成 DOCX
- 保留基本格式

### 4.6 存储与隐私

#### 4.6.1 localStorage 持久化

- Key 前缀：`reup:resume:<userId>`
- SSR 安全：服务端返回 null/no-op
- 异常处理：Quota exceeded 不抛错

#### 4.6.2 隐私模式

- 用户可切换本地模式开关
- 环境变量 `NEXT_PUBLIC_PRIVACY_MODE=local-only` 可强制开启
- 本地模式下：简历不上传到服务器，LLM 兜底禁用

### 4.7 管理配置

- 运行时 prompt 覆盖（STAR / ATS / Match）
- 运行时参数配置（topK, confidenceChars, fewShotIds, sectionOrder）
- 5 秒模块级缓存

---

## 5. 前端页面结构

```
/resume (page.tsx)
├── Left Panel (380px)
│   ├── 文件上传区（拖放 + 点击）
│   ├── 文本粘贴区
│   ├── 格式选择（PDF/Word/Markdown/文本）
│   ├── 隐私模式开关
│   └── 开始优化按钮
│
└── Right Panel (flex-1)
    ├── ParsePreview（解析结果预览）
    ├── StreamingResult（STAR 改写流式输出）
    ├── ExportButtons（导出按钮）
    ├── JdInput（JD 输入框）
    └── MatchReportCard（匹配报告）
```

---

## 6. 技术栈

| 层级 | 选择 |
|------|------|
| 框架 | Next.js 16 (App Router) + React 19 + TS 5 strict |
| UI | shadcn/ui (Radix UI) + Tailwind 4 |
| LLM | Alibaba Bailian (DashScope) Qwen — OpenAI-compatible mode |
| Embedding | BGE-M3 (local) + DashScope text-embedding-v3 (fallback) |
| Reranker | BGE-reranker-v2-m3 (local) |
| Vector Store | Pre-bundled `data/skill-vectors.json` |
| 测试 | Vitest 4 + React Testing Library |
| 包管理 | pnpm 9+ |

---

## 7. 测试策略

### 7.1 单元测试

| 模块 | 测试文件 | 覆盖率要求 |
|------|----------|-----------|
| 简历解析 | `parser-text.test.ts` | >=80% |
| | `parser-text-fixtures.test.ts` | 7 个 fixture 全过 |
| | `parser-pdf.test.ts` | 真实 PDF e2e |
| | `parser-word.test.ts` | DOCX 解析 |
| ATS | `ats.test.ts` | TF/LLM 双路径 |
| | `ats.benchmark.test.ts` | avg >= 84% |
| 匹配 | `matcher.test.ts` | Dimension 分类 + Priorities |
| STAR 改写 | `star-rewriter.test.ts` | 流式输出 + 泄漏过滤 |
| 单段迭代 | `iteration.test.ts` | 单段重写 |
| 导出 | `export-md.test.ts` | Markdown 生成 |
| 存储 | `storage.test.ts` | localStorage 操作 |
| 隐私 | `privacy.test.ts` | 模式切换 |

### 7.2 组件测试

| 组件 | 测试文件 |
|------|----------|
| MatchReportCard | `MatchReportCard.test.tsx` |
| ParsePreview | `ParsePreview.e2e.test.tsx` |
| ExportButtons | `ExportButtons.test.tsx` |
| PrivacyToggle | `PrivacyToggle.test.tsx` |

### 7.3 E2E 测试

- 真实 PDF 解析端到端
- 完整流程：上传 → 解析 → STAR 改写 → 填 JD → 匹配报告

---

## 8. 分阶段实施路线图

### Phase 1：解析增强 + 报告完善（当前）

**目标**：修复真实 PDF 解析问题，完善匹配报告体验

| 任务 | 状态 |
|------|------|
| A: 标题字典扩充 | ✅ |
| B: 文末信息块识别 | ✅ |
| C: Pipe 分隔多 key | ✅ |
| D: 技能长句拆分 | ✅ |
| E: 段落式经验切分 | ✅ |
| F: 粘连字段解析 | ✅ |
| G: Severity 中文 | ✅ |
| H: 空简历降级 | ✅ |
| I: TF 单字去噪 | ✅ |
| **J: LLM 兜底** | **❌ 待实现** |
| 汇总验证 | 待执行 |

### Phase 2：JD 增强 + Chat 联动

**目标**：深化 JD 理解，打通 Chat 与 Resume 数据

| 任务 | 说明 |
|------|------|
| JD 结构解析 | 提取职位要求、硬性条件、加分项 |
| JD 与简历智能对比 | 不仅关键词匹配，还做语义对比 |
| Chat 引用简历 | 聊天中可引用已解析的简历内容 |
| 简历问答 | "我的技能匹配度如何？" |

### Phase 3：导出增强 + 版本管理

**目标**：完善输出能力，支持多版本管理

| 任务 | 说明 |
|------|------|
| PDF 导出 | 基于模板生成 PDF |
| Word 导出 | 生成 DOCX |
| 改写历史对比 | Diff 视图对比优化前后 |
| 多简历版本 | 保存多个简历版本，支持切换 |
| 版本回滚 | 回退到任意历史版本 |

---

## 9. 验收标准（总）

### 9.1 功能验收

- [ ] 真实 PDF（[候选人]简历）解析后：
  - `basic.name === '[候选人]'`
  - `basic.contact.phone` 含 `138-0000`
  - `experience.length >= 2`
  - `skills.length >= 5`
  - `education.length >= 1`
- [ ] 匹配报告 severity 显示中文（高/中/低）
- [ ] 空简历时 MissingKeywordsCard 显示降级提示
- [ ] STAR 改写 4 段完整输出
- [ ] 单段迭代可独立重写任意段
- [ ] Markdown 导出包含完整内容

### 9.2 测试验收

- [ ] 全量测试 >= 650 通过
- [ ] `pnpm lint` 0 errors
- [ ] `pnpm ts-check` 通过
- [ ] ats benchmark avg coverage >= 84%

### 9.3 性能验收

- [ ] PDF 解析 < 3s（10MB 以内）
- [ ] STAR 改写首字延迟 < 2s
- [ ] 匹配报告生成 < 1s（TF 路径）

---

## 10. 风险与不做的事

### 10.1 风险

| 风险 | 缓解 |
|------|------|
| LLM 兜底引入 PII 风险 | privacy mode 开启时跳过；文档化配置 |
| TF 去噪误删有效单字 | 边界词加白名单 |
| 真实 PDF 边角案例 | 客户端提示"解析失败请用 Markdown" |
| LLM 偶发幻觉 | zod 校验 + 失败回退 |

### 10.2 不做（Out of Scope）

- ❌ 多轮模拟面试（Phase 4）
- ❌ LangGraph 多 Agent 编排（Phase 4）
- ❌ Chroma / Milvus 向量数据库（Phase 4）
- ❌ Docker / SaaS / 团队版（Phase 4）
- ❌ 扫描件 PDF OCR（Phase 3）
- ❌ 多语言简历支持（Phase 3）
