// src/lib/resume/parser.test.ts
// ReUp v2 Phase 3 P0 (A6): resume parser dispatcher tests.

import { describe, it, expect } from 'vitest';
import { parseResume } from './parser';
import { parseTextResume } from './parser-text';
import { parseMdResume } from './parser-md';

describe('parseResume (dispatcher)', () => {
  it('delegates text source to parseTextResume and returns same shape', async () => {
    const input = '## 工作经历\n### Acme\n**Engineer | 2020 - 2022**\n- did stuff';
    const viaDispatch = await parseResume(input, 'text');
    const viaDirect = parseTextResume(input, 'text');
    expect(viaDispatch.meta.source).toBe('text');
    expect(viaDirect.meta.source).toBe('text');
    expect(viaDispatch.experience).toEqual(viaDirect.experience);
    expect(viaDispatch.projects).toEqual(viaDirect.projects);
  });

  it('delegates md source to parseMdResume and returns same shape', async () => {
    const input = '## 工作经历\n### 字节跳动\n**Role | 2020 - 2022**\n- did stuff';
    const viaDispatch = await parseResume(input, 'md');
    const viaDirect = parseMdResume(input);
    expect(viaDispatch.meta.source).toBe('md');
    expect(viaDirect.meta.source).toBe('md');
    expect(viaDispatch.experience).toEqual(viaDirect.experience);
  });

  it('throws a clear "not yet implemented" error for pdf source', async () => {
    await expect(parseResume('whatever', 'pdf')).rejects.toThrow(/PDF parser not yet implemented/i);
  });

  it('throws a clear "not yet implemented" error for word source', async () => {
    await expect(parseResume('whatever', 'word')).rejects.toThrow(/Word parser not yet implemented/i);
  });

  it('throws on empty input for text source', async () => {
    await expect(parseResume('', 'text')).rejects.toThrow(/empty|non-empty/i);
  });

  it('throws on empty input for md source', async () => {
    await expect(parseResume('', 'md')).rejects.toThrow(/empty|non-empty/i);
  });

  it('stamps meta.createdAt as a valid ISO 8601 timestamp', async () => {
    const doc = await parseResume('## 技能\n- x', 'text');
    expect(typeof doc.meta.createdAt).toBe('string');
    expect(doc.meta.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Parses as a valid Date
    expect(Number.isNaN(new Date(doc.meta.createdAt).getTime())).toBe(false);
  });

  it('stamps meta.source matching the input', async () => {
    const txtDoc = await parseResume('## 技能\n- x', 'text');
    const mdDoc = await parseResume('## 技能\n- x', 'md');
    expect(txtDoc.meta.source).toBe('text');
    expect(mdDoc.meta.source).toBe('md');
  });

  it('stamps meta.version with the reup schema version', async () => {
    const doc = await parseResume('## 技能\n- x', 'text');
    expect(doc.meta.version).toMatch(/^reup\./);
  });
});
