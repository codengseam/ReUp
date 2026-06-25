import { describe, it, expect } from 'vitest';
import { detectTypos } from '../typo';

describe('detectTypos', () => {
  describe('Chinese context rules', () => {
    it('should detect "在" when it should be "再" (again)', () => {
      const issues = detectTypos('请在一次确认');
      expect(issues.some((i) => i.message.includes('在') && i.suggestion?.includes('再'))).toBe(true);
    });

    it('should detect "在" when it should be "再" in "再也不" pattern', () => {
      const issues = detectTypos('在也不来了');
      expect(issues.some((i) => i.message.includes('在') && i.suggestion?.includes('再'))).toBe(true);
    });

    it('should detect "它" when it should be "他" (referring to a person)', () => {
      const issues = detectTypos('工程师它负责');
      expect(issues.some((i) => i.message.includes('它') && i.suggestion?.includes('他'))).toBe(true);
    });

    it('should detect "那" when it should be "哪" (question)', () => {
      const issues = detectTypos('那些人');
      expect(issues.some((i) => i.message.includes('那') && i.suggestion?.includes('哪'))).toBe(true);
    });

    it('should detect "做" when it should be "作" in fixed collocations', () => {
      const issues = detectTypos('做为主要负责人');
      expect(issues.some((i) => i.message.includes('做') && i.suggestion?.includes('作'))).toBe(true);
    });

    it('should return empty array for clean Chinese text', () => {
      const issues = detectTypos('这是我的简历');
      // "在" in normal usage should not trigger
      expect(issues.filter((i) => i.type === 'typo' && i.message.includes('在'))).toHaveLength(0);
    });

    it('should return correct type and severity for each issue', () => {
      const issues = detectTypos('工程师它负责');
      for (const issue of issues) {
        expect(issue.type).toBe('typo');
        expect(issue.severity).toBe('warning');
        expect(issue.location).toMatch(/^line:\d+$/);
      }
    });
  });

  describe('English misspellings', () => {
    it('should detect "recieve" should be "receive"', () => {
      const issues = detectTypos('I recieve the message');
      expect(issues.some((i) => i.message.includes('recieve') && i.suggestion?.includes('receive'))).toBe(true);
    });

    it('should detect "occured" should be "occurred"', () => {
      const issues = detectTypos('An error occured');
      expect(issues.some((i) => i.message.includes('occured') && i.suggestion?.includes('occurred'))).toBe(true);
    });

    it('should detect "seperate" should be "separate"', () => {
      const issues = detectTypos('seperate concerns');
      expect(issues.some((i) => i.message.includes('seperate') && i.suggestion?.includes('separate'))).toBe(true);
    });

    it('should detect "definately" should be "definitely"', () => {
      const issues = detectTypos('definately true');
      expect(issues.some((i) => i.message.includes('definately') && i.suggestion?.includes('definitely'))).toBe(true);
    });

    it('should detect multiple misspellings in one text', () => {
      const issues = detectTypos('I recieve the message. An error occured in seperate module.');
      const englishIssues = issues.filter((i) => i.message.includes('英文拼写错误'));
      expect(englishIssues.length).toBe(3);
    });

    it('should not flag correctly spelled words', () => {
      const issues = detectTypos('I receive the message');
      expect(issues.filter((i) => i.message.includes('英文拼写错误'))).toHaveLength(0);
    });

    it('should detect misspellings with word boundary matching', () => {
      // "recieve" should be detected, but "received" (correct) should not
      const issues = detectTypos('recieve');
      expect(issues.some((i) => i.message.includes('recieve'))).toBe(true);
    });

    it('should preserve capitalization in suggestions', () => {
      const issues = detectTypos('Recieve');
      expect(issues.some((i) => i.suggestion?.includes('Receive'))).toBe(true);
    });
  });

  describe('combined text', () => {
    it('should detect both Chinese and English issues in mixed text', () => {
      const issues = detectTypos('工程师它负责 recieve 消息');
      const chineseIssues = issues.filter((i) => !i.message.includes('英文拼写错误'));
      const englishIssues = issues.filter((i) => i.message.includes('英文拼写错误'));
      expect(chineseIssues.length).toBeGreaterThan(0);
      expect(englishIssues.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const issues = detectTypos('');
      expect(issues).toEqual([]);
    });

    it('should handle text with only whitespace', () => {
      const issues = detectTypos('   \n  \n ');
      expect(issues).toEqual([]);
    });

    it('should handle text with no issues', () => {
      const issues = detectTypos('This is a clean text with no errors.');
      expect(issues).toHaveLength(0);
    });

    it('should handle very long text', () => {
      const longText = 'some text '.repeat(1000);
      const issues = detectTypos(longText);
      expect(Array.isArray(issues)).toBe(true);
    });
  });
});