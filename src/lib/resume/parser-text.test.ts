// src/lib/resume/parser-text.test.ts
// ReUp v2 Phase 3 P0 (A2): plain-text resume parser tests.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTextResume, shouldFallback, llmFallbackParse } from './parser-text';
import type { ResumeDocument } from './types';

const FIXTURE_PATH = join(process.cwd(), 'data/user-samples/resume/简历.md');

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

describe('parseTextResume', () => {
  it('parses the real fixture into the expected shape', () => {
    const input = loadFixture();
    const doc = parseTextResume(input);
    expect(doc.meta.source).toBe('text');
    expect(doc.raw).toBe(input);
    expect(doc.experience.length).toBeGreaterThanOrEqual(3);
    expect(doc.projects.length).toBeGreaterThanOrEqual(3);
    // each experience entry has the required fields populated
    for (const exp of doc.experience) {
      expect(typeof exp.company).toBe('string');
      expect(typeof exp.role).toBe('string');
      expect(typeof exp.period).toBe('string');
      expect(Array.isArray(exp.bullets)).toBe(true);
    }
  });

  it('parses a simple inline experience block', () => {
    const input = [
      '# Title',
      '## 工作经历',
      '- Company | Role | 2020-2023',
      '  - bullet 1',
      '  - bullet 2',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.experience).toHaveLength(1);
    expect(doc.experience[0].company).toBe('Company');
    expect(doc.experience[0].role).toBe('Role');
    expect(doc.experience[0].period).toBe('2020-2023');
    expect(doc.experience[0].bullets).toEqual(['bullet 1', 'bullet 2']);
  });

  it('returns an empty document for empty input', () => {
    const doc = parseTextResume('');
    expect(doc.meta.source).toBe('text');
    expect(doc.raw).toBe('');
    expect(doc.basic).toEqual({});
    expect(doc.experience).toEqual([]);
    expect(doc.projects).toEqual([]);
    expect(doc.skills).toEqual([]);
    expect(doc.education).toEqual([]);
  });

  it('stamps meta.source as text', () => {
    const doc = parseTextResume('## 工作经历\n');
    expect(doc.meta.source).toBe('text');
    expect(doc.meta.version).toMatch(/^reup\./);
  });

  it('parses the skills section as an array of strings', () => {
    const input = [
      '## 专业技能',
      '- MySQL、SQL优化、一致性对账',
      '- Python（熟悉）',
      '- **测试方法**：Web、APP、接口',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.skills.length).toBeGreaterThan(0);
    expect(doc.skills.every((s) => typeof s === 'string')).toBe(true);
    expect(doc.skills.join('|')).toMatch(/MySQL/);
  });

  it('parses education with school / degree / period', () => {
    const input = [
      '## 教育经历',
      '**石河子大学** | 软件工程 本科 | 计算机科学系 全日制',
      '2016年09月 - 2020年07月 | 石河子',
      '- 相关课程：数据库原理、软件工程',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.education).toHaveLength(1);
    expect(doc.education[0].school).toContain('石河子大学');
    expect(doc.education[0].degree).toMatch(/软件工程/);
    expect(doc.education[0].period).toMatch(/2016/);
  });

  it('extracts basic info from 个人信息 / 姓名 block', () => {
    const input = [
      '## 个人信息',
      '**姓名**：邓熊师豪',
      '**电话**：191-1041-8845',
      '**邮箱**：dengxsh2019@foxmail.com',
      '**工作经验**：5年+ 测试开发经验',
      '**求职意向**：软件测试工程师',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.basic.name).toBe('邓熊师豪');
    expect(doc.basic.title).toMatch(/测试/);
    expect(doc.basic.yearsOfExperience).toBeGreaterThanOrEqual(5);
    expect(doc.basic.contact?.phone).toMatch(/191/);
    expect(doc.basic.contact?.email).toMatch(/foxmail/);
  });

  it('recognises English section headers (Experience, Projects, Skills, Education)', () => {
    const input = [
      '## Experience',
      '### Acme',
      '**Engineer | 2020 - 2022**',
      '- did X',
      '',
      '## Projects',
      '### Tool',
      '- built it',
      '',
      '## Skills',
      '- TypeScript, Go',
      '',
      '## Education',
      'MIT | CS BS | 2016 - 2020',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.experience).toHaveLength(1);
    expect(doc.experience[0].company).toBe('Acme');
    expect(doc.projects).toHaveLength(1);
    expect(doc.projects[0].name).toBe('Tool');
    expect(doc.skills).toEqual(['TypeScript', 'Go']);
    expect(doc.education).toHaveLength(1);
    expect(doc.education[0].school).toContain('MIT');
  });

  it('returns a valid ResumeDocument type instance (compile-time check)', () => {
    const doc: ResumeDocument = parseTextResume('## 技能\n- x');
    expect(doc).toBeDefined();
  });

  // Bug B: trailing info block at end of file should be recognised as basic
  it('recognises tail info block as basic section', () => {
    const input = [
      '## 工作经历',
      '### 字节跳动',
      '测试开发工程师 2020-2022',
      '- 负责质量保障',
      '',
      '姓名：张三',
      '电话：138-0000-0000',
      '邮箱：zhangsan@example.com',
      '微信：zhangsan_wx',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.basic.name).toBe('张三');
    expect(doc.basic.contact?.phone).toBe('138-0000-0000');
    expect(doc.basic.contact?.email).toBe('zhangsan@example.com');
    expect(doc.basic.contact?.wechat).toBe('zhangsan_wx');
  });

  // Bug B variant: tail info block in plain-text mode (no ## headers)
  it('recognises tail info block when no sections detected', () => {
    const input = [
      '姓名：张三',
      '电话：138-0000-0000',
      '邮箱：zhangsan@example.com',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.basic.name).toBe('张三');
    expect(doc.basic.contact?.phone).toBe('138-0000-0000');
    expect(doc.basic.contact?.email).toBe('zhangsan@example.com');
  });

  // Bug C: pipe-separated key:value pairs in basic section
  it('parses pipe-separated basic fields', () => {
    const input = [
      '## 个人信息',
      '电话：191-1041-8845 | 邮箱：dengxsh@foxmail.com | 现居城市：重庆',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.basic.contact?.phone).toBe('191-1041-8845');
    expect(doc.basic.contact?.email).toBe('dengxsh@foxmail.com');
    expect(doc.basic.contact?.['现居城市']).toBe('重庆');
  });

  // Bug D: long sentence skills without bullets should be split by sentence terminators
  it('splits long sentence skills by semicolons / periods', () => {
    const input = [
      '## 专业技能',
      '熟悉Java编程。掌握Spring Boot框架。了解MySQL数据库。熟悉Redis缓存技术',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.skills.length).toBeGreaterThanOrEqual(4);
    expect(doc.skills.some((s) => s.includes('Java'))).toBe(true);
    expect(doc.skills.some((s) => s.includes('Spring Boot'))).toBe(true);
    expect(doc.skills.some((s) => s.includes('MySQL'))).toBe(true);
    expect(doc.skills.some((s) => s.includes('Redis'))).toBe(true);
  });

  // Bug E: paragraph-style experience split by standalone period lines
  it('splits paragraph-style experience by period lines', () => {
    const input = [
      '## 工作经历',
      '2020年 - 2022年',
      '字节跳动 测试开发工程师',
      '负责质量保障体系建设',
      '',
      '2022年 - 至今',
      '腾讯 高级测试开发工程师',
      '负责自动化测试平台',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.experience.length).toBe(2);
    expect(doc.experience[0].period).toMatch(/2020/);
    expect(doc.experience[1].period).toMatch(/2022/);
  });
});

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

