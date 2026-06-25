import { describe, it, expect } from 'vitest';
import { detectTimelineConflicts } from '../timeline';
import type { ResumeDocument } from '../../types';

function makeResume(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-01T00:00:00.000Z' },
    basic: { name: 'Test', title: 'Engineer' },
    experience: [],
    projects: [],
    skills: [],
    education: [],
    raw: '',
    ...overrides,
  };
}

describe('detectTimelineConflicts', () => {
  describe('overlap detection', () => {
    it('should detect overlapping periods', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2023', bullets: [] },
          { company: 'B', role: 'Dev', period: '2022-2024', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间重叠'))).toBe(true);
    });

    it('should not flag non-overlapping periods', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: [] },
          { company: 'B', role: 'Dev', period: '2023-2024', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间重叠'))).toBe(false);
    });

    it('should handle Chinese format periods', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020年-2023年', bullets: [] },
          { company: 'B', role: 'Dev', period: '2022年-2024年', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间重叠'))).toBe(true);
    });

    it('should handle "至今" (present) periods', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2022', bullets: [] },
          { company: 'B', role: 'Dev', period: '2021-至今', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间重叠'))).toBe(true);
    });
  });

  describe('gap detection', () => {
    it('should detect gaps > 6 months', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2020', bullets: [] },
          { company: 'B', role: 'Dev', period: '2022-2023', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间间隔') && i.message.includes('个月空档'))).toBe(true);
    });

    it('should not flag gaps <= 6 months', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-01-2020-06', bullets: [] },
          { company: 'B', role: 'Dev', period: '2020-07-2020-12', bullets: [] },
        ],
      });
      // These are parsed as month-level, Jan-Dec 2020 for both, gap is 0 months
      const issues = detectTimelineConflicts(resume);
      const gapIssues = issues.filter((i) => i.message.includes('时间间隔'));
      expect(gapIssues.length).toBe(0);
    });
  });

  describe('future date detection', () => {
    it('should detect future end dates', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2099', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('未来日期') && i.severity === 'error')).toBe(true);
    });

    it('should not flag "至今" as future date', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-至今', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('未来日期'))).toBe(false);
    });
  });

  describe('chronological order', () => {
    it('should detect when experience is not in reverse chronological order', () => {
      const resume = makeResume({
        experience: [
          { company: 'Old', role: 'Dev', period: '2018-2020', bullets: [] },
          { company: 'New', role: 'Dev', period: '2021-2023', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间顺序'))).toBe(true);
    });

    it('should not flag correct reverse chronological order', () => {
      const resume = makeResume({
        experience: [
          { company: 'New', role: 'Dev', period: '2021-2023', bullets: [] },
          { company: 'Old', role: 'Dev', period: '2018-2020', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间顺序'))).toBe(false);
    });
  });

  describe('education periods', () => {
    it('should include education periods in overlap detection', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2023', bullets: [] },
        ],
        education: [
          { school: 'Uni', degree: 'BS', period: '2022-2026' },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('时间重叠'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty experience and education', () => {
      const resume = makeResume();
      const issues = detectTimelineConflicts(resume);
      expect(issues).toEqual([]);
    });

    it('should handle single period with no issues', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2023', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues).toEqual([]);
    });

    it('should handle periods without valid dates', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: 'unknown', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues).toEqual([]);
    });

    it('should return issues with correct type and location', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020-2099', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      for (const issue of issues) {
        expect(issue.type).toBe('timeline');
        expect(issue.location).toBeTruthy();
      }
    });

    it('should handle dot-format periods like "2020.03-2022.05"', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020.03-2022.05', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues).toEqual([]);
    });

    it('should detect future start date', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2099-2100', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues.some((i) => i.message.includes('未来日期') && i.message.includes('开始日期'))).toBe(true);
    });

    it('should handle Chinese month format periods', () => {
      const resume = makeResume({
        experience: [
          { company: 'A', role: 'Dev', period: '2020年03月-2022年06月', bullets: [] },
        ],
      });
      const issues = detectTimelineConflicts(resume);
      expect(issues).toEqual([]);
    });
  });
});