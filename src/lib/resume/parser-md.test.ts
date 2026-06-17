// src/lib/resume/parser-md.test.ts
// ReUp v2 Phase 3 P0 (A5): markdown resume parser tests.
// Fixture source: src/lib/resume/__fixtures__/resume/sample.md
// (public synthetic data, no real personal information).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMdResume } from './parser-md';
import { parseTextResume } from './parser-text';

const FIXTURE_PATH = join(process.cwd(), 'src/lib/resume/__fixtures__/resume/sample.md');

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

describe('parseMdResume', () => {
  it('parses the real fixture into the same shape as parseTextResume', () => {
    const input = loadFixture();
    const md = parseMdResume(input);
    const txt = parseTextResume(input, 'text');
    console.log('[DBG md proj count]', md.projects.length);
    console.log('[DBG txt proj count]', txt.projects.length);
    console.log('[DBG md proj names]', md.projects.map((p) => p.name).join(' | '));
    console.log('[DBG txt proj names]', txt.projects.map((p) => p.name).join(' | '));

    expect(md.meta.source).toBe('md');
    expect(md.raw).toBe(input);
    expect(md.experience.length).toBe(txt.experience.length);
    expect(md.projects.length).toBe(txt.projects.length);
    expect(md.experience.length).toBeGreaterThanOrEqual(3);
    expect(md.projects.length).toBeGreaterThanOrEqual(3);
  });

  it('stamps meta.source as md', () => {
    const doc = parseMdResume('## 技能\n- x');
    expect(doc.meta.source).toBe('md');
    expect(doc.meta.version).toMatch(/^reup\./);
  });

  it('detects Chinese and English section headers', () => {
    const cn = parseMdResume('## 工作经历\n### 字节跳动\n**Role | 2020-2022**\n- did stuff');
    expect(cn.experience).toHaveLength(1);
    expect(cn.experience[0].company).toBe('字节跳动');

    const en = parseMdResume('## Experience\n### Acme\n**Engineer | 2020-2022**\n- did stuff');
    expect(en.experience).toHaveLength(1);
    expect(en.experience[0].company).toBe('Acme');
  });

  it('strips markdown emphasis but preserves text content', () => {
    const input = [
      '## 工作经历',
      '### 字节跳动',
      '**懂车帝 - 抖音电商（业务负责人，2022年10月 - 至今）**',
      '- *emphasis* is **bold** in this bullet',
    ].join('\n');
    const doc = parseMdResume(input);
    expect(doc.experience).toHaveLength(1);
    expect(doc.experience[0].bullets[0]).toContain('emphasis');
    expect(doc.experience[0].bullets[0]).toContain('bold');
    // No leftover markdown emphasis markers
    expect(doc.experience[0].bullets[0]).not.toMatch(/[*_]{1,2}/);
  });

  it('preserves raw input including code blocks but does not extract code as bullets', () => {
    const input = [
      '## 项目经历',
      '### MyProject',
      '```',
      'def hello():',
      '    print("hi")',
      '```',
      '- real bullet item',
    ].join('\n');
    const doc = parseMdResume(input);
    expect(doc.raw).toBe(input);
    expect(doc.projects).toHaveLength(1);
    expect(doc.projects[0].name).toBe('MyProject');
    // The code block is preserved in raw, but its lines are not bullets.
    const allBullets = doc.projects.flatMap((p) => p.bullets);
    expect(allBullets.some((b) => b.includes('real bullet'))).toBe(true);
  });

  it('produces 3 titled projects from the synthetic fixture (Phase 6: A3 fix)', () => {
    const input = loadFixture();
    const doc = parseMdResume(input);
    // Post-fix: titled sub-blocks from the synthetic fixture are preserved
    // by parseProjectEntry. The 3rd sub-block is the un-titled "个人 AI 实践项目".
    expect(doc.projects).toHaveLength(3);
    expect(doc.projects.map((p) => p.name)).toEqual([
      '示例电商项目',
      '示例阅卷系统',
      '个人 AI 实践项目',
    ]);
  });
});
