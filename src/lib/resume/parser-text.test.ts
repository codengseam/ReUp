// src/lib/resume/parser-text.test.ts
// ReUp v2 Phase 3 P0 (A2): plain-text resume parser tests.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTextResume } from './parser-text';
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
      '**姓名**：示例候选人',
      '**电话**：000-0000-0000',
      '**邮箱**：example@example.com',
      '**工作经验**：5年+ 测试开发经验',
      '**求职意向**：软件测试工程师',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.basic.name).toBe('示例候选人');
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
