# 简历解析 & JD 匹配修复方案

## Context

PDF 上传简历后，右侧解析结果存在多个问题：工作经历显示 "Unknown"、技能被标点切碎、STAR 重写全部为空、JD 匹配维度显示知识库 skill ID、缺失关键词是 bigram 噪音。根本原因是纯文本解析器（正则）太弱，且匹配引擎依赖了无关的知识库数据。

## 问题清单 & 根因

| # | 问题 | 根因 | 影响文件 |
|---|------|------|----------|
| P1 | 工作经历 company="Unknown" | `splitSubBlocks` 不识别纯文本中的时间段行作为新条目边界 | `parser-text.ts` |
| P2 | 技能被 `、` 切碎 | `parseSkillsSection` 按标点拆分，应一行一技能 | `parser-text.ts` |
| P3 | STAR 重写全空 (0/4) | SSE error 帧被内层 `catch {}` 静默吞没，LLM 失败无反馈 | `StreamingResult.tsx` |
| P4 | 短板显示 skill ID | `classifyDimensions` 用 `data/skills.json` 做维度，与简历无关 | `matcher.ts` + `MatchReportCard.tsx` + 新增 API |
| P5 | 缺失关键词是噪音 | TF fallback 把中文切成 bigram ("型工"、"大模") | `ats.ts` |
| P6 | 解析内容缺模块 | `ResumeBasic` 无 city 字段；纯文本 section 检测不够强 | `types.ts` + `parser-text.ts` |

## Task 1: 修复工作经历解析 (P1)

**文件**: `src/lib/resume/parser-text.ts`

**改动**:
1. 在 `splitSubBlocks` 中增加**时间段行检测**作为第三种切分信号：
   - 当 `fanOut: false` (experience 模式) 时，非 bullet 行若包含 `PERIOD_RE` 匹配且长度 < 80，则视为新条目的 header
   - 无需等 "已有 bullet" 这个前提条件

2. 修改 `parseExperienceEntry`：
   - 当 header 为空但 body 第一行含 "公司名 角色名 时间段" 格式时，尝试从中提取 company/role/period
   - 增加 `公司名 - 部门` 格式的识别（如 "字节跳动 - 懂车帝"）

3. 增加 `ResumeBasic.city` 字段支持（在 `parseBasicSection` 中识别 "城市"/"所在地"/"location" 等）

## Task 2: 修复技能解析 (P2)

**文件**: `src/lib/resume/parser-text.ts`

**改动**: `parseSkillsSection` 改为**一行一技能**：
- 删除 `.split(/[、,;；\/]| and | & /i)` 拆分逻辑
- 每行去除 bullet/序号后整行作为一个技能

## Task 3: 修复 STAR 重写错误吞没 (P3)

**文件**: `src/app/resume/_components/StreamingResult.tsx`

**改动**: 将 `msg.type === 'error'` 的处理从内层 `try` 中移出：
- 先 `JSON.parse` 在 try/catch 内
- parse 成功后，在 try/catch 外处理各消息类型
- `msg.type === 'error'` 的 throw 可以正确冒泡到外层 catch

## Task 4: 重构 JD 匹配为 LLM 驱动 (P4)

**新增文件**: `src/app/api/resume/match-report/route.ts`
- 接收 `{ resume, jd }` → 调用 LLMClient 生成 `MatchReport`
- prompt 要求 LLM 输出结构化 JSON（strengths/gaps/priorities）
- 维度名使用有意义的中文（如"自动化测试能力"），而非 skill ID
- 失败时返回空报告 + 静态 priorities

**修改文件**: `src/app/resume/_components/MatchReportCard.tsx`
- `buildReportSync()` → 异步 API 调用
- 增加 loading/error state
- dimension 显示 LLM 生成的维度名

**修改文件**: `src/lib/resume/matcher.ts`
- `classifyDimensions` 添加 `@deprecated` 注释

## Task 5: 修复 TF fallback 分词 (P5)

**文件**: `src/lib/resume/ats.ts`

**改动**: `tokenize()` 函数改进中文分词：
- CJK 连续文本只保留 bigram（去掉 unigram 单字）
- 增加 CJK 停用字集合过滤噪音 bigram
- 最终关键词最小长度 >= 2

## Task 6: 增强纯文本 section 检测 (P6)

**文件**: `src/lib/resume/parser-text.ts`

**改动**:
- `PLAINTEXT_HEADER_PATTERNS` 增加更多模式（如 "自我评价"、"荣誉证书"、"项目成果" 等）
- `ResumeBasic` 增加 `city?: string` 字段
- `parseBasicSection` 增加城市识别

## 文件修改清单

| 文件 | 操作 |
|------|------|
| `src/lib/resume/parser-text.ts` | 修改 (P1/P2/P6) |
| `src/lib/resume/types.ts` | 修改 (P6: 加 city) |
| `src/app/resume/_components/StreamingResult.tsx` | 修改 (P3) |
| `src/app/api/resume/match-report/route.ts` | **新增** (P4) |
| `src/app/resume/_components/MatchReportCard.tsx` | 修改 (P4) |
| `src/lib/resume/matcher.ts` | 修改 (P4: @deprecated) |
| `src/lib/resume/ats.ts` | 修改 (P5) |
| 对应测试文件 | 同步更新 |

## 执行顺序

Task 3 → Task 2 → Task 6 → Task 1 → Task 5 → Task 4（从简单到复杂）

## 验证

1. 每个 Task 完成后运行 `pnpm test` 确认无回归
2. Task 1/2 完成后：用纯文本 fixture 验证解析结果（company/skills/education）
3. Task 3 完成后：模拟 error SSE 帧，确认 UI 显示错误提示
4. Task 4 完成后：启动 dev server，输入简历 + JD，确认匹配报告维度为有意义的中文
5. 全量验证：`pnpm ts-check && pnpm lint && pnpm test`
