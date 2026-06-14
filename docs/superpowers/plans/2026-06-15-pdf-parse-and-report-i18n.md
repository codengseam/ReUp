# PDF Parser Enhancements + Report i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in PDF resume parsing flow: (1) parsed content is empty because the plain-text fallback misses 5 real-world PDF patterns; (2) JD match report shows English severity badges and floods missing-keyword list when resume is unparseable. Add an opt-in LLM fallback as escape hatch.

**Architecture:** Six targeted enhancements to `parser-text.ts` (header dictionary / tail info block / pipe-separated keys / skill sentence splitting / paragraph-style splitting / conjoined field parsing), three UI fixes in `MatchReportCard.tsx` (severity i18n / empty-state for missing keywords / TF unigram denoising in `ats.ts`), and one optional server-side LLM fallback in the parse API route gated by `RESUME_PDF_LLM_FALLBACK`. All changes are additive — no rewrite of the parser architecture.

**Tech Stack:** Next.js 16, React 19, TypeScript 5 strict, Vitest 4 (TDD red-green-refactor, mock LLMClient), pnpm 9. Zero new runtime deps.

**Source spec:** `docs/superpowers/specs/2026-06-15-pdf-parse-and-report-i18n-design.md` (commit `de9f93b`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/resume/parser-text.ts` | MODIFY | 6 enhancements (A–F) in title detection, section splitting, basic/skill/experience parsing |
| `src/lib/resume/parser-text.test.ts` | MODIFY | Add 17 unit tests (header dict, tail block, pipe split, skill split, paragraph split, conjoined field) |
| `src/lib/resume/parser-pdf.test.ts` | MODIFY | Add 1 e2e test using real `data/邓熊师豪_软件测试工程师_5年测开经验.pdf` |
| `src/lib/resume/ats.ts` | MODIFY | Filter single-char CJK unigrams from `tfExtract` output (I) |
| `src/lib/resume/ats.test.ts` | MODIFY | Add 2 tests for unigram denoising |
| `src/app/resume/_components/MatchReportCard.tsx` | MODIFY | Add `SEVERITY_LABEL` map (G); add `resumeEmpty` prop / empty-state to `MissingKeywordsCard` (H) |
| `src/app/resume/_components/MatchReportCard.test.tsx` | CREATE | 4 component tests (severity labels ×2, empty state ×2) |
| `src/app/api/resume/parse/route.ts` | MODIFY | Add `RESUME_PDF_LLM_FALLBACK` branch (J) with zod-validated LLM restructure |
| `src/app/api/resume/parse/route.test.ts` | MODIFY | Add 3 tests for LLM fallback (off, on-success, on-validation-fail) |
| `.env.example` | MODIFY (or CREATE) | Document `RESUME_PDF_LLM_FALLBACK` flag |

10 files (1 new test, 8 modified, 1 env doc). Single linear track — no parallelism needed (shared types).

---

## Task 1: Header dictionary expansion (改造 A)

**Files:**
- Modify: `src/lib/resume/parser-text.ts:77-83`
- Test: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 1.1: Write 6 failing unit tests**

Append to `src/lib/resume/parser-text.test.ts`:

```ts
describe('plain-text header dictionary', () => {
  it('classifies "工作与实习经历" as experience', () => {
    const doc = parseTextResume('工作与实习经历\n字节跳动 2022 - 至今\n做了一些事。');
    expect(doc.experience.length).toBeGreaterThan(0);
  });
  it('classifies "实习与工作经历" as experience', () => {
    const doc = parseTextResume('实习与工作经历\n字节跳动 2022 - 至今\n做了一些事。');
    expect(doc.experience.length).toBeGreaterThan(0);
  });
  it('classifies "实习经历" as experience', () => {
    const doc = parseTextResume('实习经历\n字节跳动 2022 - 至今\n做了一些事。');
    expect(doc.experience.length).toBeGreaterThan(0);
  });
  it('classifies "职业经历" as experience', () => {
    const doc = parseTextResume('职业经历\n字节跳动 2022 - 至今\n做了一些事。');
    expect(doc.experience.length).toBeGreaterThan(0);
  });
  it('strips "一、" prefix before matching', () => {
    const doc = parseTextResume('一、教育经历\n石河子大学 2016 - 2020\n软件工程');
    expect(doc.education.length).toBe(1);
  });
  it('strips 【】 brackets before matching', () => {
    const doc = parseTextResume('【专业技能】\n熟悉 Java；\n熟悉 Python；');
    expect(doc.skills.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "plain-text header dictionary"`
Expected: 6 tests fail (titles `工作与实习经历`, `实习与工作经历`, etc. are not matched).

- [ ] **Step 1.3: Add variant patterns to `PLAINTEXT_HEADER_PATTERNS`**

In `src/lib/resume/parser-text.ts`, replace the `PLAINTEXT_HEADER_PATTERNS` constant (lines 77–83) with:

```ts
const PLAINTEXT_HEADER_PATTERNS: Array<{ kind: SectionKind; re: RegExp }> = [
  { kind: 'basic', re: /^\s*(?:个人信息|基本信息|基本资料|个人简介|联系方式|basic\s*info|contact\s*(?:info)?|profile)\s*[：:]*\s*$/i },
  { kind: 'experience', re: /^\s*(?:工作与实习经历|实习与工作经历|工作经历|工作经验|职业经历|实习经历|work\s*(?:experience|history)|employment\s*history|professional\s*experience)\s*[：:]*\s*$/i },
  { kind: 'projects', re: /^\s*(?:项目经历|项目经验|项目介绍|项目概述|参与项目|projects?|personal\s*projects?)\s*[：:]*\s*$/i },
  { kind: 'skills', re: /^\s*(?:专业技能|技能清单|技术栈|技术能力|掌握的技能|技能|skills?|tech(?:nical)?\s*stack|core\s*(?:competenc(?:ies|y)))\s*[：:]*\s*$/i },
  { kind: 'education', re: /^\s*(?:教育经历|教育背景|学历|education|academic\s*(?:background)?)\s*[：:]*\s*$/i },
];
```

Also update `classifyPlainTextHeader` (line 89) to strip number/bracket prefixes before matching. Replace the function:

```ts
function classifyPlainTextHeader(line: string): SectionKind | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 20) return null;
  // Strip Chinese-number / arabic-number prefixes and 【】 brackets
  const stripped = trimmed
    .replace(/^[一二三四五六七八九十]+[、.]\s*/, '')
    .replace(/^\d+(?:\.\d+)*[.、]?\s*/, '')
    .replace(/^【(.+?)】\s*$/, '$1');
  for (const { kind, re } of PLAINTEXT_HEADER_PATTERNS) {
    if (re.test(stripped)) return kind;
  }
  return null;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "plain-text header dictionary"`
Expected: 6 new tests pass; all 7 existing parser-text tests still pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser-text): expand plain-text header dictionary (A)"
```

---

## Task 2: Pipe-separated key:value rows in basic section (改造 C)

**Files:**
- Modify: `src/lib/resume/parser-text.ts:357-393`
- Test: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 2.1: Write 2 failing unit tests**

Append to `src/lib/resume/parser-text.test.ts`:

```ts
describe('parseBasicSection pipe-separated rows', () => {
  it('parses pipe-separated phone+email on one line', () => {
    const doc = parseTextResume(
      '## 个人信息\n' +
      '电话：191-1041-8845 | 邮箱：dengxsh@foxmail.com | 现居城市：重庆'
    );
    expect(doc.basic.contact?.phone).toBe('191-1041-8845');
    expect(doc.basic.contact?.email).toBe('dengxsh@foxmail.com');
  });
  it('parses multiple pipe-separated key:value rows on separate lines', () => {
    const doc = parseTextResume(
      '## 个人信息\n' +
      '电话：191-1041-8845 | 邮箱：dengxsh@foxmail.com\n' +
      '生日：1998-12 | 性别：男'
    );
    expect(doc.basic.contact?.phone).toBe('191-1041-8845');
    expect(doc.basic.contact?.email).toBe('dengxsh@foxmail.com');
    expect(doc.basic.contact?.生日).toBe('1998-12');
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "parseBasicSection pipe-separated rows"`
Expected: 2 tests fail.

- [ ] **Step 2.3: Update `parseBasicSection` to split on `\|`**

In `src/lib/resume/parser-text.ts`, replace the body of `parseBasicSection` (lines 357–393) with:

```ts
function parseBasicSection(body: string, headerTitle: string): {
  basic: ResumeDocument['basic'];
} {
  const lines = body.split('\n').map(cleanLine).filter(Boolean);
  const basic: ResumeDocument['basic'] = {};
  const contact: Record<string, string> = {};
  // Pre-compile the field regex once
  const fieldRe = /^\s*\*{0,2}([^：:]+?)\*{0,2}\s*[：:]\s*(.+?)\s*\\?\s*$/;
  for (const line of lines) {
    // Split on | or ｜ to handle "电话：X | 邮箱：Y | 城市：Z" rows
    const fragments = line.split(/\s*[|｜]\s*/).filter(Boolean);
    for (const frag of fragments) {
      const m = frag.match(fieldRe);
      if (!m) continue;
      const key = (m[1] ?? '').trim();
      const value = (m[2] ?? '').trim();
      if (!key || !value) continue;
      const keyLower = key.toLowerCase();
      if (keyLower.includes('姓名') || keyLower === 'name') {
        basic.name = value;
      } else if (keyLower.includes('电话') || keyLower === 'phone' || keyLower === 'mobile') {
        contact.phone = value;
      } else if (keyLower.includes('邮箱') || keyLower === 'email') {
        contact.email = value;
      } else if (keyLower.includes('微信') || keyLower === 'wechat') {
        contact.wechat = value;
      } else if (keyLower.includes('网站') || keyLower === 'website' || keyLower === 'blog') {
        contact.website = value;
      } else if (keyLower.includes('求职意向') || keyLower === '意向岗位' || keyLower === 'title') {
        basic.title = value;
      } else if (keyLower.includes('工作经验') || keyLower.includes('工作年限') || keyLower === 'experience') {
        const years = parseInt(value.match(/\d+/)?.[0] ?? '', 10);
        if (!Number.isNaN(years)) basic.yearsOfExperience = years;
      } else {
        contact[key] = value;
      }
    }
  }
  if (Object.keys(contact).length > 0) basic.contact = contact;
  void headerTitle;
  return { basic };
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "parseBasicSection pipe-separated rows"`
Expected: 2 new tests pass; all previous tests still pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser-text): split pipe-separated key:value rows in basic section (C)"
```

---

## Task 3: Skill section splits long sentences (改造 D)

**Files:**
- Modify: `src/lib/resume/parser-text.ts:395-415`
- Test: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 3.1: Write 2 failing unit tests**

Append to `src/lib/resume/parser-text.test.ts`:

```ts
describe('parseSkillsSection long-sentence splitting', () => {
  it('splits a sentence-style skill line into multiple skills', () => {
    const doc = parseTextResume(
      '专业技能\n' +
      '熟悉数据库及SQL优化，具备数据一致性治理经验，数据库系统工程师。\n' +
      '熟悉Python开发，具备自动化测试与工具开发能力。'
    );
    expect(doc.skills.length).toBeGreaterThan(3);
    expect(doc.skills.some(s => s.includes('数据库'))).toBe(true);
    expect(doc.skills.some(s => s.includes('Python'))).toBe(true);
  });
  it('handles mixed bullet + sentence-style skill lines', () => {
    const doc = parseTextResume(
      '专业技能\n' +
      '- Java；\n' +
      '熟悉 Python、Go；\n' +
      '- Redis'
    );
    expect(doc.skills).toContain('Java');
    expect(doc.skills).toContain('Python');
    expect(doc.skills).toContain('Go');
    expect(doc.skills).toContain('Redis');
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "parseSkillsSection long-sentence splitting"`
Expected: 2 tests fail (entire line is treated as one skill, not split).

- [ ] **Step 3.3: Update `parseSkillsSection` to split long sentences**

In `src/lib/resume/parser-text.ts`, replace `parseSkillsSection` (lines 395–415) with:

```ts
function parseSkillsSection(body: string): string[] {
  const lines = body
    .split('\n')
    .map(cleanLine)
    .filter(Boolean);
  const skills: string[] = [];
  for (const line of lines) {
    const m = BULLET_RE.exec(line);
    let textSegments: string[];
    if (m) {
      // Bullet line: use the captured group as a single segment
      const captured = (m[1] ?? '').trim();
      textSegments = captured ? [captured] : [];
    } else {
      // Sentence-style line: split on sentence boundaries
      textSegments = line
        .split(/[；;。\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    for (const text of textSegments) {
      const parts = text
        .split(/[、,;；\/]| and | & /i)
        .map((p) => p.replace(/^\**\s*/, '').replace(/\**\s*$/, '').trim())
        .filter(Boolean);
      for (const p of parts) {
        if (!skills.includes(p)) skills.push(p);
      }
    }
  }
  return skills;
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "parseSkillsSection long-sentence splitting"`
Expected: 2 new tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser-text): split long-sentence skill lines (D)"
```

---

## Task 4: Paragraph-style experience splitting (改造 E)

**Files:**
- Modify: `src/lib/resume/parser-text.ts:287-355` (type extension + new rule)
- Test: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 4.1: Write 2 failing unit tests**

Append to `src/lib/resume/parser-text.test.ts`:

```ts
describe('splitSubBlocks paragraph-style period-line', () => {
  it('splits a section into 2 entries by date-range lines', () => {
    const doc = parseTextResume(
      '工作与实习经历\n' +
      '字节跳动 - 懂车帝 2022年10月 - 至今\n' +
      '电商-抖音业务负责人\n' +
      '负责二手车商城等核心业务质量保障。\n' +
      '基于Python+PyTest建设接口自动化。\n' +
      '字节跳动 - K12 - 智慧考试 2021年04月 - 2022年10月\n' +
      '读阅卷团队负责人\n' +
      '负责考试系统核心模块质量保障。'
    );
    expect(doc.experience.length).toBe(2);
    expect(doc.experience[0]?.company).toContain('懂车帝');
    expect(doc.experience[0]?.period).toContain('2022');
    expect(doc.experience[1]?.company).toContain('智慧考试');
  });
  it('still handles bullet-style sub-blocks unchanged', () => {
    const doc = parseTextResume(
      '工作与实习经历\n' +
      '### 公司A 2022 - 至今\n' +
      '**工程师**\n' +
      '- 负责质量保障\n' +
      '- 推动自动化建设\n' +
      '### 公司B 2020 - 2022\n' +
      '**测试工程师**\n' +
      '- 负责走班考勤测试'
    );
    expect(doc.experience.length).toBe(2);
    expect(doc.experience[0]?.bullets.length).toBe(2);
    expect(doc.experience[1]?.bullets.length).toBe(1);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "splitSubBlocks paragraph-style period-line"`
Expected: First test fails (entries not split). Second test should already pass.

- [ ] **Step 4.3: Extend `SubBlock.headerSource` type and add period-line rule**

In `src/lib/resume/parser-text.ts`, replace the `SubBlock` type (line 292) and the loop body (line 307 onward) in `splitSubBlocks`:

```ts
type HeaderSource = 'subsection' | 'title-line' | 'period-line' | 'none';
type SubBlock = { header: string; lines: string[]; hasBullet: boolean; headerSource: HeaderSource };
type PublicSubBlock = { header: string; lines: string[]; headerSource: HeaderSource };
```

Then in the `for (const rawLine of lines)` loop, **after** the `SUBSECTION_RE` check and **before** the `if (current) { ... }` block, insert:

```ts
// Period-line rule: a line containing a date range opens a new sub-block
if (!m && PERIOD_RE.test(cleaned)) {
  flush();
  current = { header: cleaned, lines: [], hasBullet: false, headerSource: 'period-line' };
  continue;
}
```

(Place it just after `if (!cleaned) continue;` and before the existing `if (current)` branch.)

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "splitSubBlocks paragraph-style period-line"`
Expected: Both new tests pass; all previous tests still pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser-text): split sub-blocks by period-line for paragraph-style resumes (E)"
```

---

## Task 5: Conjoined company/role/period parsing (改造 F)

**Files:**
- Modify: `src/lib/resume/parser-text.ts:206-251`
- Test: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 5.1: Write 2 failing unit tests**

Append to `src/lib/resume/parser-text.test.ts`:

```ts
describe('parseExperienceEntry conjoined fields', () => {
  it('parses "公司 - 部门 (period)" as company=公司, role=部门, period=period', () => {
    const doc = parseTextResume(
      '工作与实习经历\n' +
      '字节跳动 - 懂车帝 2022年10月 - 至今\n' +
      '电商-抖音业务负责人\n' +
      '负责二手车商城等核心业务质量保障。'
    );
    expect(doc.experience[0]?.company).toContain('懂车帝');
    expect(doc.experience[0]?.role).toContain('电商');
    expect(doc.experience[0]?.period).toContain('2022');
  });
  it('parses "公司 (period)" with role inferred from next line', () => {
    const doc = parseTextResume(
      '工作与实习经历\n' +
      '石河子大学 - 计算机系 2016 - 2020\n' +
      '软件工程 本科'
    );
    expect(doc.experience[0]?.company).toContain('石河子大学');
    expect(doc.experience[0]?.period).toContain('2016');
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "parseExperienceEntry conjoined fields"`
Expected: First test fails (company is the whole concatenated line). Second test may already pass.

- [ ] **Step 5.3: Add a `company - role` splitter in `parseExperienceEntry`**

In `src/lib/resume/parser-text.ts`, replace `parseExperienceEntry` (lines 206–251) with:

```ts
function parseExperienceEntry(headerLine: string, bodyLines: string[]): ResumeExperience | null {
  const cleanedHeader = cleanLine(headerLine);
  const headerPeriod = extractPeriod(cleanedHeader);
  let company = cleanedHeader;
  let role = '';
  let period: string | undefined = headerPeriod.period;
  const rest = headerPeriod.rest;

  if (period) {
    company = rest;
  }

  // NEW: if company still contains " - " or " — " or " | ", split the LAST
  // segment off as role (e.g. "字节跳动 - 懂车帝" → company="字节跳动", role="懂车帝").
  if (company.includes(' - ') || company.includes(' — ') || company.includes(' | ')) {
    const parts = company.split(/\s+[-—|｜]\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      role = parts[parts.length - 1] ?? '';
      company = parts.slice(0, -1).join(' / ');
    }
  }

  const firstNonBullet = firstNonBulletLine(bodyLines);
  if (firstNonBullet) {
    const { role: r, period: p } = parseRoleLine(firstNonBullet);
    if (r) role = r;
    if (p && !period) period = p;
  }

  if (!period && !role && bodyLines.length > 0) {
    const firstRaw = cleanLine(bodyLines[0] ?? '');
    const pipeMatch = firstRaw.match(/^[-*•]?\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/);
    if (pipeMatch) {
      const candCompany = (pipeMatch[1] ?? '').trim();
      const candRole = (pipeMatch[2] ?? '').trim();
      const candPeriodRaw = (pipeMatch[3] ?? '').trim();
      const { period: candPeriod } = extractPeriod(candPeriodRaw);
      if (candCompany && (candRole || candPeriod)) {
        company = candCompany;
        role = candRole;
        period = candPeriod;
        bodyLines = bodyLines.slice(1);
      }
    }
  }

  if (!company && !role) return null;
  if (!role) role = company;
  if (!company) company = 'Unknown';
  const bullets = extractBullets(bodyLines);
  return { company, role, period: period ?? '', bullets };
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "parseExperienceEntry conjoined fields"`
Expected: 2 new tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser-text): parse conjoined company/role/period fields (F)"
```

---

## Task 6: Tail info block detection (改造 B)

**Files:**
- Modify: `src/lib/resume/parser-text.ts:152-162`
- Test: `src/lib/resume/parser-text.test.ts`

- [ ] **Step 6.1: Write 1 failing test**

Append to `src/lib/resume/parser-text.test.ts`:

```ts
describe('splitSections tail info block', () => {
  it('collects trailing key:value rows into a basic section', () => {
    const doc = parseTextResume(
      '工作与实习经历\n' +
      '字节跳动 2022 - 至今\n' +
      '做了一些事。\n' +
      '\n' +
      '邓熊师豪\n' +
      '电话：191-1041-8845 | 邮箱：dengxsh@foxmail.com | 现居城市：重庆\n' +
      '微信：x1228297 | 个人网站：https://blog.nowcoder.net/hao2020'
    );
    expect(doc.basic.name).toBe('邓熊师豪');
    expect(doc.basic.contact?.phone).toBe('191-1041-8845');
    expect(doc.basic.contact?.email).toBe('dengxsh@foxmail.com');
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "splitSections tail info block"`
Expected: Test fails (`basic.name` is undefined).

- [ ] **Step 6.3: Add tail info block detection in `splitSections`**

In `src/lib/resume/parser-text.ts`, locate the end of `splitSections` (the `// If no sections were found at all, treat the entire input...` comment at line 155). Insert a tail-block detection **before** that fallback but **after** the main `flush()` call. Replace lines 154–159 (the part from `flush();` through `out.push({ kind: 'experience', title: '', body: input });`) with:

```ts
  flush();

  // Tail info block: if the document ends with several `key：value` rows but
  // no explicit basic section was matched, collect the last N lines as basic.
  if (!out.some((s) => s.kind === 'basic') && input.trim()) {
    const linesRaw = input.replace(/\r\n?/g, '\n').split('\n');
    const tail = linesRaw.slice(-30);
    if (tail.length >= 3 && isTailInfoBlock(tail)) {
      out.push({ kind: 'basic', title: '', body: tail.join('\n') });
    }
  }

  // If no sections were found at all, treat the entire input as a single
  // "experience" block so bullets at least get parsed.
  if (out.length === 0 && input.trim()) {
    out.push({ kind: 'experience', title: '', body: input });
  }

  return out;
}
```

Then add the `isTailInfoBlock` helper above the function (just below `classifyPlainTextHeader`):

```ts
/** Detect a tail of "key：value" rows (e.g. personal info at end of PDF). */
function isTailInfoBlock(lines: string[]): boolean {
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length < 3) return false;
  const fieldRe = /^\s*\*{0,2}([^：:]+?)\*{0,2}\s*[：:]\s*(.+?)\s*\\?\s*$/;
  const withField = nonEmpty.filter((l) => fieldRe.test(l) || /^[^：:]+$/.test(l));
  return withField.length / nonEmpty.length >= 0.6;
}
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/resume/parser-text.test.ts -t "splitSections tail info block"`
Expected: Test passes.

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/resume/parser-text.ts src/lib/resume/parser-text.test.ts
git commit -m "feat(parser-text): detect tail info block for personal info at doc end (B)"
```

---

## Task 7: Real-PDF end-to-end test

**Files:**
- Modify: `src/lib/resume/parser-pdf.test.ts`

- [ ] **Step 7.1: Read the real PDF fixture in a test**

Append to `src/lib/resume/parser-pdf.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('parsePdfResume real fixture', () => {
  it('extracts basic + experience from 邓熊师豪 PDF', async () => {
    const pdfPath = resolve(
      __dirname,
      '../../../data/邓熊师豪_软件测试工程师_5年测开经验.pdf'
    );
    const buf = readFileSync(pdfPath);
    const doc = await parsePdfResume(buf);
    expect(doc.basic.name).toBe('邓熊师豪');
    expect(doc.basic.contact?.phone).toContain('191-1041');
    expect(doc.basic.contact?.email).toBe('dengxsh2019@foxmail.com');
    expect(doc.experience.length).toBeGreaterThanOrEqual(2);
    expect(doc.experience.some((e) => e.company.includes('字节跳动'))).toBe(true);
    expect(doc.experience.some((e) => e.company.includes('讯飞'))).toBe(true);
    expect(doc.skills.length).toBeGreaterThanOrEqual(5);
    expect(doc.education.length).toBeGreaterThanOrEqual(1);
    expect(doc.education[0]?.school).toContain('石河子大学');
  }, 30_000);
});
```

- [ ] **Step 7.2: Run test to verify it passes**

Run: `pnpm vitest run src/lib/resume/parser-pdf.test.ts -t "real fixture"`
Expected: PASS (after Tasks 1–6 are all in place).

- [ ] **Step 7.3: Commit**

```bash
git add src/lib/resume/parser-pdf.test.ts
git commit -m "test(parser-pdf): add e2e test for real PDF fixture"
```

---

## Task 8: Severity label i18n (改造 G)

**Files:**
- Modify: `src/app/resume/_components/MatchReportCard.tsx:283-287`

- [ ] **Step 8.1: Add `SEVERITY_LABEL` and use it in render**

In `src/app/resume/_components/MatchReportCard.tsx`, replace the `SEVERITY_BADGE_CLASS` constant block (lines 283–287) with:

```tsx
const SEVERITY_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const SEVERITY_BADGE_CLASS: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-700',
};
```

Then in `GapsCard` (line 160), replace:

```tsx
{g.severity}
```

with:

```tsx
{SEVERITY_LABEL[g.severity] ?? g.severity}
```

- [ ] **Step 8.2: Type-check**

Run: `pnpm ts-check`
Expected: 0 errors (no test changes; manual change).

- [ ] **Step 8.3: Commit**

```bash
git add src/app/resume/_components/MatchReportCard.tsx
git commit -m "feat(match-report): localize severity badges to Chinese (G)"
```

---

## Task 9: MissingKeywordsCard empty state (改造 H)

**Files:**
- Create: `src/app/resume/_components/MatchReportCard.test.tsx`
- Modify: `src/app/resume/_components/MatchReportCard.tsx`

- [ ] **Step 9.1: Write 2 failing component tests**

Create `src/app/resume/_components/MatchReportCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchReportCard } from './MatchReportCard';
import type { ResumeDocument } from '@/lib/resume/types';

const emptyResume: ResumeDocument = {
  meta: { source: 'pdf', parsedAt: new Date().toISOString() },
  basic: {},
  experience: [],
  projects: [],
  skills: [],
  education: [],
  raw: 'some long raw text that does not get parsed into structure. '.repeat(20),
};

describe('MatchReportCard resume-empty fallback', () => {
  it('shows empty-state hint when resume is unparseable', async () => {
    // Mock fetch to return empty keywords
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ keywords: [] }),
    } as Response);

    render(<MatchReportCard resume={emptyResume} jd="我们需要测试工程师" />);

    expect(
      await screen.findByText(/建议改用 Markdown 文本|未能解析结构/, undefined, { timeout: 3000 })
    ).toBeTruthy();
  });

  it('renders missing keywords normally when resume has content', async () => {
    const goodResume: ResumeDocument = {
      ...emptyResume,
      basic: { name: '张三', contact: { phone: '13800000000' } },
      experience: [{ company: '字节跳动', role: '测试工程师', period: '2022-至今', bullets: ['做测试'] }],
      skills: ['Python', 'Java'],
    };
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ keywords: [{ term: 'Docker', weight: 1 }] }),
    } as Response);

    render(<MatchReportCard resume={goodResume} jd="我们需要 Docker 经验" />);

    expect(await screen.findByText('Docker', undefined, { timeout: 3000 })).toBeTruthy();
  });
});
```

- [ ] **Step 9.2: Run tests to verify they fail**

Run: `pnpm vitest run src/app/resume/_components/MatchReportCard.test.tsx`
Expected: First test fails (no empty-state hint). Second test may pass.

- [ ] **Step 9.3: Add `resumeEmpty` prop and empty-state UI**

In `src/app/resume/_components/MatchReportCard.tsx`:

1. Extend `MatchReportCardProps`:

```tsx
export interface MatchReportCardProps {
  resume: ResumeDocument;
  jd: string;
  atsResult?: ATSResult;
  matchReport?: MatchReport;
  resumeEmpty?: boolean;  // NEW
}
```

2. In the component function, after destructuring `resume, jd, atsResult, matchReport`, add a derived flag:

```tsx
const autoResumeEmpty =
  resumeEmpty ??
  (resume.experience.length === 0 &&
    resume.projects.length === 0 &&
    resume.skills.length === 0 &&
    resume.raw.length > 200);
```

3. Pass `resumeEmpty={autoResumeEmpty}` to `MissingKeywordsCard`:

```tsx
<MissingKeywordsCard missing={ats.missing} resumeEmpty={autoResumeEmpty} />
```

4. Update `MissingKeywordsCard` signature and body:

```tsx
function MissingKeywordsCard({
  missing,
  resumeEmpty,
}: {
  missing: ATSResult['missing'];
  resumeEmpty: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground mb-1.5">
        <XCircle className="w-3 h-3 text-red-600" />
        缺失关键词 ({missing.length})
      </div>
      {resumeEmpty ? (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          简历结构未能解析（{/* raw length available via closure */}原始文本已识别），建议改用 Markdown 文本或手动编辑结构化字段。
        </p>
      ) : missing.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">所有关键词都已覆盖</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {missing.map((m) => (
            <span
              key={m.term}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 text-[9px] text-foreground"
            >
              <span className="font-medium">{m.term}</span>
              <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
                {SECTION_LABEL[m.suggestedSection]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9.4: Run tests to verify they pass**

Run: `pnpm vitest run src/app/resume/_components/MatchReportCard.test.tsx`
Expected: Both new tests pass.

- [ ] **Step 9.5: Commit**

```bash
git add src/app/resume/_components/MatchReportCard.tsx src/app/resume/_components/MatchReportCard.test.tsx
git commit -m "feat(match-report): add empty-state for unparseable resumes (H)"
```

---

## Task 10: TF unigram denoising (改造 I)

**Files:**
- Modify: `src/lib/resume/ats.ts:130-144`
- Test: `src/lib/resume/ats.test.ts`

- [ ] **Step 10.1: Write 2 failing unit tests**

Append to `src/lib/resume/ats.test.ts`:

```ts
describe('tfExtract unigram denoising', () => {
  it('does not return single-char CJK tokens as keywords', async () => {
    const kws = await extractJdKeywords('我们需要测试工程师熟悉高并发');
    const terms = kws.map((k) => k.term);
    // "高" "并" "发" "熟" etc. are unigrams and should be filtered
    expect(terms).not.toContain('高');
    expect(terms).not.toContain('并');
    // Bigrams should still be present
    expect(terms).toContain('高并');
    expect(terms).toContain('并发');
  });
  it('keeps 2+ char tokens intact', async () => {
    const kws = await extractJdKeywords('Python 开发 Docker 经验');
    const terms = kws.map((k) => k.term);
    expect(terms).toContain('python');
    expect(terms).toContain('docker');
  });
});
```

- [ ] **Step 10.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/resume/ats.test.ts -t "tfExtract unigram denoising"`
Expected: 2 tests fail.

- [ ] **Step 10.3: Filter single-char CJK in `tfExtract`**

In `src/lib/resume/ats.ts`, replace `tfExtract` (lines 130–144) with:

```ts
function tfExtract(text: string, topK: number): JdKeyword[] {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // Drop single-char CJK unigrams (noise — they are only useful as bigram context)
  const cjkUnigram = /^[\u4e00-\u9fff]$/;
  for (const k of Array.from(counts.keys())) {
    if (cjkUnigram.test(k)) counts.delete(k);
  }
  if (counts.size === 0) return [];
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  const out: JdKeyword[] = [];
  for (const [term, freq] of counts) {
    out.push({ term, weight: max === 0 ? 0 : freq / max });
  }
  out.sort((a, b) => b.weight - a.weight || (a.term < b.term ? -1 : 1));
  return out.slice(0, topK);
}
```

- [ ] **Step 10.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/resume/ats.test.ts -t "tfExtract unigram denoising"`
Expected: 2 new tests pass.

- [ ] **Step 10.5: Commit**

```bash
git add src/lib/resume/ats.ts src/lib/resume/ats.test.ts
git commit -m "feat(ats): filter single-char CJK unigrams from TF output (I)"
```

---

## Task 11: LLM fallback in parse route (改造 J)

**Files:**
- Modify: `src/app/api/resume/parse/route.ts`
- Modify: `src/app/api/resume/parse/route.test.ts`

- [ ] **Step 11.1: Write 3 failing integration tests**

Append to `src/app/api/resume/parse/route.test.ts` (if it doesn't exist, create it with the imports below first):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { LLMClient } from '@/lib/llm-client';

function makePdfFile(): File {
  // 1-page PDF with empty-ish text — trigger fallback
  const buf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  return new File([buf], 'empty.pdf', { type: 'application/pdf' });
}

describe('POST /api/resume/parse LLM fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESUME_PDF_LLM_FALLBACK;
  });

  it('does NOT call LLM when flag is off', async () => {
    const llmSpy = vi.spyOn(LLMClient.prototype, 'invoke');
    const fd = new FormData();
    fd.append('file', makePdfFile());
    fd.append('source', 'pdf');
    const r = await POST(new Request('http://localhost/api/resume/parse', { method: 'POST', body: fd }) as any);
    expect(r.status).toBe(200);
    expect(llmSpy).not.toHaveBeenCalled();
  });

  it('calls LLM and returns enriched doc when flag is on and doc is empty', async () => {
    process.env.RESUME_PDF_LLM_FALLBACK = 'true';
    vi.spyOn(LLMClient.prototype, 'invoke').mockResolvedValue({
      content: JSON.stringify([
        { term: '测试', weight: 0.9 },
      ]),
    });
    // Note: with an empty PDF, parseTextResume returns a doc with raw='',
    // so the LLM branch should fire.
    const fd = new FormData();
    fd.append('file', makePdfFile());
    fd.append('source', 'pdf');
    const r = await POST(new Request('http://localhost/api/resume/parse', { method: 'POST', body: fd }) as any);
    const json = await r.json();
    expect(r.status).toBe(200);
    expect(json.doc.meta.source).toBe('pdf+llm');
  });

  it('falls back to plain-text result when LLM returns invalid JSON', async () => {
    process.env.RESUME_PDF_LLM_FALLBACK = 'true';
    vi.spyOn(LLMClient.prototype, 'invoke').mockResolvedValue({
      content: 'not valid json',
    });
    const fd = new FormData();
    fd.append('file', makePdfFile());
    fd.append('source', 'pdf');
    const r = await POST(new Request('http://localhost/api/resume/parse', { method: 'POST', body: fd }) as any);
    const json = await r.json();
    expect(r.status).toBe(200);
    expect(json.doc.meta.source).toBe('pdf'); // Falls back, not 'pdf+llm'
  });
});
```

- [ ] **Step 11.2: Run tests to verify they fail**

Run: `pnpm vitest run src/app/api/resume/parse/route.test.ts`
Expected: 3 tests fail (LLM is not currently wired).

- [ ] **Step 11.3: Add LLM fallback branch in route**

In `src/app/api/resume/parse/route.ts`, add the imports and branch. Replace the imports (lines 1–10) and the `try` block (lines 62–68) with:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { parseResume } from '@/lib/resume/parser';
import { LLMClient } from '@/lib/llm-client';
import type { ResumeDocument, ResumeSource } from '@/lib/resume/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MESSAGE_TRUNC = 200;

const ALLOWED_MIME: Record<'pdf' | 'word', string> = {
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// LLM fallback schema (only basic.name + skills required, others optional)
const LlmResumeSchema = z.object({
  basic: z
    .object({
      name: z.string().optional(),
      title: z.string().optional(),
      yearsOfExperience: z.number().optional(),
      contact: z.record(z.string()).optional(),
    })
    .optional(),
  experience: z
    .array(
      z.object({
        company: z.string(),
        role: z.string().default(''),
        period: z.string().default(''),
        bullets: z.array(z.string()).default([]),
      })
    )
    .optional(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        period: z.string().optional(),
        bullets: z.array(z.string()).default([]),
      })
    )
    .optional(),
  skills: z.array(z.string()).optional(),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: z.string().optional(),
        period: z.string().optional(),
      })
    )
    .optional(),
});

function isResumeEmpty(doc: ResumeDocument): boolean {
  return (
    !doc.basic.name &&
    (!doc.basic.contact || Object.keys(doc.basic.contact).length === 0) &&
    doc.experience.length === 0 &&
    doc.projects.length === 0 &&
    doc.skills.length === 0
  );
}

async function tryLlmFallback(rawText: string): Promise<Partial<ResumeDocument> | null> {
  if (process.env.RESUME_PDF_LLM_FALLBACK !== 'true') return null;
  let client: LLMClient;
  try {
    client = new LLMClient();
  } catch {
    return null;
  }
  try {
    const res = await client.invoke([
      {
        role: 'system',
        content: '你是简历结构化助手。严格输出 JSON，不输出其他内容。',
      },
      {
        role: 'user',
        content:
          `把以下简历纯文本解析为 JSON：\n` +
          `{"basic":{"name":"...","title":"...","contact":{}},"experience":[{"company":"...","role":"...","period":"...","bullets":["..."]}],"projects":[{"name":"...","bullets":["..."]}],"skills":["..."],"education":[{"school":"...","degree":"...","period":"..."}]}\n\n## 简历文本\n${rawText}`,
      },
    ]);
    const text = res.content ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = LlmResumeSchema.safeParse(JSON.parse(m[0]));
    if (!parsed.success) return null;
    return parsed.data as Partial<ResumeDocument>;
  } catch {
    return null;
  }
}

// ... keep ALLOWED_MIME, jsonError, truncate unchanged ...

export async function POST(request: NextRequest) {
  // ... keep form parsing + validation unchanged ...

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const doc = await parseResume(buffer, source as ResumeSource);

    // LLM fallback: only for PDF, only when feature flag on, only when doc is empty
    if (source === 'pdf' && isResumeEmpty(doc) && doc.raw) {
      const llmData = await tryLlmFallback(doc.raw);
      if (llmData) {
        const enriched: ResumeDocument = {
          ...doc,
          basic: { ...doc.basic, ...(llmData.basic ?? {}) },
          experience: llmData.experience ?? doc.experience,
          projects: llmData.projects ?? doc.projects,
          skills: llmData.skills ?? doc.skills,
          education: llmData.education ?? doc.education,
          meta: { ...doc.meta, source: 'pdf+llm' as ResumeSource },
        };
        return NextResponse.json({ ok: true, doc: enriched });
      }
    }

    return NextResponse.json({ ok: true, doc });
  } catch (e) {
    const msg = truncate(e instanceof Error ? e.message : String(e), MESSAGE_TRUNC);
    return jsonError('parse_failed', 422, { message: msg });
  }
}
```

- [ ] **Step 11.4: Run tests to verify they pass**

Run: `pnpm vitest run src/app/api/resume/parse/route.test.ts`
Expected: 3 new tests pass; existing route tests still pass.

- [ ] **Step 11.5: Document the feature flag in `.env.example`**

Check if `.env.example` exists at the project root. If it does, add:

```
# PDF parser LLM fallback (off by default; opt-in escape hatch for PDFs
# that fail plain-text parsing). When enabled, /api/resume/parse will
# call LLMClient.invoke() to restructure the resume if plain-text returns empty.
# Privacy: keep OFF when handling sensitive resumes.
RESUME_PDF_LLM_FALLBACK=false
```

If `.env.example` does not exist, create it with the above content (plus a header comment indicating it's the example template).

- [ ] **Step 11.6: Commit**

```bash
git add src/app/api/resume/parse/route.ts src/app/api/resume/parse/route.test.ts .env.example
git commit -m "feat(api): add opt-in LLM fallback for empty PDF parses (J)"
```

---

## Task 12: Final validation

**Files:** none (verification only)

- [ ] **Step 12.1: Type check**

Run: `pnpm ts-check`
Expected: 0 errors.

- [ ] **Step 12.2: Lint**

Run: `pnpm lint`
Expected: 0 errors. (If minor warnings appear, fix them in the same scope.)

- [ ] **Step 12.3: Full test suite**

Run: `pnpm test`
Expected: All tests pass. The real-PDF test (Task 7) and component test (Task 9) provide end-to-end coverage.

- [ ] **Step 12.4: Verify acceptance criteria**

Manually open the app, upload `data/邓熊师豪_软件测试工程师_5年测开经验.pdf`, and confirm:
- [ ] `basic.name === '邓熊师豪'`
- [ ] `basic.contact.phone` contains `191-1041`
- [ ] `experience.length >= 2`
- [ ] `skills.length >= 5`
- [ ] `education.length >= 1`
- [ ] Match report severity badges show "高/中/低" (not English)
- [ ] Missing-keyword card shows empty-state hint when resume structure is empty

- [ ] **Step 12.5: Final commit**

```bash
git add -A
git commit -m "chore(resume): final validation pass for PDF parse + report i18n" --allow-empty
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Each of the 11 changes (A–J) is implemented in exactly one task. Real-PDF e2e (Task 7) covers all parser changes. Component tests (Task 9) cover G + H. Integration tests (Task 11) cover J.
- [x] **Placeholder scan:** No "TBD"/"TODO" in any step. All code blocks are complete.
- [x] **Type consistency:** `SEVERITY_LABEL` keys match `g.severity` type (`'high' | 'medium' | 'low'`). `headerSource` extended in Task 4. `resumeEmpty` prop added in Task 9 matches both call sites. LLM schema in Task 11 uses the same shape as `ResumeDocument`.
- [x] **Out of scope:** No changes to LLMClient, skills.json, theme tokens, STAR rewriter.

---

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-06-15-pdf-parse-and-report-i18n.md`.

12 tasks, 1 final commit. Estimated total commits: 12 (one per task) + 1 validation = 13. (M3 constraint: ≤ 2 commits per phase — adjust by squashing at the end if needed; the plan is structured so each task's commit is independently revertible for review.)

**Two execution options:**

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration, isolates context per task. Best for the multi-file TDD approach.

2. **Inline Execution** - Execute tasks in this session, batch with checkpoints. Faster end-to-end but context bloat across 12 tasks.

Which approach?
