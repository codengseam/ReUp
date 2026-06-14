// src/lib/resume/parser.test.ts
// ReUp v2 Phase 3 P0 (A6): resume parser dispatcher tests.

import { describe, it, expect, vi } from 'vitest';
import { parseResume } from './parser';
import { parseTextResume } from './parser-text';
import { parseMdResume } from './parser-md';
import * as parserPdf from './parser-pdf';
import * as parserWord from './parser-word';
import type { ResumeDocument } from './types';

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

  it('delegates pdf source to parsePdfResume (Buffer input)', async () => {
    const stub: ResumeDocument = {
      meta: { version: 'reup.v2.phase3', source: 'pdf', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '',
    };
    const spy = vi.spyOn(parserPdf, 'parsePdfResume').mockResolvedValueOnce(stub);
    const buf = Buffer.from('fake');
    const doc = await parseResume(buf, 'pdf');
    expect(spy).toHaveBeenCalledWith(buf);
    expect(doc).toBe(stub);
    spy.mockRestore();
  });

  it('delegates word source to parseWordResume (Buffer input)', async () => {
    const stub: ResumeDocument = {
      meta: { version: 'reup.v2.phase3', source: 'word', createdAt: new Date().toISOString() },
      basic: {},
      experience: [],
      projects: [],
      skills: [],
      education: [],
      raw: '',
    };
    const spy = vi.spyOn(parserWord, 'parseWordResume').mockResolvedValueOnce(stub);
    const buf = Buffer.from('fake');
    const doc = await parseResume(buf, 'word');
    expect(spy).toHaveBeenCalledWith(buf);
    expect(doc).toBe(stub);
    spy.mockRestore();
  });

  it('rejects string input for pdf source with a clear TypeError', async () => {
    await expect(parseResume('not a buffer', 'pdf')).rejects.toThrow(/pdf.*buffer|Buffer/i);
  });

  it('rejects string input for word source with a clear TypeError', async () => {
    await expect(parseResume('not a buffer', 'word')).rejects.toThrow(/word.*buffer|Buffer/i);
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
