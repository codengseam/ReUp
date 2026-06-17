// src/lib/resume/parser-text-fixtures.test.ts
// ReUp v2 Phase 6 (A1-A6): regression tests for the 6 parser-text bugs fixed
// in the resume-parse-jd-prompts work. Each case targets Chinese resume
// phrasing patterns (synthetic fixture in
// src/lib/resume/__fixtures__/resume/sample.md), exercising the specific
// code path that was broken.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTextResume } from './parser-text';

const FIXTURE_PATH = join(process.cwd(), 'src/lib/resume/__fixtures__/resume/sample.md');

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

describe('parser-text fixtures (resume-parse-jd-prompts A1-A6)', () => {
  it('A1 + A6: header (header="字节跳动") with inline role/period/location row', () => {
    const input = [
      '## 工作经历',
      '### 字节跳动',
      '懂车帝 - 抖音电商（业务负责人，2022年10月 - 至今，重庆）',
      '- bullet 1',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.experience).toHaveLength(1);
    const e = doc.experience[0]!;
    expect(e.company).toBe('字节跳动');
    expect(e.role).toBe('懂车帝 - 抖音电商');
    expect(e.period).toBe('2022年10月 - 至今');
    expect(e.bullets).toEqual(['bullet 1']);
  });

  it('A1: "AI教育（测试工程师，2019年07月 - 2021年04月，北京）" → company=科大讯飞, role=AI教育', () => {
    const input = [
      '## 工作经历',
      '### 科大讯飞',
      'AI教育（测试工程师，2019年07月 - 2021年04月，北京）',
      '- bullet A',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.experience).toHaveLength(1);
    const e = doc.experience[0]!;
    expect(e.company).toBe('科大讯飞');
    expect(e.role).toBe('AI教育');
    expect(e.period).toBe('2019年07月 - 2021年04月');
    expect(e.bullets).toEqual(['bullet A']);
  });

  it('A2: header "K12 - 智慧考试（团队负责人，2021年04月 - 2022年10月，北京）" — company from paren-left, role from meta', () => {
    const input = [
      '## 工作经历',
      '### K12 - 智慧考试（团队负责人，2021年04月 - 2022年10月，北京）',
      '\\- bullet X',
      '\\- bullet Y',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.experience).toHaveLength(1);
    const e = doc.experience[0]!;
    expect(e.company).toBe('K12 - 智慧考试');
    expect(e.role).toBe('团队负责人');
    expect(e.period).toBe('2021年04月 - 2022年10月');
    expect(e.bullets).toEqual(['bullet X', 'bullet Y']);
  });

  it('A3: project sub-block with title-line + 3 bullets is NOT fanned out into 3 empty projects', () => {
    const input = [
      '## 项目经历',
      '### 懂车帝二手车商城及电商业务',
      '- bullet 1',
      '- bullet 2',
      '',
      '个人 AI 实践项目',
      '- 独立开发，基于 obsidian 搭建个人知识库',
      '- 基于 coze 工作流+ 飞书多维表格构建',
      '- 利用 trae等 ai 工具开发项目',
    ].join('\n');
    const doc = parseTextResume(input);
    // 1 real `###` project + 1 titled "个人 AI 实践项目" sub-block
    // (NOT fanned out into 3 separate empty projects).
    expect(doc.projects).toHaveLength(2);
    expect(doc.projects.map((p) => p.name)).toEqual([
      '懂车帝二手车商城及电商业务',
      '个人 AI 实践项目',
    ]);
    // The "个人 AI 实践项目" entry should carry all 3 bullets as its content
    const ai = doc.projects.find((p) => p.name === '个人 AI 实践项目');
    expect(ai).toBeDefined();
    expect(ai!.bullets.length).toBe(3);
    // None of the resulting project names should be a bullet body
    // (which is what fan-out would have produced).
    for (const p of doc.projects) {
      expect(p.name).not.toMatch(/^obsidian/);
      expect(p.name).not.toMatch(/^coze/);
      expect(p.name).not.toMatch(/^trae/);
    }
  });

  it('A4: skills section does NOT split on `:` / `：` — "数据库：MySQL" stays as one entry', () => {
    const input = [
      '## 专业技能',
      '- **数据库**：MySQL、SQL优化、一致性对账',
      '- **编程语言**：Java（了解）、Python（熟悉）',
    ].join('\n');
    const doc = parseTextResume(input);
    // Expectation: each bullet line contributes 1+ entries split only on
    // the post-colon comma separators. "数据库：MySQL" is one entry, NOT
    // "数据库" and "MySQL" separately.
    expect(doc.skills).toContain('数据库：MySQL');
    expect(doc.skills).toContain('SQL优化');
    expect(doc.skills).toContain('一致性对账');
    expect(doc.skills).toContain('编程语言：Java（了解）');
    expect(doc.skills).toContain('Python（熟悉）');
    // Sanity: "数据库" alone should NOT appear (it has a trailing colon)
    expect(doc.skills.find((s) => s === '数据库')).toBeUndefined();
  });

  it('A5: education "相关课程" + "专业成绩前 5%" bullet lines are captured as `notes`', () => {
    const input = [
      '## 教育经历',
      '**石河子大学** | 软件工程 本科 | 计算机科学系 全日制',
      '2016年09月 - 2020年07月 | 石河子',
      '- 相关课程：数据库原理、软件工程',
      '- 专业成绩前5%',
    ].join('\n');
    const doc = parseTextResume(input);
    expect(doc.education).toHaveLength(1);
    const e = doc.education[0]!;
    expect(e.school).toContain('石河子大学');
    expect(e.notes).toBeDefined();
    expect(e.notes!.length).toBe(2);
    expect(e.notes![0]).toContain('相关课程');
    expect(e.notes![1]).toContain('专业成绩前5%');
  });

  it('end-to-end: real fixture produces the expected high-level shape', () => {
    const doc = parseTextResume(loadFixture());
    // 3 companies, 3 sub-periods each
    expect(doc.experience.map((e) => e.company)).toEqual([
      '字节跳动',
      'K12 - 智慧考试',
      '科大讯飞',
    ]);
    expect(doc.experience.map((e) => e.role)).toEqual([
      '懂车帝 - 抖音电商',
      '团队负责人',
      'AI教育',
    ]);
    // 3 project sub-blocks (down from 5 before A3 fix)
    expect(doc.projects).toHaveLength(3);
    expect(doc.projects.map((p) => p.name)).toEqual([
      '懂车帝二手车商城及电商业务',
      '进校智慧考试和阅卷系统',
      '个人 AI 实践项目',
    ]);
    // 1 education entry with notes
    expect(doc.education).toHaveLength(1);
    expect(doc.education[0]!.notes).toBeDefined();
    expect(doc.education[0]!.notes!.length).toBeGreaterThanOrEqual(1);
  });
});
