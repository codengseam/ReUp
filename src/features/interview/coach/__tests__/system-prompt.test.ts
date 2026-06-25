import { describe, it, expect } from 'vitest';
import { buildCoachSystemPrompt } from '../system-prompt';
import type { ResumeDocument } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';

function makeResume(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: new Date().toISOString() },
    basic: { name: '张三', title: '前端工程师', yearsOfExperience: 5 },
    experience: [
      { company: 'A公司', role: '高级前端', period: '2022-2024', bullets: ['负责核心业务开发'] },
      { company: 'B公司', role: '前端开发', period: '2020-2022', bullets: ['参与多个项目'] },
    ],
    projects: [{ name: '电商平台', period: '2023', bullets: ['使用 React + TypeScript'] }],
    skills: ['React', 'TypeScript', 'Node.js', 'CSS', 'Webpack', 'Jest'],
    education: [{ school: '某大学', degree: '本科', period: '2016-2020' }],
    raw: 'test resume raw content',
    ...overrides,
  };
}

function makeJD(overrides: Partial<JDDocument> = {}): JDDocument {
  return {
    meta: { source: 'text', parsedAt: new Date().toISOString() },
    title: '高级前端工程师',
    department: '技术部',
    level: 'P6',
    hardRequirements: [
      { category: '经验', description: '3年以上前端经验', priority: 'must' },
    ],
    responsibilities: ['负责前端架构设计', '性能优化'],
    skills: [
      { name: 'React', level: '精通', required: true },
      { name: 'TypeScript', level: '熟悉', required: true },
      { name: 'Node.js', level: '了解', required: false },
    ],
    raw: 'test jd raw content',
    ...overrides,
  };
}

describe('buildCoachSystemPrompt', () => {
  it('includes resume basic info', () => {
    const resume = makeResume();
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).toContain('张三');
    expect(prompt).toContain('前端工程师');
    expect(prompt).toContain('5年经验');
  });

  it('includes skills from resume', () => {
    const resume = makeResume();
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).toContain('React');
    expect(prompt).toContain('TypeScript');
  });

  it('includes experience from resume', () => {
    const resume = makeResume();
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).toContain('A公司');
    expect(prompt).toContain('高级前端');
  });

  it('uses default name when name is missing', () => {
    const resume = makeResume({ basic: { name: undefined, title: '工程师' } });
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).toContain('候选人');
  });

  it('includes JD info when provided', () => {
    const resume = makeResume();
    const jd = makeJD();
    const prompt = buildCoachSystemPrompt(resume, jd);

    expect(prompt).toContain('高级前端工程师');
    expect(prompt).toContain('技术部');
    expect(prompt).toContain('P6');
    expect(prompt).toContain('React');
    expect(prompt).toContain('核心职责');
  });

  it('does not include JD section when JD is null', () => {
    const resume = makeResume();
    const prompt = buildCoachSystemPrompt(resume, null);

    expect(prompt).not.toContain('目标岗位');
  });

  it('does not include JD section when JD is undefined', () => {
    const resume = makeResume();
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).not.toContain('目标岗位');
  });

  it('includes all 4 interview phases', () => {
    const resume = makeResume();
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).toContain('自我介绍');
    expect(prompt).toContain('项目深挖');
    expect(prompt).toContain('技术考察');
    expect(prompt).toContain('行为面试');
  });

  it('includes interview rules', () => {
    const resume = makeResume();
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).toContain('每次只问一个问题');
    expect(prompt).toContain('1-2 句简短点评');
    expect(prompt).toContain('阶段切换');
  });

  it('limits skills display to 8 items', () => {
    const resume = makeResume({
      skills: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    });
    const prompt = buildCoachSystemPrompt(resume);

    // Should not contain the 9th and 10th items
    expect(prompt).not.toContain('I、J');
  });

  it('limits experience display to 3 items', () => {
    const resume = makeResume({
      experience: [
        { company: 'A', role: 'R1', period: '2024', bullets: [] },
        { company: 'B', role: 'R2', period: '2023', bullets: [] },
        { company: 'C', role: 'R3', period: '2022', bullets: [] },
        { company: 'D', role: 'R4', period: '2021', bullets: [] },
      ],
    });
    const prompt = buildCoachSystemPrompt(resume);

    expect(prompt).toContain('A');
    expect(prompt).toContain('C');
    expect(prompt).not.toContain('D');
  });

  it('output is under 2000 characters', () => {
    const resume = makeResume();
    const jd = makeJD();
    const prompt = buildCoachSystemPrompt(resume, jd);

    expect(prompt.length).toBeLessThan(2000);
  });
});