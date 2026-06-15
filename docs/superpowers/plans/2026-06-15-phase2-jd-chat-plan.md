# Phase 2: JD 解析增强 + Chat-Resume 联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 深化 JD 理解能力，打通 Chat 与 Resume 数据联动。

**Architecture:** 新增 `jd/` 子模块负责 JD 解析和智能对比，修改 `chat/` 模块注入简历上下文，扩展意图分类器支持简历相关意图。

**Tech Stack:** Next.js 16 + React 19 + TypeScript 5 + Vitest 4 + zod + DashScope Qwen

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/jd/types.ts` | JDDocument / SmartMatchResult 类型定义 |
| `src/lib/jd/parser.ts` | JD 文本解析（LLM + Rule-based 双路径） |
| `src/lib/jd/parser.test.ts` | JD 解析单元测试 |
| `src/lib/jd/smart-matcher.ts` | 简历与 JD 智能对比引擎 |
| `src/lib/jd/smart-matcher.test.ts` | 智能对比单元测试 |
| `src/lib/chat/resume-context.ts` | 简历上下文注入 |
| `src/lib/chat/resume-context.test.ts` | 上下文注入测试 |
| `src/lib/intent-classifier.ts` | 扩展意图分类（修改） |
| `src/lib/resume/ats.ts` | 集成 JDDocument（修改） |
| `src/app/api/chat/route.ts` | 注入简历上下文（修改） |

---

## Task 1: JD 类型定义

**Files:**
- Create: `src/lib/jd/types.ts`

- [ ] **Step 1: 创建 JDDocument 类型**

```typescript
export interface JDDocument {
  meta: {
    source: 'text' | 'llm';
    parsedAt: string;
  };
  title: string;
  department?: string;
  level?: string;
  location?: string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  hardRequirements: Array<{
    category: '学历' | '经验' | '技能' | '证书' | '其他';
    description: string;
    priority: 'must' | 'preferred';
  }>;
  responsibilities: string[];
  skills: Array<{
    name: string;
    level: '精通' | '熟悉' | '了解';
    required: boolean;
  }>;
  team?: {
    size?: string;
    structure?: string;
    culture?: string[];
  };
  raw: string;
}

export interface SmartMatchResult {
  overallScore: number;
  dimensionScores: Array<{
    dimension: string;
    score: number;
    resumeEvidence: string;
    jdRequirement: string;
    gap?: string;
  }>;
  redFlags: string[];
  greenFlags: string[];
  suggestions: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    targetSection: 'basic' | 'experience' | 'projects' | 'skills';
  }>;
}
```

- [ ] **Step 2: 运行类型检查**

Run: `cd /workspace && pnpm ts-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/jd/types.ts
git commit -m "types(jd): add JDDocument and SmartMatchResult types"
```

---

## Task 2: JD 解析器（TDD）

**Files:**
- Create: `src/lib/jd/parser.ts`
- Create: `src/lib/jd/parser.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseJD } from './parser';

