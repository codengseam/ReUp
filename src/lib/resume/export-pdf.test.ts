// src/lib/resume/export-pdf.test.ts
// ReUp v2 Phase 5 (F2): PDF export unit tests (RED → GREEN).
//
// Coverage:
//  1) Returns a Buffer
//  2) Buffer length > 0
//  3) Buffer starts with `%PDF-` (PDF magic number)
//  4) Buffer ends with `%%EOF` (PDF trailer marker — pdfkit always writes this)

import { describe, it, expect } from 'vitest';
import { exportResumeAsPdfBuffer } from './export-pdf';
import type { ResumeDocument } from './types';
import type { StarRewriteResult } from './star-rewriter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleResume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: 'Zhang Chen', title: 'Senior Backend Engineer', yearsOfExperience: 6 },
  experience: [
    {
      company: 'Acme',
      role: 'Engineer',
      period: '2023-03 - present',
      bullets: ['Built a service', 'Optimized cache'],
    },
  ],
  projects: [{ name: 'Project X', period: '2023-06 - 2023-12', bullets: ['Did the thing'] }],
  skills: ['Java', 'Spring Cloud'],
  education: [{ school: 'Example University', degree: 'BSc CS', period: '2016-09 - 2020-07' }],
  raw: 'Zhang Chen / Senior Backend Engineer / 6y',
};

const sampleStar: StarRewriteResult = {
  sections: {
    '我的分析': 'Candidate is solid.',
    'STAR改写': 'SITUATION: ...',
    '底层心法': 'Use 4-part STAR.',
    '建议': 'Add metrics.',
  },
  confidence: 0.42,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportResumeAsPdfBuffer', () => {
  it('returns a Buffer', async () => {
    const buf = await exportResumeAsPdfBuffer(sampleResume, sampleStar);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('returns a non-empty Buffer', async () => {
    const buf = await exportResumeAsPdfBuffer(sampleResume, sampleStar);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('Buffer starts with the PDF magic number `%PDF-`', async () => {
    const buf = await exportResumeAsPdfBuffer(sampleResume, sampleStar);
    const head = buf.subarray(0, 5).toString('ascii');
    expect(head).toBe('%PDF-');
  });

  it('Buffer ends with the PDF trailer marker `%%EOF`', async () => {
    const buf = await exportResumeAsPdfBuffer(sampleResume, sampleStar);
    // pdfkit's trailer is preceded by a newline; the last non-whitespace
    // token should be %%EOF.
    const tail = buf.subarray(Math.max(0, buf.length - 64)).toString('binary');
    expect(tail).toMatch(/%%EOF\s*$/);
  });

  it('still returns a valid PDF Buffer when starResult is undefined', async () => {
    const buf = await exportResumeAsPdfBuffer(sampleResume);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    const head = buf.subarray(0, 5).toString('ascii');
    expect(head).toBe('%PDF-');
  });
});
