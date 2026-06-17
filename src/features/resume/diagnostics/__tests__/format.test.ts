import { describe, it, expect } from 'vitest';
import { detectFormatIssues } from '../format';
import type { ResumeDocument } from '../../types';

function makeResume(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-01T00:00:00.000Z' },
    basic: { name: 'Test', title: 'Engineer' },
    experience: [],
    projects: [],
    skills: ['JavaScript', 'TypeScript'],
    education: [{ school: 'University', degree: 'BS', period: '2016-2020' }],
    raw: '',
    ...overrides,
  };
}

describe('detectFormatIssues', () => {
  describe('date format consistency', () => {
    it('should detect mixed date formats', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020年-2022年', bullets: [] },
          { company: 'B', role: 'Dev', period: '2023-2024', bullets: [] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('日期格式不一致'))).toBe(true);
    });

    it('should detect mixed date formats including dot format', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020.03-2022.05', bullets: [] },
          { company: 'B', role: 'Dev', period: '2023-2024', bullets: [] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('日期格式不一致'))).toBe(true);
    });

    it('should not flag consistent date formats', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: [] },
          { company: 'B', role: 'Dev', period: '2023-2024', bullets: [] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('日期格式不一致'))).toBe(false);
    });
  });

  describe('bullet punctuation', () => {
    it('should detect inconsistent bullet punctuation', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: ['完成项目上线。', '优化系统性能。', '编写技术文档'] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('标点符号不一致'))).toBe(true);
    });

    it('should not flag consistent punctuation (all ending)', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: ['完成项目上线。', '优化系统性能。', '编写技术文档。'] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('标点符号不一致'))).toBe(false);
    });

    it('should not flag consistent punctuation (none ending)', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: ['完成项目上线', '优化系统性能', '编写技术文档'] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('标点符号不一致'))).toBe(false);
    });

    it('should handle single bullet', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: ['完成项目上线。'] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('标点符号不一致'))).toBe(false);
    });
  });

  describe('missing sections', () => {
    it('should detect missing skills section', () => {
      const resume = makeResume({ skills: [] });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('缺少技能板块'))).toBe(true);
    });

    it('should detect missing education section', () => {
      const resume = makeResume({ education: [] });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('缺少教育背景板块'))).toBe(true);
    });

    it('should detect missing projects section', () => {
      const resume = makeResume({ projects: [] });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('缺少项目经历板块'))).toBe(true);
    });

    it('should detect missing experience section', () => {
      const resume = makeResume({ experience: [] });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('缺少工作经历板块') && i.severity === 'error')).toBe(true);
    });
  });

  describe('short bullets', () => {
    it('should detect very short bullets in experience', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: ['开发'] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('Bullet 过短'))).toBe(true);
    });

    it('should not flag bullets of sufficient length', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: ['负责核心模块的架构设计与开发工作'] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('Bullet 过短'))).toBe(false);
    });

    it('should detect short bullets in projects', () => {
      const resume = makeResume({
        projects: [
          { name: 'Project A', bullets: ['做'] },
        ],
      });
      const issues = detectFormatIssues(resume);
      expect(issues.some((i) => i.message.includes('Bullet 过短'))).toBe(true);
    });
  });

  describe('issue metadata', () => {
    it('should return issues with correct type', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020年-2022年', bullets: ['开发'] },
          { company: 'B', role: 'Dev', period: '2023-2024', bullets: ['开发'] },
        ],
        education: [],
        projects: [],
        skills: [],
      });
      const issues = detectFormatIssues(resume);
      for (const issue of issues) {
        expect(issue.type).toBe('format');
        expect(issue.location).toBeTruthy();
      }
      // Should have: date format, missing skills, missing education, missing projects, short bullets
      expect(issues.length).toBeGreaterThanOrEqual(5);
    });
  });
});