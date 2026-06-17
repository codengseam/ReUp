# PDF 简历解析 & 匹配报告 Bug 修复 Spec

**关联项目**: GitHub `codengseam/ReUp` 分支 `local-deploy`
**文档版本**: V1.0
**编制日期**: 2026-06-15
**适用范围**: 前端、后端、测试
**状态**: Ready for execution

---

## 一、背景

基于 `2026-06-15-pdf-parse-and-report-i18n-design.md` 的设计文档，当前代码已部分完成改造 A（标题字典扩充），但仍有 **6 个核心 Bug** 未修复，直接影响用户上传真实 PDF 后的解析质量和匹配报告体验。

### 当前测试状态
- 651/652 测试通过（唯一失败：`admin-knowledge.test.ts` 排序测试，与 PDF 无关）
- 现有 PDF 解析测试（`parser-pdf.test.ts`, `parser-text.test.ts`, `parser-text-fixtures.test.ts`）全部通过，但**未覆盖真实 PDF 的 5 类失败模式**

---

## 二、Bug 清单（6 个）

### Bug B: 文末信息块无法识别（P0）
**症状**: 真实 PDF 中个人信息（姓名、电话、邮箱）出现在文件末尾时，`splitSections` 不会将其归入 `basic` 段，导致 `basic.name` 为空。

**根因**: `splitSections` 函数末尾缺少 `isTailInfoBlock` 检测逻辑。

**修复位置**: `src/lib/resume/parser-text.ts:105-169`

**修复方案**:
```typescript
// 在 splitSections 函数末尾（after line ~169）添加：
function isTailInfoBlock(lines: string[]): boolean {
  const tail = lines.slice(-30);
  const kvLines = tail.filter(l => /[:：]/.test(l) && l.trim().length > 3);
  return kvLines.length / tail.length > 0.6;
}

// 如果末尾 30 行中 >60% 是 key:value 模式，补一个 basic section
if (isTailInfoBlock(lines)) {
  sections.push({ type: 'basic', lines });
}
```

**验收标准**:
- [ ] 新增 `parser-text-tail-info.test.ts`，使用文末含个人信息的 fixture，验证 `basic.name` 非空
- [ ] 现有测试不回归

---

### Bug C: Basic 段 `|` 分隔的多 key-value 不解析（P0）
**症状**: `电话：138-0000-0000 | 邮箱：candidate@example.com | 现居城市：北京` — 整行只匹配第一个 `BASIC_FIELD_RE`，后面的被忽略。

**根因**: `parseBasicSection` 逐行跑 `BASIC_FIELD_RE`，但不先按 `|` 拆 fragment。`parseRoleLine`（L177-212）已能拆 `|`，但没有应用到 basic section。

**修复位置**: `src/lib/resume/parser-text.ts:436-472`

**修复方案**:
```typescript
// 在 parseBasicSection 中，对每行先按 | 拆分 fragment
const fragments = line.split(/\s*\|\s*/);
for (const frag of fragments) {
  const m = frag.match(BASIC_FIELD_RE);
  if (m) {
    const key = normalizeKey(m[1]);
    const value = m[2].trim();
    basic[key] = value;
  }
}
```

**验收标准**:
- [ ] 新增测试：单行 `|` 分隔 3 个 key-value，全部解析成功
- [ ] 现有测试不回归

---

### Bug D: 纯长句技能段拆分不足（P0）
**症状**: 无 bullet 的长句技能段落（如 `"精通Web、移动端及接口测试"`），`parseSkillsSection` 在 `BULLET_RE` 失败时直接用整行，不按句号/分号切分句子。

**修复位置**: `src/lib/resume/parser-text.ts:474-502`

**修复方案**:
```typescript
// 在 BULLET_RE 失败时，不仅用整行，还尝试按句子切分
let text = line.replace(BULLET_RE, '').trim();
if (!text) continue;

// 如果整行很长且无 bullet，尝试按句子切分
if (text.length > 20 && !text.includes('、') && !text.includes(',')) {
  const sentences = text.split(/[;；。]/).map(s => s.trim()).filter(Boolean);
  if (sentences.length > 1) {
    for (const s of sentences) {
      skills.push({ name: s, level: '熟练' });
    }
    continue;
  }
}
skills.push({ name: text, level: '熟练' });
```

**验收标准**:
- [ ] 新增测试：长句技能段按句子正确拆分
- [ ] 现有测试不回归

---

### Bug E: 段落式经验不按日期行分割（P0）
**症状**: 真实 PDF 中工作经历为段落式（无 `###`、无 bullet），只有日期行开头标记新经历。`splitSubBlocks` 没有 period-line 检测规则，多个经历被合并为一条。

**修复位置**: `src/lib/resume/parser-text.ts:364-434`

**修复方案**:
```typescript
// 在 splitSubBlocks 的 split 触发条件中，增加 PERIOD_RE 检测
const PERIOD_RE = /^(\d{4}[\.\-/年]\s*(?:至今|今|present|now|\d{4}[\.\-/年]))/i;

// 在遍历 lines 时，如果当前行匹配 PERIOD_RE 且已有 content，触发 split
if (PERIOD_RE.test(line) && currentContent.length > 0) {
  blocks.push({ title: currentTitle, content: currentContent });
  currentTitle = line;
  currentContent = [];
  continue;
}
```

