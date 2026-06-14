// src/lib/resume/export-md.test.ts
// ReUp v2 Phase 5 (F1): Markdown export unit tests (RED → GREEN).
//
// Coverage:
//  1) Returns a non-empty string
//  2) Each StarSection is rendered as `### 【<section>】` heading
//  3) Basic info, experience, projects, skills, education are rendered
//  4) Empty / missing sections render `（暂无内容）`
//  5) Markdown special chars in input are not broken (no premature heading injection)

import { describe, it, expect } from 'vitest';
import { exportResumeAsMarkdown } from './export-md';
import type { ResumeDocument } from './types';
import type { StarRewriteResult } from './star-rewriter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleResume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: {
    name: '张辰',
    title: '高级后端工程师',
    yearsOfExperience: 6,
    contact: { email: 'zhangchen@example.com', phone: '138-0000-0000' },
  },
  experience: [
    {
      company: '蓝芯科技',
      role: '高级后端工程师',
      period: '2023-03 - 至今',
      bullets: ['负责订单中台微服务架构升级', '主导了缓存体系的优化'],
    },
  ],
  projects: [
    { name: '订单中台微服务升级', period: '2023-06 - 2023-12', bullets: ['把单体拆成 8 个微服务'] },
  ],
  skills: ['Java', 'Spring Cloud', 'MySQL', 'Redis'],
  education: [{ school: '示例大学', degree: '计算机科学 本科', period: '2016-09 - 2020-07' }],
  raw: '张辰 / 高级后端工程师 / 6年',
};

