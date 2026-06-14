# ReUp v2 — PDF Plain-Text Parser 增强 + 匹配报告 i18n

**Date**: 2026-06-15
**Status**: Draft (pending user review)
**Branch**: `local-deploy`
**Supersedes (in part)**: 不改 spec 主线；补充 `parser-text.ts` plain-text 兜底的真实 PDF 样本覆盖 + MatchReportCard 的英文残留 + LLM 兜底开关

---

## 1. 背景

用户上传真实 PDF（`data/邓熊师豪_软件测试工程师_5年测开经验.pdf`）后报告两个问题：

1. **PDF 解析后右侧简历内容为空**：`ParsePreview` 整个右侧几乎不显示
2. **填写 JD 后下方匹配报告内容不相关且为英文**

### 1.1 初始分析（被推翻）

| 误判 | 实际 |
|------|------|
| "parseTextResume 依赖 `##` 标题" | ❌ [parser-text.ts:71-145](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/parser-text.ts#L71-L145) 已实现 plain-text 兜底（`PLAINTEXT_HEADER_PATTERNS` + `classifyPlainTextHeader` + `preludeLines`）|
| "DEFAULT_PRIORITIES 是英文硬编码" | ❌ [matcher.ts:42-46](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/matcher.ts#L42-L46) 已是中文 |
| "客户端直接调 extractJdKeywords 走 TF fallback" | ❌ [MatchReportCard.tsx:43](file:///Users/dengxiongshihao/Downloads/reup/src/app/resume/_components/MatchReportCard.tsx#L43) 走 `/api/resume/jd-keywords` API |

### 1.2 真实 PDF 文本暴露的 5 类失败模式

用 `pdf-parse` 提取真实 PDF 后看到：

```
专业技能
精通Web、移动端及接口测试...              ← 无 bullet，纯长句

工作与实习经历                           ← 标题不在现有字典里
字节跳动 - 懂车帝2022年10月 - 至今         ← 公司 + 日期粘连
电商-抖音业务负责人重庆                    ← 角色 + 城市粘连
负责二手车商城等核心业务质量保障...         ← 无 - bullet 的长描述
基于Python+PyTest建设接口自动化...

教育经历
石河子大学2016年09月 - 2020年07月          ← 学校 + 日期粘连
软件工程 本科 计算机科学系 全日制石河子     ← 学位 + 院系 + 城市

项目经历 ...

个人总结 ...

邓熊师豪                                 ← 名字在文末
电话： 191-1041-8845 | 邮箱： ... | 现居城市： 重庆  ← 多个 key:value 用 | 拼一行
微信： x1228297 | 个人网站： ...
生日： 1998-12 | 性别： 男
当前状态： 在职 | 求职意向：软件测试工程师
```

| # | 模式 | 现有解析器反应 | 真问题 |
|---|------|---------------|-------|
| 1 | 标题 `工作与实习经历`（字典里没有）| 标题漏检 → 整段被并入 skills | `PLAINTEXT_HEADER_PATTERNS` 字典不全 |
| 2 | 个人信息**位于文末**（不是 prelude）| `preludeLines` 永远空 | `splitSections` 不处理"文末信息块" |
| 3 | 多 `key：value` 用 `\|` 拼成一行 | `BASIC_FIELD_RE` 把整行后半段当 phone 的 value | `parseBasicSection` 不拆 `\|` |
| 4 | 经验条目**无 `-` bullet**，整段长句 | bullets 数组空 | `splitSubBlocks` / `parseExperienceEntry` 不识别段落式 |
| 5 | 技能段**无 bullet**，每行长陈述 | 把整句当 skill | `parseSkillsSection` 不按句子拆 |

### 1.3 报告侧英文残留

[MatchReportCard.tsx:160](file:///Users/dengxiongshihao/Downloads/reup/src/app/resume/_components/MatchReportCard.tsx#L160) 直接渲染 `{g.severity}`，值是 `'high' / 'medium' / 'low'` 字面量。`StrengthsCard` / `GapsCard` 的 dimension 是中文（来自 `skills.json`），但 severity badge 是英文。

### 1.4 报告侧"不相关"症状

`MissingKeywordsCard` 列出 JD 关键词 ∩ ¬resume 命中。当 PDF 解析失败（经验/项目/技能都空）→ `buildResumeHaystack` 几乎只有 `raw` 文本 → **几乎所有 JD 关键词都被显示为"缺失"**。视觉感受是"列了一堆不相关的词"。

### 1.5 关键约束

1. **零 LLM 优先**（spec §6 zero-cost 栈）：主路径必须纯字符串处理
2. **不破坏 markdown `##` 路径**：A2 text parser 现有 7 测试必须全绿
3. **不破坏现有 14 个 PDF/Word 解析器测试**（`parser-pdf.test.ts` + `parser-word.test.ts`）
4. **TDD**：新规则用真实 PDF 文本 + 派生 fixture 先行
5. **LLM 兜底是 escape hatch**：默认关闭，留好 feature flag

---

## 2. 设计

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  PDF/Word 文件                                           │
│  └─→ pdf-parse / mammoth (已有)  →  纯文本                │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  parseTextResume(input, source)  ←  唯一入口              │
│                                                          │
│  1. [改造A] PLAINTEXT_HEADER_PATTERNS 字典扩充 (10+ 变体) │
│  2. [改造B] splitSections: 新增"文末信息块"识别            │
│  3. [改造C] parseBasicSection: 拆 \| 分隔的多 key:value   │
│  4. [改造D] parseSkillsSection: 长句按 ；/。 拆分         │
│  5. [改造E] splitSubBlocks: 段落式经验按 PERIOD_RE 切分   │
│  6. [改造F] parseExperienceEntry: 支持公司/角色/日期粘连  │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  ResumeDocument (basic / experience / projects / skills)│
│  └─→ ParsePreview 渲染                                    │
│  └─→ MatchReportCard:                                    │
│      - [改造G] severity 改中文                              │
│      - [改造H] 简历空时 MissingKeywordsCard 显示空态        │
│      - [改造I] ats.tfExtract 去噪单字 token                  │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  [改造J] LLM 兜底 (服务端, default OFF)                  │
│  - 入参: PDF 原始文本                                    │
│  - 出参: ResumeDocument JSON                              │
│  - 触发: plain-text 解析后 4 个字段全空                    │
│  - feature flag: RESUME_PDF_LLM_FALLBACK                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 改造 A：标题字典扩充

**位置**：[parser-text.ts:77-83](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/parser-text.ts#L77-L83) `PLAINTEXT_HEADER_PATTERNS`

**改动**：在每个 kind 的正则末尾追加变体；并支持"中文章节编号前缀"剥离。

```ts
// 新增变体（每行一条）
// experience:   工作与实习经历 | 实习与工作经历 | 实习经历 | 职业经历
// skills:       掌握的技能 | 技术能力
// projects:     项目介绍 | 项目概述 | 参与项目
// education:    教育背景（已有）
// basic:        联系方式（单独立段时）
// other:        个人简介 | 自我评价 | 个人评价 | 个人总结（已有）
//
// 章节编号前缀剥离：在 classifyPlainTextHeader 之前先 strip
//   `^[一二三四五六七八九十0-9]+[、.\s]+` 和 `^【|\s*】\s*`
```

**单测**：
- `工作与实习经历` → experience
- `一、教育经历` → education（剥离前缀后匹配）
- `【专业技能】` → skills（兼容括号）
- `掌握技能：java/python` → skills

### 2.3 改造 B：文末信息块

**位置**：[parser-text.ts:152-162](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/parser-text.ts#L152-L162) `splitSections` 末尾

**改动**：在 `flush()` 之后、return `out` 之前：

```ts
// 文末信息块：如果最后 N 行（>3 行）整体呈"key：value 模式 + | 拼行"
// 但没有匹配任何已识别 section，则补一个 basic section
const tail = lines.slice(-30);
if (tail.length >= 3 && isTailInfoBlock(tail) && !out.some(s => s.kind === 'basic')) {
  out.push({ kind: 'basic', title: '', body: tail.join('\n') });
}
```

`isTailInfoBlock(tail)`：超过 60% 的非空行能匹配 `key[：:]\s*value` 模式。

**单测**：真实 PDF 文本 fixture。

### 2.4 改造 C：`| ` 分隔多 key

**位置**：[parser-text.ts:357-393](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/parser-text.ts#L357-L393) `parseBasicSection`

**改动**：每行先按 `\|` 拆，每段再跑 `BASIC_FIELD_RE`：

```ts
for (const rawLine of lines) {
  // 拆 | 分隔的多 key
  const fragments = rawLine.split(/\s*[|｜]\s*/).filter(Boolean);
  for (const frag of fragments) {
    const m = frag.match(BASIC_FIELD_RE);
    if (m) { /* 提取 key/value */ }
  }
}
```

**单测**：
- `电话：191-1041-8845 | 邮箱：x@y.com` → phone + email
- `生日：1998-12 | 性别：男` → birthday + gender

### 2.5 改造 D：技能长句拆分

**位置**：[parser-text.ts:395-415](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/parser-text.ts#L395-L415) `parseSkillsSection`

**改动**：当整行不是 bullet 时（`BULLET_RE` 失败），按 `；;。\n` 切句，每句作为独立 skill 条目：

```ts
function parseSkillsSection(body: string): string[] {
  const lines = body.split('\n').map(cleanLine).filter(Boolean);
  const skills: string[] = [];
  for (const line of lines) {
    const m = BULLET_RE.exec(line);
    let textSegments: string[];
    if (m) {
      textSegments = [(m[1] ?? '').trim()].filter(Boolean);
    } else {
      // 长句拆分
      textSegments = line.split(/[；;。\n]+/).map(s => s.trim()).filter(Boolean);
    }
    for (const text of textSegments) {
      const parts = text.split(/[、,;；\/]| and | & /i)
        .map(p => p.trim()).filter(Boolean);
      for (const p of parts) if (!skills.includes(p)) skills.push(p);
    }
  }
  return skills;
}
```

**单测**：纯长句（无 bullet）+ 混合（部分有 bullet）。

### 2.6 改造 E：段落式经验切分

**位置**：[parser-text.ts:287-355](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/parser-text.ts#L287-L355) `splitSubBlocks`

**类型扩展**：`SubBlock.headerSource` 由 `'subsection' | 'title-line' | 'none'` 扩展为 `'subsection' | 'title-line' | 'period-line' | 'none'`。

**改动**：新增"含 PERIOD_RE 即开新 sub-block"规则：

```ts
// 现有规则前增加：
if (PERIOD_RE.test(cleaned) && !SUBSECTION_RE.test(rawLine)) {
  // 当前行含日期范围 → 作为新 sub-block 的标题
  flush();
  current = { header: cleaned, lines: [], hasBullet: false, headerSource: 'period-line' };
  continue;
}
```

**单测**：
- 段落式 3 段（每段以日期行开头）+ 无 bullet
- 混合：bullet + period-line

### 2.7 改造 F：parseExperienceEntry 兼容粘连

**位置**：[parser-text.ts:206-251](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/parser-text.ts#L206-L251) `parseExperienceEntry`

**改动**：在 company/role 解析前先尝试更激进拆分：
- header 中若含 ` - ` 或 ` — ` 或 ` | ` → 拆出 role/period
- 若整行没拆出 role，尝试从 body 第一行提取 role
- 兼容 `公司名 - 部门 (2022.10 - 至今)` 这种格式

### 2.8 改造 G：severity 中文化

**位置**：[MatchReportCard.tsx:160](file:///Users/dengxiongshihao/Downloads/reup/src/app/resume/_components/MatchReportCard.tsx#L160) `GapsCard`

**改动**：新增 `SEVERITY_LABEL`，渲染时映射：

```ts
const SEVERITY_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: '高', medium: '中', low: '低',
};
// 渲染：{SEVERITY_LABEL[g.severity]}
```

**类型不变**：`g.severity` 仍是 `'high' | 'medium' | 'low'`，只改显示文案。

### 2.9 改造 H：MissingKeywordsCard 空态

**位置**：[MatchReportCard.tsx:196-222](file:///Users/dengxiongshihao/Downloads/reup/src/app/resume/_components/MatchReportCard.tsx#L196-L222) `MissingKeywordsCard`

**改动**：增加 prop `resumeEmpty: boolean`，从父组件传入。当 `resumeEmpty && missing.length > 5` 时显示降级文案：

```tsx
{resumeEmpty ? (
  <p className="text-[10px] text-muted-foreground leading-relaxed">
    简历结构未能解析（{resume.raw.length} 字原始文本已识别），建议改用 Markdown 文本或手动编辑。
  </p>
) : /* 正常 missing 列表 */}
```

`resumeEmpty` 判定：`parsedResume.experience.length + parsedResume.projects.length + parsedResume.skills.length === 0 && raw.length > 200`

### 2.10 改造 I：ats.ts TF 去噪

**位置**：[ats.ts:106-128](file:///Users/dengxiongshihao/Downloads/reup/src/lib/resume/ats.ts#L106-L128) `tokenize`

**改动**：单字 CJK token 不计入 `JdKeyword.term` 输出（仅在 bigram 构造中使用）：

```ts
function tfExtract(text: string, topK: number): JdKeyword[] {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // 过滤单字 CJK（噪音）
  const cjkUnigram = /^[\u4e00-\u9fff]$/;
  for (const k of Array.from(counts.keys())) {
    if (cjkUnigram.test(k)) counts.delete(k);
  }
  // ... 后续逻辑不变
}
```

**单测**：中文 JD 不应输出单字 token（"高"、"并"等）。

### 2.11 改造 J：LLM 兜底（默认关闭）

**触发条件**：plain-text 解析后 **同时满足**：
- `basic.name` 为空（且 `contact` 为空）
- `experience.length === 0`
- `projects.length === 0`
- `skills.length === 0`

**实现**：

1. **环境变量**：`RESUME_PDF_LLM_FALLBACK=true` 启用（默认 false）
2. **位置**：[api/resume/parse/route.ts](file:///Users/dengxiongshihao/Downloads/reup/src/app/api/resume/parse/route.ts) 在 `parseResume` 后判断空，加 LLM 路径
3. **LLM 调用**：用 `LLMClient.invoke()` 一次，prompt 让模型输出结构化 JSON
4. **schema 校验**：用 zod 校验 LLM 输出（`{ basic, experience, projects, skills, education }`），失败时回退到 plain-text 结果
5. **meta 来源标识**：`meta.source = 'pdf+llm'` 让 UI 可以标注

**prompt 草稿**：

```
你是简历结构化助手。把以下简历纯文本解析为 JSON：
{ "basic": { "name": "...", "title": "...", "yearsOfExperience": N, "contact": { "phone": "...", "email": "..." } },
  "experience": [{ "company": "...", "role": "...", "period": "...", "bullets": ["..."] }],
  "projects":   [{ "name": "...", "period": "...", "bullets": ["..."] }],
  "skills":     ["..."],
  "education":  [{ "school": "...", "degree": "...", "period": "..." }] }
严格输出 JSON，不输出其他内容。

## 简历文本
${rawText}
```

**风险**：
- LLM 偶发幻觉 → 必须 zod 校验
- LLM 成本：每个 PDF 1 次 invoke，预计 1-2k tokens
- 时延：+1-3s

**回退**：校验失败 → 仍返回 plain-text 结果，UI 提示"解析结果可能不完整"。

---

## 3. 测试策略

| 测试 | 文件 | 用例数 | 类型 |
|------|------|--------|------|
| 真实 PDF 端到端 | `parser-pdf.test.ts` 新增 | 1 | 真实 fixture |
| 标题字典扩充 | `parser-text.test.ts` 新增 | 6 | 单元 |
| 文末信息块 | `parser-text.test.ts` 新增 | 1 | 单元 |
| `\|` 分隔多 key | `parser-text.test.ts` 新增 | 2 | 单元 |
| 技能长句拆分 | `parser-text.test.ts` 新增 | 2 | 单元 |
| 段落式经验切分 | `parser-text.test.ts` 新增 | 2 | 单元 |
| parseExperience 粘连兼容 | `parser-text.test.ts` 新增 | 2 | 单元 |
| severity 中文化 | `MatchReportCard.test.tsx` 新建 | 2 | 组件 |
| MissingKeywords 空态 | `MatchReportCard.test.tsx` 新建 | 2 | 组件 |
| TF 去噪单字 | `ats.test.ts` 新增 | 2 | 单元 |
| LLM 兜底路径 | `route.test.ts` 新增（mock LLMClient）| 3 | 集成 |

**总新增测试**：≈ 25 个

**TDD 顺序**：
1. 先 fixture（基于真实 PDF 文本），看到红
2. 写实现，看到绿
3. 跑全套 `pnpm test`，确保 14 个老 PDF/Word 测试不退化

---

## 4. 风险与不做的事

### 4.1 风险

| 风险 | 缓解 |
|------|------|
| 字典扩充引入误判（如"项目"匹配到 experience）| 单测覆盖 false-positive；正则仍要求行首 + 行末 |
| LLM 兜底引入 PII 风险 | privacy mode 开启时跳过 LLM 兜底；`.env.local` 文档化 |
| ats TF 去噪可能误删有效单字 | 边界词加白名单（如"测"、"试"高频但不删）| 
| 真实 PDF 的边角案例（图片型 PDF）| 不在本次范围；客户端已有"解析失败请用 Markdown"提示 |

### 4.2 不做

- ❌ 重写 parser 架构
- ❌ 改 LLMClient / skills.json / 主题色
- ❌ 引入新 PDF 库（marker-pdf）
- ❌ 改 STAR rewriter / streaming result
- ❌ 改设计稿

---

## 5. 实施顺序

| Step | 工作 | 验收 |
|------|------|------|
| 1 | 改造 A (标题字典) + 6 单测 | `pnpm test parser-text` 全绿 |
| 2 | 改造 C (管 pipe 拆 key) + 2 单测 | 同上 |
| 3 | 改造 D (技能长句) + 2 单测 | 同上 |
| 4 | 改造 E (段落式切分) + 2 单测 | 同上 |
| 5 | 改造 F (粘连兼容) + 2 单测 | 同上 |
| 6 | 改造 B (文末信息块) + 1 单测 | 同上 |
| 7 | 真实 PDF 端到端测试 | 真实 fixture 解析出 experience/skills/basic |
| 8 | 改造 G (severity) + 2 单测 | `pnpm test MatchReportCard` |
| 9 | 改造 H (MissingKeywords 空态) + 2 单测 | 同上 |
| 10 | 改造 I (TF 去噪) + 2 单测 | `pnpm test ats` |
| 11 | 改造 J (LLM 兑底) + 3 单测 | `pnpm test route` |
| 12 | 验证：`pnpm ts-check && pnpm lint && pnpm test` | 全部 green |

---

## 6. 验收标准

- [ ] 真实 PDF（`data/邓熊师豪_软件测试工程师_5年测开经验.pdf`）解析后：
  - `basic.name === '邓熊师豪'`
  - `basic.contact.phone` 至少含 `191-1041-8845`
  - `experience.length >= 2`（字节跳动 x2 + 讯飞）
  - `skills.length >= 5`
  - `education.length >= 1`
- [ ] 匹配报告不再出现英文 severity badge
- [ ] 简历结构为空时 `MissingKeywordsCard` 显示降级文案而非 20 个关键词
- [ ] 全部 14 个老 PDF/Word 测试不退化
- [ ] `pnpm ts-check && pnpm lint && pnpm test` 全部 green
