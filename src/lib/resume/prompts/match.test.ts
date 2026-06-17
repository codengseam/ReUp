// src/lib/resume/prompts/match.test.ts
// ReUp v2 Phase 6 (C2): unit tests for the match-report prompt builder
// and the JSON shape we expect the LLM to return.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MATCH_REPORT_PROMPT,
  MAX_RESUME_INJECT_CHARS,
  buildMatchReportUserPrompt,
} from '@/lib/resume/prompts/match';

describe('match prompt module (resume-parse-jd-prompts C2)', () => {
  it('exports a non-empty default system prompt that requires the JSON shape', () => {
    expect(DEFAULT_MATCH_REPORT_PROMPT).toBeTruthy();
    expect(DEFAULT_MATCH_REPORT_PROMPT).toContain('strengths');
    expect(DEFAULT_MATCH_REPORT_PROMPT).toContain('gaps');
    expect(DEFAULT_MATCH_REPORT_PROMPT).toContain('priorities');
  });

  it('buildMatchReportUserPrompt embeds the resume and JD verbatim', () => {
    const resume = JSON.stringify({ basic: { name: 'Alice' }, experience: [] });
    const jd = 'JD text here';
    const out = buildMatchReportUserPrompt(resume, jd);
    expect(out).toContain(resume);
    expect(out).toContain('JD text here');
    expect(out.indexOf(resume)).toBeLessThan(out.indexOf('JD text here'));
  });

  it('truncates resume content above MAX_RESUME_INJECT_CHARS', () => {
    const huge = 'x'.repeat(MAX_RESUME_INJECT_CHARS + 5000);
    const out = buildMatchReportUserPrompt(huge, 'short JD');
    expect(out.length).toBeLessThan(huge.length + 200);
    expect(out).toContain('已截断');
    // JD should still be present in full
    expect(out).toContain('short JD');
  });
});