// ---------------------------------------------------------------------------
// Phase 1 J: LLM Fallback — shouldFallback
// ---------------------------------------------------------------------------

describe('shouldFallback', () => {
  const makeDoc = (overrides: Partial<ResumeDocument> = {}): ResumeDocument => ({
    meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
    basic: {},
    experience: [],
    projects: [],
    skills: [],
    education: [],
    raw: '',
    ...overrides,
  });

  it('returns true when all core fields are empty and raw > 200', () => {
    const doc = makeDoc({ raw: 'a'.repeat(201) });
    expect(shouldFallback(doc)).toBe(true);
  });

  it('returns false when name exists', () => {
    const doc = makeDoc({ basic: { name: '张三' }, raw: 'a'.repeat(201) });
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when experience exists', () => {
    const doc = makeDoc({
      experience: [{ company: 'A', role: 'B', period: 'C', bullets: [] }],
      raw: 'a'.repeat(201),
    });
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when projects exist', () => {
    const doc = makeDoc({
      projects: [{ name: 'P', bullets: [] }],
      raw: 'a'.repeat(201),
    });
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when skills exist', () => {
    const doc = makeDoc({ skills: ['Java'], raw: 'a'.repeat(201) });
    expect(shouldFallback(doc)).toBe(false);
  });

  it('returns false when raw <= 200', () => {
    const doc = makeDoc({ raw: 'a'.repeat(200) });
    expect(shouldFallback(doc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 J: LLM Fallback — llmFallbackParse
// ---------------------------------------------------------------------------

describe('llmFallbackParse', () => {
  const fallback: ResumeDocument = {
    meta: { version: '1', source: 'text', createdAt: new Date().toISOString() },
    basic: {},
    experience: [],
    projects: [],
    skills: [],
    education: [],
    raw: 'test text',
  };

  it('returns structured doc when LLM returns valid JSON', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        name: '张三',
        title: '工程师',
        city: '北京',
        contact: { phone: '123' },
        experience: [{ company: 'A', role: 'B', period: 'C', bullets: ['d'] }],
        projects: [{ name: 'P', period: 'Q', bullets: ['r'] }],
        education: [{ school: 'S', degree: 'D', period: 'E', notes: ['f'] }],
        skills: ['Java'],
      }),
    });

    const result = await llmFallbackParse('some long resume text...', mockLLM, fallback);

    expect(result.basic.name).toBe('张三');
    expect(result.basic.title).toBe('工程师');
    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]!.company).toBe('A');
    expect(result.skills).toEqual(['Java']);
    expect(result.meta.source).toBe('pdf+llm');
  });

  it('returns fallback doc when LLM throws', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM error'));
    const result = await llmFallbackParse('some text', mockLLM, fallback);
    expect(result).toBe(fallback);
  });

  it('returns fallback doc when LLM returns invalid JSON', async () => {
    const mockLLM = vi.fn().mockResolvedValue({ content: 'not json at all' });
    const result = await llmFallbackParse('some text', mockLLM, fallback);
    expect(result).toBe(fallback);
  });

  it('uses empty defaults when LLM returns partial data', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({ name: '李四' }),
    });
    const result = await llmFallbackParse('some text', mockLLM, fallback);
    expect(result.basic.name).toBe('李四');
    expect(result.experience).toEqual([]);
    expect(result.skills).toEqual([]);
  });
});
