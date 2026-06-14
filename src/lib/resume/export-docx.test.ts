// src/lib/resume/export-docx.test.ts
// ReUp v2 Phase 5 (F3): DOCX export unit tests (RED → GREEN).
//
// Coverage:
//  1) Returns a Buffer (await)
//  2) Buffer length > 0
//  3) Buffer starts with `PK` (ZIP magic number — DOCX is a zip)
//  4) The produced zip contains a word/document.xml entry (sanity check)

import { describe, it, expect } from 'vitest';
import { exportResumeAsDocxBuffer } from './export-docx';
import type { ResumeDocument } from './types';
import type { StarRewriteResult } from './star-rewriter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleResume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张辰', title: '高级后端工程师', yearsOfExperience: 6 },
  experience: [
    {
      company: '蓝芯科技',
      role: '高级后端工程师',
      period: '2023-03 - 至今',
      bullets: ['负责订单中台微服务架构升级'],
    },
  ],
  projects: [
    { name: '订单中台微服务升级', period: '2023-06 - 2023-12', bullets: ['把单体拆成 8 个微服务'] },
  ],
  skills: ['Java', 'Spring Cloud', 'MySQL', 'Redis'],
  education: [{ school: '示例大学', degree: '计算机科学 本科', period: '2016-09 - 2020-07' }],
  raw: '张辰 / 高级后端工程师 / 6年',
};

const sampleStar: StarRewriteResult = {
  sections: {
    '我的分析': '亮点在订单中台架构升级与缓存优化。',
    'STAR改写': 'SITUATION: 单体架构撑不住大促。',
    '底层心法': '用「Situation-任务-动作-结果」四段式。',
    '建议': '1) 每条 bullet 含量化指标。',
  },
  confidence: 0.42,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportResumeAsDocxBuffer', () => {
  it('returns a Buffer', async () => {
    const buf = await exportResumeAsDocxBuffer(sampleResume, sampleStar);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('returns a non-empty Buffer', async () => {
    const buf = await exportResumeAsDocxBuffer(sampleResume, sampleStar);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('Buffer starts with the ZIP magic number `PK` (DOCX is a zip)', async () => {
    const buf = await exportResumeAsDocxBuffer(sampleResume, sampleStar);
    const head = buf.subarray(0, 2).toString('binary');
    // 'P' = 0x50, 'K' = 0x4B → "PK"
    expect(head).toBe('PK');
  });

  it('produces a zip that contains a word/document.xml entry (basic sanity check)', async () => {
    const buf = await exportResumeAsDocxBuffer(sampleResume, sampleStar);
    // A minimal check: search for the bytes of `word/document.xml` in the
    // archive. We don't parse the full zip structure here; this is enough
    // to confirm the docx library produced a valid file.
    const ascii = buf.toString('binary');
    expect(ascii).toContain('word/document.xml');
  });

  it('still returns a valid DOCX Buffer when starResult is undefined', async () => {
    const buf = await exportResumeAsDocxBuffer(sampleResume);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    const head = buf.subarray(0, 2).toString('binary');
    expect(head).toBe('PK');
  });
});
