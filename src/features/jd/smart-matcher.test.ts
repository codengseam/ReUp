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
      { name: 'Vue', level: '熟悉', required: true },
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
    const skillScore = result.dimensionScores.find((d) => d.dimension === '技能');
    expect(skillScore?.score).toBeGreaterThan(0);
    expect(skillScore?.resumeEvidence).toContain('React');
  });

  it('identifies experience gaps', () => {
    const result = smartMatch(mockResume, mockJD);
    const expScore = result.dimensionScores.find((d) => d.dimension === '经验');
    expect(expScore?.score).toBeGreaterThan(0);
  });

  it('flags missing required skills', () => {
    const result = smartMatch(mockResume, mockJD);
    const skillScore = result.dimensionScores.find((d) => d.dimension === '技能');
    expect(skillScore?.gap).toContain('Vue');
  });

  it('generates actionable suggestions', () => {
    const result = smartMatch(mockResume, mockJD);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]!.targetSection).toBeDefined();
  });

  it('generates green flags for satisfied requirements', () => {
    const result = smartMatch(mockResume, mockJD);
    expect(result.greenFlags.length).toBeGreaterThan(0);
    expect(result.greenFlags.some((f) => f.includes('经验'))).toBe(true);
  });
});