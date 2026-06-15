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

  it('returns empty string when resume has no content', () => {
    const resume: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: '' },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '',
    };
    expect(buildResumeContext(resume)).toBe('');
  });

  it('handles resume with missing fields', () => {
    const resume: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: '' },
      basic: { name: '李四' },  // name exists so context should be non-empty
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '',
    };
    const ctx = buildResumeContext(resume);
    expect(ctx).toContain('[用户简历摘要]');
    expect(ctx).toContain('李四');
  });

  it('truncates skills to first 10', () => {
    const skills = Array.from({ length: 15 }, (_, i) => `Skill${i}`);
    const resume: ResumeDocument = {
      meta: { version: '1', source: 'text', createdAt: '' },
      basic: {},
      experience: [{ company: 'A', role: 'R', period: 'P', bullets: [] }],
      projects: [],
      skills,
      education: [],
      raw: '',
    };
    const ctx = buildResumeContext(resume);
    const skillCount = (ctx.match(/Skill/g) || []).length;
    expect(skillCount).toBe(10);
  });
});

describe('shouldInjectResume', () => {
  it('returns true for resume-related questions', () => {
    expect(shouldInjectResume('我的简历怎么样？')).toBe(true);
    expect(shouldInjectResume('我缺什么技能？')).toBe(true);
    expect(shouldInjectResume('匹配度如何')).toBe(true);
    expect(shouldInjectResume('我的简历还需要改进什么')).toBe(true);
  });

  it('returns false for generic questions', () => {
    expect(shouldInjectResume('什么是 STAR 法则？')).toBe(false);
    expect(shouldInjectResume('怎么准备面试？')).toBe(false);
    expect(shouldInjectResume('今天天气怎么样')).toBe(false);
  });
});