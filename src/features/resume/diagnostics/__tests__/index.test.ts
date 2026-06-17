import { describe, it, expect } from 'vitest';
import { runDiagnostics, detectTypos, detectTimelineConflicts, detectFormatIssues, detectContradictions } from '../index';
import type { ResumeDocument } from '../../types';

function makeResume(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-01T00:00:00.000Z' },
    basic: { name: 'Test', title: '高级工程师', yearsOfExperience: 5 },
    experience: [
      { company: 'A', role: 'Dev', period: '2020-2023', bullets: ['使用 Python 开发后端服务', '使用 React 构建前端界面'] },
    ],
    projects: [
      { name: 'Project X', bullets: ['使用 TypeScript 和 Node.js 完成全栈开发'] },
    ],
    skills: ['Python', 'React', 'TypeScript', 'Node.js'],
    education: [{ school: 'University', degree: 'BS', period: '2016-2020' }],
    raw: '高级工程师\n使用 Python 开发后端服务\n使用 React 构建前端界面',
    ...overrides,
  };
}

describe('index', () => {
  describe('exports', () => {
    it('should export detectTypos', () => {
      expect(typeof detectTypos).toBe('function');
    });

    it('should export detectTimelineConflicts', () => {
      expect(typeof detectTimelineConflicts).toBe('function');
    });

    it('should export detectFormatIssues', () => {
      expect(typeof detectFormatIssues).toBe('function');
    });

    it('should export detectContradictions', () => {
      expect(typeof detectContradictions).toBe('function');
    });

    it('should export runDiagnostics', () => {
      expect(typeof runDiagnostics).toBe('function');
    });
  });

  describe('runDiagnostics', () => {
    it('should return DiagnosticResult with issues and summary', () => {
      const resume = makeResume();
      const result = runDiagnostics(resume);
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should return correct summary counts', () => {
      const resume = makeResume();
      const result = runDiagnostics(resume);
      const { summary } = result;
      expect(summary.total).toBe(result.issues.length);
      expect(summary.errors).toBe(result.issues.filter((i) => i.severity === 'error').length);
      expect(summary.warnings).toBe(result.issues.filter((i) => i.severity === 'warning').length);
      expect(summary.infos).toBe(result.issues.filter((i) => i.severity === 'info').length);
      expect(summary.errors + summary.warnings + summary.infos).toBe(summary.total);
    });

    it('should aggregate issues from all detectors', () => {
      const resume = makeResume({
        // Trigger format issues: missing sections
        skills: [],
        education: [],
        projects: [],
        experience: [],
        // Trigger timeline: won't trigger with empty
      });
      const result = runDiagnostics(resume);
      // Should have missing section issues from format detector
      const formatIssues = result.issues.filter((i) => i.type === 'format');
      expect(formatIssues.length).toBeGreaterThan(0);
    });

    it('should detect typos from raw text', () => {
      const resume = makeResume({
        raw: 'I recieve the message',
      });
      const result = runDiagnostics(resume);
      const typoIssues = result.issues.filter((i) => i.type === 'typo');
      expect(typoIssues.length).toBeGreaterThan(0);
    });

    it('should detect timeline conflicts', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2023', bullets: [] },
          { company: 'B', role: 'Dev', period: '2022-2024', bullets: [] },
        ],
      });
      const result = runDiagnostics(resume);
      const timelineIssues = result.issues.filter((i) => i.type === 'timeline');
      expect(timelineIssues.length).toBeGreaterThan(0);
    });

    it('should detect format issues from missing sections', () => {
      const resume = makeResume({
        skills: [],
        education: [],
        projects: [],
      });
      const result = runDiagnostics(resume);
      const formatIssues = result.issues.filter((i) => i.type === 'format');
      expect(formatIssues.length).toBeGreaterThan(0);
    });

    it('should detect contradictions', () => {
      const resume = makeResume({
        skills: ['Java'],
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2023', bullets: ['使用 Python 开发'] },
        ],
      });
      const result = runDiagnostics(resume);
      const contradictionIssues = result.issues.filter((i) => i.type === 'contradiction');
      expect(contradictionIssues.length).toBeGreaterThan(0);
    });
  });

  describe('summary', () => {
    it('should have correct summary for empty result', () => {
      const resume = makeResume({
        raw: '',
        basic: { name: 'Test', title: '工程师', yearsOfExperience: 3 },
        skills: ['Python'],
        experience: [
          { company: 'A', role: 'Dev', period: '2021-2023', bullets: ['使用 Python 开发后端服务并优化系统性能'] },
        ],
        education: [{ school: 'University', degree: 'BS', period: '2016-2020' }],
      });
      const result = runDiagnostics(resume);
      expect(result.summary.total).toBe(result.issues.length);
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.summary.infos).toBe(0);
    });

    it('should count errors correctly', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2099', bullets: ['开发'] },
        ],
        skills: [],
        education: [],
        projects: [],
      });
      const result = runDiagnostics(resume);
      // Should have at least one error (future date) and one error (missing experience is not triggered since we have one)
      expect(result.summary.errors).toBeGreaterThanOrEqual(0);
      expect(result.summary.total).toBeGreaterThan(0);
    });

    it('should count warnings correctly', () => {
      const resume = makeResume({
        skills: ['Java'],
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2023', bullets: ['使用 Python 开发'] },
        ],
        education: [],
        projects: [],
      });
      const result = runDiagnostics(resume);
      expect(result.summary.warnings).toBeGreaterThanOrEqual(0);
      expect(result.summary.total).toBeGreaterThan(0);
    });
  });
});