**验收标准**:
- [ ] 新增测试：段落式经验文本（2 段，每段以日期行开头），正确拆分为 2 条经历
- [ ] 现有测试不回归

---

### Bug G: 严重程度显示英文（P0）
**症状**: `GapsCard` 中 severity badge 直接渲染 `{g.severity}`，值为 `"high" / "medium" / "low"` 字面量。

**修复位置**: `src/app/resume/_components/MatchReportCard.tsx:231-233`

**修复方案**:
```typescript
const SEVERITY_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

// 在 GapsCard 中：
<span className={cn('text-xs px-2 py-0.5 rounded', severityClass(g.severity))}>
  {SEVERITY_LABEL[g.severity] ?? g.severity}
</span>
```

**验收标准**:
- [ ] `MatchReportCard.test.tsx` 更新：验证 severity badge 显示中文
- [ ] 现有测试不回归

---

### Bug H: 简历结构为空时缺失关键词不降级（P1）
**症状**: 当 PDF 解析失败（experience/projects/skills 全空），`buildResumeHaystack` 只剩 `raw` 文本 → 几乎全部 JD 关键词都显示为"缺失" → 视觉表现为"列了一堆不相关的词"。

**修复位置**: `src/app/resume/_components/MatchReportCard.tsx:268-293`

**修复方案**:
```typescript
// 在 MissingKeywordsCard 组件中：
function MissingKeywordsCard({ keywords, resumeEmpty }: { keywords: string[]; resumeEmpty?: boolean }) {
  if (resumeEmpty) {
    return (
      <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded">
        简历解析不完整，无法准确评估关键词缺失情况。请先检查简历文件格式。
      </div>
    );
  }
  // ... existing logic
}

// 在 MatchReportCard 中计算 resumeEmpty：
const resumeEmpty = !report.resume.experience?.length && !report.resume.projects?.length && !report.resume.skills?.length;
```

**验收标准**:
- [ ] 新增测试：空简历状态下 MissingKeywordsCard 显示降级提示
- [ ] 现有测试不回归

---

### Bug I: TF 关键词提取包含单字噪声（P1）
**症状**: `tokenize` 函数生成 CJK 单字 token，`tfExtract` 将其作为关键词输出（如 "高"、"并"、"发"、"熟"）。这些单字在 `buildResumeHaystack` 中几乎总能命中，造成覆盖率虚高。

**修复位置**: `src/lib/resume/ats.ts:136-150`

**修复方案**:
```typescript
// 在 tfExtract 中过滤单字 CJK token
function tfExtract(tokens: string[], topN = 20): string[] {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    if (t.length === 1 && /[\u4e00-\u9fff]/.test(t)) continue; // 过滤单字 CJK
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  // ... rest of logic
}
```

**验收标准**:
- [ ] 新增测试：`tfExtract` 对含单字 CJK 的 token 列表，输出不含单字
- [ ] `ats.benchmark.test.ts` 仍通过（avg coverage >= 85%）

---

## 三、文件变更清单

| 文件 | 变更类型 | Bug |
|------|---------|-----|
| `src/lib/resume/parser-text.ts` | 修改 | B, C, D, E |
| `src/app/resume/_components/MatchReportCard.tsx` | 修改 | G, H |
| `src/lib/resume/ats.ts` | 修改 | I |
| `src/lib/resume/parser-text.test.ts` | 新增测试 | B, C, D, E |
| `src/app/resume/_components/MatchReportCard.test.tsx` | 修改测试 | G, H |
| `src/lib/resume/ats.test.ts` | 新增测试 | I |

---

## 四、依赖关系

```
B (文末信息块) ──┐
C (| 多 key) ────┤
D (技能长句) ────┼──> 互相独立，可并行
E (段落式经验) ──┘
G (severity 中文) ──> 独立
H (空简历降级) ─────> 依赖 G（同文件）
I (TF 去噪) ────────> 独立
```

**并行分组**:
- **Group 1**: B + C + D + E（全部在 `parser-text.ts`，同一文件需串行）
- **Group 2**: G + H（同一文件 `MatchReportCard.tsx`，串行）
- **Group 3**: I（独立文件 `ats.ts`，可并行）

---

## 五、验收标准（总）

1. 所有 6 个 Bug 修复后，对应新增测试通过
2. 现有 651 个测试全部通过（admin-knowledge 排序失败除外）
3. `pnpm lint` 无新增错误
4. `pnpm ts-check` 无新增错误
5. `ats.benchmark.test.ts` avg coverage >= 85% 保持

---

## 六、Out of Scope

- J (LLM 兜底开关): 不在本次修复范围，需单独决策
- 新增 Skill 知识库: 属于功能增强，非 Bug 修复
- 前端可视化图表（热力图等）: P1 功能，非 Bug