describe('parseJD', () => {
  it('parses standard JD text via LLM path', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      title: '高级前端工程师',
      department: '技术部',
      level: 'P6',
      location: '北京',
      hardRequirements: [
        { category: '学历', description: '本科及以上', priority: 'must' },
        { category: '经验', description: '3年以上前端经验', priority: 'must' },
      ],
      responsibilities: ['负责前端架构设计', '优化性能'],
      skills: [
        { name: 'React', level: '精通', required: true },
        { name: 'TypeScript', level: '熟悉', required: true },
      ],
    });

    const jdText = '招聘高级前端工程师...';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });

    expect(result.title).toBe('高级前端工程师');
    expect(result.hardRequirements).toHaveLength(2);
    expect(result.skills).toHaveLength(2);
    expect(result.meta.source).toBe('llm');
  });

  it('falls back to rule-based when LLM fails', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM error'));
    const jdText = '招聘 Java 工程师，要求 3 年以上经验，本科以上学历。';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });

    expect(result.title).toBe('Java 工程师');
    expect(result.hardRequirements.length).toBeGreaterThan(0);
    expect(result.meta.source).toBe('text');
  });

  it('extracts salary range from text', async () => {
    const jdText = '薪资：20k-35k';
    const result = await parseJD(jdText);
    expect(result.salary).toEqual({ min: 20000, max: 35000, currency: 'CNY' });
  });

  it('extracts experience years from text', async () => {
    const jdText = '要求 3 年以上工作经验';
    const result = await parseJD(jdText);
    const expReq = result.hardRequirements.find(r => r.category === '经验');
    expect(expReq?.description).toContain('3');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace && pnpm test -- src/lib/jd/parser.test.ts --reporter=verbose`
Expected: FAIL - "parseJD is not defined"

- [ ] **Step 3: 实现 parseJD**

```typescript
import { z } from 'zod';
import type { JDDocument } from './types';

const JDSchema = z.object({
  title: z.string(),
  department: z.string().optional(),
  level: z.string().optional(),
  location: z.string().optional(),
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional(),
  }).optional(),
  hardRequirements: z.array(z.object({
    category: z.enum(['学历', '经验', '技能', '证书', '其他']),
    description: z.string(),
    priority: z.enum(['must', 'preferred']),
  })).optional().default([]),
  responsibilities: z.array(z.string()).optional().default([]),
  skills: z.array(z.object({
    name: z.string(),
    level: z.enum(['精通', '熟悉', '了解']),
    required: z.boolean(),
  })).optional().default([]),
  team: z.object({
    size: z.string().optional(),
    structure: z.string().optional(),
    culture: z.array(z.string()).optional(),
  }).optional(),
});

function ruleBasedParse(raw: string): JDDocument {
  const titleMatch = raw.match(/(?:招聘|诚聘|急聘)\s*[:：]?\s*(.+?)(?:\n|$)/);
  const title = titleMatch?.[1]?.trim() || '未知职位';

  const salaryMatch = raw.match(/(\d+)[kK]?\s*[-~]\s*(\d+)[kK]?/);
  const salary = salaryMatch ? {
    min: parseInt(salaryMatch[1]) * (salaryMatch[1].includes('k') || salaryMatch[1].includes('K') ? 1000 : 1),
    max: parseInt(salaryMatch[2]) * (salaryMatch[2].includes('k') || salaryMatch[2].includes('K') ? 1000 : 1),
    currency: 'CNY',
  } : undefined;

  const expMatch = raw.match(/(\d+)\s*年(?:以上)?(?:工作)?经验/);
  const hardRequirements: JDDocument['hardRequirements'] = [];
  if (expMatch) {
    hardRequirements.push({
      category: '经验',
      description: `${expMatch[1]}年以上工作经验`,
      priority: 'must',
    });
  }

  const eduMatch = raw.match(/(本科|硕士|博士|大专)(?:及以上)?/);
  if (eduMatch) {
    hardRequirements.push({
      category: '学历',
      description: `${eduMatch[1]}及以上学历`,
      priority: 'must',
    });
  }

  return {
    meta: { source: 'text', parsedAt: new Date().toISOString() },
    title,
    salary,
    hardRequirements,
    responsibilities: [],
    skills: [],
    raw,
  };
}

