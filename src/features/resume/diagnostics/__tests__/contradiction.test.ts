import { describe, it, expect } from 'vitest';
import { detectContradictions } from '../contradiction';
import type { ResumeDocument } from '../../types';

function makeResume(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-01T00:00:00.000Z' },
    basic: { name: 'Test', title: 'Engineer', yearsOfExperience: 5 },
    experience: [
      { company: 'A', role: 'Dev', period: '2019-2024', bullets: ['使用 Python 开发后端服务', '使用 React 构建前端界面'] },
    ],
    projects: [
      { name: 'Project X', bullets: ['使用 TypeScript 和 Node.js 完成全栈开发'] },
    ],
    skills: ['Python', 'React', 'TypeScript', 'Node.js'],
    education: [],
    raw: '',
    ...overrides,
  };
}

describe('detectContradictions', () => {
  describe('unused skills', () => {
    it('should detect skills not mentioned in experience or projects', () => {
      const resume = makeResume({
        skills: ['Python', 'React', 'Java'],
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('Java') && i.message.includes('从未出现'))).toBe(true);
    });

    it('should not flag skills that appear in experience bullets', () => {
      const resume = makeResume({
        skills: ['Python', 'React'],
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: ['使用 Python 开发后端', 'React 前端开发'] },
        ],
      });
      const issues = detectContradictions(resume);
      expect(issues.filter((i) => i.message.includes('Python') && i.message.includes('从未出现'))).toHaveLength(0);
    });

    it('should not flag skills that appear in project bullets', () => {
      const resume = makeResume({
        skills: ['TypeScript'],
        projects: [
          { name: 'X', bullets: ['TypeScript 全栈项目'] },
        ],
      });
      const issues = detectContradictions(resume);
      expect(issues.filter((i) => i.message.includes('TypeScript') && i.message.includes('从未出现'))).toHaveLength(0);
    });

    it('should skip very short skills (< 2 chars)', () => {
      const resume = makeResume({
        skills: ['C'],
      });
      const issues = detectContradictions(resume);
      expect(issues.filter((i) => i.message.includes('C') && i.message.includes('从未出现'))).toHaveLength(0);
    });

    it('should handle empty skills array', () => {
      const resume = makeResume({ skills: [] });
      const issues = detectContradictions(resume);
      const unusedIssues = issues.filter((i) => i.message.includes('从未出现'));
      expect(unusedIssues).toHaveLength(0);
    });
  });

  describe('experience years mismatch', () => {
    it('should detect when declared years differ significantly from actual', () => {
      const resume = makeResume({
        basic: { name: 'Test', title: 'Engineer', yearsOfExperience: 10 },
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: [] },
        ],
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('工作年限不一致'))).toBe(true);
    });

    it('should not flag when years match within tolerance', () => {
      const resume = makeResume({
        basic: { name: 'Test', title: 'Engineer', yearsOfExperience: 5 },
        experience: [
          { company: 'A', role: 'Dev', period: '2019-2024', bullets: [] },
        ],
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('工作年限不一致'))).toBe(false);
    });

    it('should handle "至今" periods correctly', () => {
      // 2020-至今 (6 years as of 2026) vs declared 6 years → within tolerance
      const resume = makeResume({
        basic: { name: 'Test', title: 'Engineer', yearsOfExperience: 6 },
        experience: [
          { company: 'A', role: 'Dev', period: '2020-至今', bullets: [] },
        ],
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('工作年限不一致'))).toBe(false);
    });

    it('should skip check when yearsOfExperience is undefined', () => {
      const resume = makeResume({
        basic: { name: 'Test', title: 'Engineer' },
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: [] },
        ],
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('工作年限不一致'))).toBe(false);
    });
  });

  describe('title mismatch', () => {
    it('should detect junior title with many years of experience', () => {
      const resume = makeResume({
        basic: { name: 'Test', title: '初级工程师', yearsOfExperience: 8 },
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('职级与年限不匹配') && i.message.includes('初级'))).toBe(true);
    });

    it('should detect senior title with few years of experience', () => {
      const resume = makeResume({
        basic: { name: 'Test', title: '高级工程师', yearsOfExperience: 1 },
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('职级与年限不匹配') && i.message.includes('高级'))).toBe(true);
    });

    it('should not flag reasonable title-year combinations', () => {
      const resume = makeResume({
        basic: { name: 'Test', title: '高级工程师', yearsOfExperience: 6 },
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('职级与年限不匹配'))).toBe(false);
    });

    it('should skip when title is missing', () => {
      const resume = makeResume({
        basic: { name: 'Test', yearsOfExperience: 8 },
      });
      const issues = detectContradictions(resume);
      expect(issues.some((i) => i.message.includes('职级与年限不匹配'))).toBe(false);
    });
  });

  describe('issue metadata', () => {
    it('should return issues with correct type', () => {
      const resume = makeResume({
        skills: ['Java'],
        basic: { name: 'Test', title: '初级工程师', yearsOfExperience: 8 },
      });
      const issues = detectContradictions(resume);
      for (const issue of issues) {
        expect(issue.type).toBe('contradiction');
        expect(issue.location).toBeTruthy();
      }
    });
  });
});