import { describe, it, expect, vi } from 'vitest';
import { parseJD } from './parser';
import type { JDDocument } from './types';

describe('parseJD', () => {
  it('parses standard JD text via LLM path', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        title: '高级前端工程师',
        department: '技术部',
        level: 'P6',
        location: '北京',
        hardRequirements: [
          { category: '学历', description: '本科及以上', priority: 'must' },
          { category: '经验', description: '3年以上前端经验', priority: 'must' },
        ],
        responsibilities: ['负责前端架构设计', '优化性能'],
        skills: [
          { name: 'React', level: '精通', required: true },
          { name: 'TypeScript', level: '熟悉', required: true },
        ],
      }),
    });

    const jdText = '招聘高级前端工程师...';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });

    expect(result.title).toBe('高级前端工程师');
    expect(result.department).toBe('技术部');
    expect(result.hardRequirements).toHaveLength(2);
    expect(result.skills).toHaveLength(2);
    expect(result.meta.source).toBe('llm');
  });

  it('falls back to rule-based when LLM fails', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM error'));
    const jdText = '招聘 Java 工程师，要求 3 年以上经验，本科以上学历。';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });

    expect(result.meta.source).toBe('text');
    expect(result.title).toBe('Java 工程师');
    expect(result.hardRequirements.length).toBeGreaterThan(0);
  });

  it('extracts salary range from text', async () => {
    const jdText = '薪资：20k-35k';
    const result = await parseJD(jdText);
    expect(result.salary).toEqual({ min: 20000, max: 35000, currency: 'CNY' });
  });

  it('extracts experience years from text', async () => {
    const jdText = '要求 3 年以上工作经验';
    const result = await parseJD(jdText);
    const expReq = result.hardRequirements.find((r) => r.category === '经验');
    expect(expReq?.description).toContain('3');
  });

  it('extracts education requirement from text', async () => {
    const jdText = '本科及以上学历';
    const result = await parseJD(jdText);
    const eduReq = result.hardRequirements.find((r) => r.category === '学历');
    expect(eduReq).toBeDefined();
    expect(eduReq!.description).toContain('本科');
  });

  it('handles empty JD text gracefully', async () => {
    const result = await parseJD('');
    expect(result.title).toBe('未知职位');
    expect(result.hardRequirements).toEqual([]);
    expect(result.meta.source).toBe('text');
  });

  it('falls back to rule-based when LLM returns invalid JSON', async () => {
    const mockLLM = vi.fn().mockResolvedValue({ content: 'not json at all' });
    const jdText = '招聘 测试工程师';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });
    expect(result.meta.source).toBe('text');
  });

  it('extracts title from first line when no keyword', async () => {
    const result = await parseJD('高级后端工程师\n工作地点：上海');
    expect(result.title).toBe('高级后端工程师');
  });
});