export async function parseJD(
  raw: string,
  options?: {
    llmInvoke?: (prompt: string) => Promise<unknown>;
  },
): Promise<JDDocument> {
  if (options?.llmInvoke) {
    try {
      const prompt = `从以下 JD 文本中提取结构化信息，输出 JSON：\n\n${raw}`;
      const response = await options.llmInvoke(prompt);
      const parsed = JDSchema.parse(response);
      return {
        ...parsed,
        meta: { source: 'llm', parsedAt: new Date().toISOString() },
        raw,
      };
    } catch {
      // fall through to rule-based
    }
  }
  return ruleBasedParse(raw);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace && pnpm test -- src/lib/jd/parser.test.ts --reporter=verbose`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/jd/
git commit -m "feat(jd): add JD parser with LLM + rule-based dual path"
```

---

## Task 3: 智能对比引擎（TDD）

**Files:**
- Create: `src/lib/jd/smart-matcher.ts`
- Create: `src/lib/jd/smart-matcher.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
import { describe, it, expect } from 'vitest';
import { smartMatch } from './smart-matcher';
import type { ResumeDocument } from '../resume/types';
import type { JDDocument } from './types';

describe('smartMatch', () => {
  const mockResume: ResumeDocument = {
    meta: { version: '1', source: 'text', createdAt: '' },
    basic: { name: '张三', title: '前端工程师', yearsOfExperience: 5 },
    experience: [
      { company: 'A', role: '前端工程师', period: '2019-2024', bullets: ['React', 'TypeScript'] },
    ],
    projects: [],
    skills: ['React', 'TypeScript', 'Node.js'],
    education: [{ school: 'S', degree: '本科', period: '2015-2019' }],
    raw: '',
  };

  const mockJD: JDDocument = {
    meta: { source: 'llm', parsedAt: '' },
    title: '高级前端工程师',
    hardRequirements: [
      { category: '经验', description: '3年以上前端经验', priority: 'must' },
      { category: '学历', description: '本科及以上学历', priority: 'must' },
    ],
    responsibilities: ['前端开发', '性能优化'],
    skills: [
      { name: 'React', level: '精通', required: true },
      { name: 'Vue', level: '熟悉', required: false },
    ],
    raw: '',
  };

  it('calculates overall match score', () => {
    const result = smartMatch(mockResume, mockJD);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('identifies skill matches', () => {
    const result = smartMatch(mockResume, mockJD);
    const skillScore = result.dimensionScores.find(d => d.dimension === '技能');
    expect(skillScore?.score).toBeGreaterThan(0);
    expect(skillScore?.resumeEvidence).toContain('React');
  });

  it('identifies experience gaps', () => {
    const result = smartMatch(mockResume, mockJD);
    const expScore = result.dimensionScores.find(d => d.dimension === '经验');
    expect(expScore?.score).toBeGreaterThan(0);
  });

  it('flags missing required skills', () => {
    const result = smartMatch(mockResume, mockJD);
    const vueGap = result.dimensionScores.find(d => d.gap?.includes('Vue'));
    expect(vueGap).toBeDefined();
  });

  it('generates actionable suggestions', () => {
    const result = smartMatch(mockResume, mockJD);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].targetSection).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace && pnpm test -- src/lib/jd/smart-matcher.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: 实现 smartMatch**

```typescript
import type { ResumeDocument } from '../resume/types';
import type { JDDocument, SmartMatchResult } from './types';

export function smartMatch(resume: ResumeDocument, jd: JDDocument): SmartMatchResult {
  const dimensionScores: SmartMatchResult['dimensionScores'] = [];
  const redFlags: string[] = [];
  const greenFlags: string[] = [];
  const suggestions: SmartMatchResult['suggestions'] = [];

  // 技能匹配
  const resumeSkills = new Set(resume.skills.map(s => s.toLowerCase()));
  const matchedSkills = jd.skills.filter(s => resumeSkills.has(s.name.toLowerCase()));
  const missingRequired = jd.skills.filter(s => s.required && !resumeSkills.has(s.name.toLowerCase()));
  const skillScore = jd.skills.length > 0 ? Math.round((matchedSkills.length / jd.skills.length) * 100) : 0;

  dimensionScores.push({
    dimension: '技能',
    score: skillScore,
    resumeEvidence: `掌握: ${matchedSkills.map(s => s.name).join(', ')}`,
    jdRequirement: `要求: ${jd.skills.map(s => s.name).join(', ')}`,
    gap: missingRequired.length > 0 ? `缺失: ${missingRequired.map(s => s.name).join(', ')}` : undefined,
  });

  if (missingRequired.length > 0) {
    suggestions.push({
      priority: 'high',
      action: `补充技能: ${missingRequired.map(s => s.name).join(', ')}`,
      targetSection: 'skills',
    });
  }

  // 经验匹配
  const years = resume.basic.yearsOfExperience ?? 0;
  const expReq = jd.hardRequirements.find(r => r.category === '经验');
  const requiredYears = expReq ? parseInt(expReq.description.match(/\d+/)?.[0] || '0') : 0;
  const expScore = requiredYears > 0 ? Math.min(100, Math.round((years / requiredYears) * 100)) : 100;

  dimensionScores.push({
    dimension: '经验',
    score: expScore,
    resumeEvidence: `${years}年工作经验`,
    jdRequirement: expReq?.description || '无明确要求',
    gap: years < requiredYears ? `差 ${requiredYears - years} 年` : undefined,
  });

  if (years < requiredYears) {
    redFlags.push(`经验不足: 要求 ${requiredYears} 年，实际 ${years} 年`);
  } else {
    greenFlags.push(`经验满足: ${years} 年 >= 要求 ${requiredYears} 年`);
  }

  // 学历匹配
  const eduReq = jd.hardRequirements.find(r => r.category === '学历');
  const hasDegree = resume.education.length > 0;
  const eduScore = eduReq ? (hasDegree ? 100 : 0) : 100;

  dimensionScores.push({
    dimension: '学历',
    score: eduScore,
    resumeEvidence: hasDegree ? resume.education[0].degree : '未填写',
    jdRequirement: eduReq?.description || '无明确要求',
  });

  if (!hasDegree && eduReq) {
    redFlags.push('学历不满足要求');
  }

  // 计算总分
  const overallScore = Math.round(
    dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length
  );

  return {
    overallScore,
    dimensionScores,
    redFlags,
    greenFlags,
    suggestions,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace && pnpm test -- src/lib/jd/smart-matcher.test.ts --reporter=verbose`
Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/jd/smart-matcher.ts src/lib/jd/smart-matcher.test.ts
git commit -m "feat(jd): add smart match engine for resume-JD comparison"
```

---

## Task 4: Chat 简历上下文注入

**Files:**
- Create: `src/lib/chat/resume-context.ts`
- Create: `src/lib/chat/resume-context.test.ts`
- Modify: `src/lib/intent-classifier.ts`

- [ ] **Step 1: 实现 resume-context.ts**

```typescript
import type { ResumeDocument } from '../resume/types';

export function buildResumeContext(resume: ResumeDocument | null): string {
  if (!resume) return '';

  const parts: string[] = ['[用户简历摘要]'];

  if (resume.basic.name) parts.push(`姓名: ${resume.basic.name}`);
  if (resume.basic.title) parts.push(`职位: ${resume.basic.title}`);
  if (resume.basic.yearsOfExperience) parts.push(`工作年限: ${resume.basic.yearsOfExperience}年`);
  if (resume.skills.length > 0) parts.push(`技能: ${resume.skills.join(', ')}`);
  if (resume.experience.length > 0) {
    const latest = resume.experience[0];
    parts.push(`最近经历: ${latest.company} - ${latest.role} (${latest.period})`);
  }

  return parts.join('\n');
}

export function shouldInjectResume(message: string): boolean {
  const keywords = ['简历', '我的', '我', '匹配', '差距', '缺什么', '怎么样'];
  return keywords.some(k => message.includes(k));
}
```

- [ ] **Step 2: 写测试**

```typescript
import { describe, it, expect } from 'vitest';
import { buildResumeContext, shouldInjectResume } from './resume-context';
import type { ResumeDocument } from '../resume/types';

describe('buildResumeContext', () => {
  it('returns empty string when no resume', () => {
    expect(buildResumeContext(null)).toBe('');
  });

  it('builds summary from resume', () => {
    const resume: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: '' },
      basic: { name: '张三', title: '工程师', yearsOfExperience: 5 },
      experience: [{ company: 'A', role: 'R', period: '2019-2024', bullets: [] }],
      projects: [],
      skills: ['Java', 'Python'],
      education: [],
      raw: '',
    };
    const ctx = buildResumeContext(resume);
    expect(ctx).toContain('张三');
    expect(ctx).toContain('工程师');
    expect(ctx).toContain('5年');
    expect(ctx).toContain('Java');
    expect(ctx).toContain('A - R');
  });
});

describe('shouldInjectResume', () => {
  it('returns true for resume-related questions', () => {
    expect(shouldInjectResume('我的简历怎么样？')).toBe(true);
    expect(shouldInjectResume('我缺什么技能？')).toBe(true);
    expect(shouldInjectResume('匹配度如何')).toBe(true);
  });

  it('returns false for generic questions', () => {
    expect(shouldInjectResume('什么是 STAR 法则？')).toBe(false);
    expect(shouldInjectResume('怎么准备面试？')).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `cd /workspace && pnpm test -- src/lib/chat/resume-context.test.ts --reporter=verbose`
Expected: 5/5 PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/chat/resume-context.ts src/lib/chat/resume-context.test.ts
git commit -m "feat(chat): add resume context injection for chat"
```

---

## Task 5: 扩展意图分类器

**Files:**
- Modify: `src/lib/intent-classifier.ts`

- [ ] **Step 1: 添加简历相关意图**

在现有意图枚举中添加：

```typescript
export type Intent =
  | 'GENERAL'
  | 'RESUME_QA'
  | 'MATCH_ANALYSIS'
  | 'GAP_ANALYSIS'
  | /* ... existing intents ... */;
```

在分类逻辑中添加：

```typescript
function classifyIntent(message: string): Intent {
  const lower = message.toLowerCase();

  if (lower.includes('匹配') || lower.includes('匹配度')) return 'MATCH_ANALYSIS';
  if (lower.includes('差距') || lower.includes('缺什么')) return 'GAP_ANALYSIS';
  if (lower.includes('简历') || lower.includes('我的')) return 'RESUME_QA';

  // ... existing logic ...
  return 'GENERAL';
}
```

- [ ] **Step 2: 运行测试确认无回归**

Run: `cd /workspace && pnpm test -- src/lib/intent-classifier.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/intent-classifier.ts
git commit -m "feat(chat): extend intent classifier with resume intents"
```

---

## Task 6: 集成到 Chat API

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: 修改路由注入简历上下文**

在 chat route 中，处理用户消息前：

```typescript
import { buildResumeContext, shouldInjectResume } from '@/lib/chat/resume-context';
import { getLatestResume } from '@/lib/resume/storage';

// 在处理消息时
const resume = await getLatestResume(userId);
const resumeContext = buildResumeContext(resume);

if (shouldInjectResume(userMessage) && resumeContext) {
  systemPrompt += `\n\n${resumeContext}`;
}
```

- [ ] **Step 2: 运行测试确认无回归**

Run: `cd /workspace && pnpm test -- src/app/api/chat/route.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): inject resume context into chat API"
```

---

## Task 7: 汇总验证

- [ ] **Step 1: 全量测试**

Run: `cd /workspace && pnpm test --silent`
Expected: >= 680 PASS（原有 658 + 新增 22）

- [ ] **Step 2: Lint**

Run: `cd /workspace && pnpm lint`
Expected: 0 errors

- [ ] **Step 3: TypeCheck**

Run: `cd /workspace && pnpm ts-check`
Expected: PASS

- [ ] **Step 4: 最终 Commit**

```bash
git commit -m "feat(phase2): JD parsing + Chat-Resume linkage

- Add JD parser with LLM + rule-based dual path
- Add smart match engine for resume-JD comparison
- Add resume context injection for chat
- Extend intent classifier with resume intents
- All 680+ tests pass, lint clean, typecheck clean"
```