const sampleStar: StarRewriteResult = {
  sections: {
    '我的分析': '亮点在订单中台架构升级与缓存优化。',
    'STAR改写': 'SITUATION: 单体架构撑不住大促...',
    '底层心法': '用「Situation-任务-动作-结果」四段式。',
    '建议': '1) 每条 bullet 含量化指标。',
  },
  confidence: 0.42,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportResumeAsMarkdown', () => {
  it('returns a non-empty string', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('renders the resume title with the candidate name (when present)', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(md).toContain('# 张辰');
  });

  it('renders basic info fields (title, years of experience, contact)', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(md).toContain('高级后端工程师');
    expect(md).toContain('6');
    expect(md).toContain('zhangchen@example.com');
  });

  it('renders experience with company, role, period, and bullets', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(md).toContain('## 工作经历');
    expect(md).toContain('蓝芯科技');
    expect(md).toContain('高级后端工程师');
    expect(md).toContain('2023-03 - 至今');
    expect(md).toContain('负责订单中台微服务架构升级');
    expect(md).toContain('主导了缓存体系的优化');
  });

  it('renders projects with name, period, and bullets', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(md).toContain('## 项目经历');
    expect(md).toContain('订单中台微服务升级');
    expect(md).toContain('2023-06 - 2023-12');
    expect(md).toContain('把单体拆成 8 个微服务');
  });

  it('renders skills as a list', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(md).toContain('## 技能');
    expect(md).toMatch(/Java/);
    expect(md).toMatch(/Spring Cloud/);
    expect(md).toMatch(/MySQL/);
    expect(md).toMatch(/Redis/);
  });

  it('renders education with school, degree, and period', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(md).toContain('## 教育背景');
    expect(md).toContain('示例大学');
    expect(md).toContain('计算机科学 本科');
    expect(md).toContain('2016-09 - 2020-07');
  });

  it('renders all 4 StarSection headings as `### 【<section>】` and includes their content', () => {
    const md = exportResumeAsMarkdown(sampleResume, sampleStar);
    expect(md).toContain('## STAR 改写结果');
    expect(md).toContain('### 【我的分析】');
    expect(md).toContain('### 【STAR改写】');
    expect(md).toContain('### 【底层心法】');
    expect(md).toContain('### 【建议】');
    expect(md).toContain('亮点在订单中台架构升级与缓存优化。');
    expect(md).toContain('SITUATION: 单体架构撑不住大促...');
    expect(md).toContain('用「Situation-任务-动作-结果」四段式。');
    expect(md).toContain('1) 每条 bullet 含量化指标。');
  });

  it('uses `（暂无内容）` placeholder for empty basic info', () => {
    const empty: ResumeDocument = {
      ...sampleResume,
      basic: {},
    };
    const md = exportResumeAsMarkdown(empty, sampleStar);
    // The basic section should still have a placeholder
    expect(md).toContain('（暂无内容）');
  });

  it('uses `（暂无内容）` placeholder for empty experience', () => {
    const noExp: ResumeDocument = {
      ...sampleResume,
      experience: [],
    };
    const md = exportResumeAsMarkdown(noExp, sampleStar);
    expect(md).toContain('## 工作经历');
    // Either the section has the placeholder or it's omitted entirely; both are acceptable
    // per the spec, but here we expect the placeholder to be present.
    expect(md).toContain('（暂无内容）');
  });

  it('uses `（暂无内容）` placeholder for empty projects', () => {
    const noProj: ResumeDocument = {
      ...sampleResume,
      projects: [],
    };
    const md = exportResumeAsMarkdown(noProj, sampleStar);
    expect(md).toContain('## 项目经历');
    expect(md).toContain('（暂无内容）');
  });

  it('uses `（暂无内容）` placeholder for empty skills', () => {
    const noSkills: ResumeDocument = {
      ...sampleResume,
      skills: [],
    };
    const md = exportResumeAsMarkdown(noSkills, sampleStar);
    expect(md).toContain('## 技能');
    expect(md).toContain('（暂无内容）');
  });

  it('uses `（暂无内容）` placeholder for empty education', () => {
    const noEdu: ResumeDocument = {
      ...sampleResume,
      education: [],
    };
    const md = exportResumeAsMarkdown(noEdu, sampleStar);
    expect(md).toContain('## 教育背景');
    expect(md).toContain('（暂无内容）');
  });

  it('omits the STAR 改写结果 section when starResult is undefined', () => {
    const md = exportResumeAsMarkdown(sampleResume);
    expect(md).not.toContain('## STAR 改写结果');
    // The resume parts should still be there
    expect(md).toContain('## 工作经历');
  });

  it('renders empty StarSection content as `（暂无内容）`', () => {
    const emptyStar: StarRewriteResult = {
      sections: {
        '我的分析': '',
        'STAR改写': '',
        '底层心法': '',
        '建议': '',
      },
      confidence: 0,
    };
    const md = exportResumeAsMarkdown(sampleResume, emptyStar);
    expect(md).toContain('## STAR 改写结果');
    // All 4 headings still rendered
    expect(md).toContain('### 【我的分析】');
    expect(md).toContain('### 【STAR改写】');
    expect(md).toContain('### 【底层心法】');
    expect(md).toContain('### 【建议】');
    // The placeholder should be present (4 times — one per section)
    const matches = md.match(/（暂无内容）/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  it('does not break when bullet lines contain markdown special characters', () => {
    const tricky: ResumeDocument = {
      ...sampleResume,
      experience: [
        {
          company: 'Foo *Co*',
          role: 'Engineer <special>',
          period: '2024',
          bullets: [
            'Used #hashtag in PR title',
            'Wrote `inline code` here',
            'Has [a link](http://example.com) reference',
            'Contains | pipe character',
          ],
        },
      ],
    };
    const md = exportResumeAsMarkdown(tricky, sampleStar);
    // The bullets should still be present (escaping strategy is implementation-defined;
    // we just require that the text is not lost or corrupted to empty).
    expect(md).toContain('Foo *Co*');
    expect(md).toContain('Engineer <special>');
    expect(md).toContain('Used #hashtag in PR title');
    expect(md).toContain('Wrote `inline code` here');
    expect(md).toContain('Contains | pipe character');
  });
});
