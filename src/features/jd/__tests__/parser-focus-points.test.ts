import { describe, it, expect, vi } from 'vitest';
import { parseJD } from '../parser';
import { z } from 'zod';

const FOCUS_POINTS_SCHEMA = z.array(z.object({
  dimension: z.string(),
  description: z.string(),
  weight: z.enum(['high', 'medium', 'low']),
}));

describe('JD parser - focusPoints', () => {
  it('extracts focusPoints via LLM path when provided', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        title: '高级后端工程师',
        department: '技术部',
        hardRequirements: [
          { category: '经验', description: '5年以上后端经验', priority: 'must' },
        ],
        responsibilities: ['负责后端架构设计'],
        skills: [
          { name: 'Java', level: '精通', required: true },
        ],
        focusPoints: [
          { dimension: '系统设计能力', description: 'JD中多次提到大规模分布式系统设计', weight: 'high' },
          { dimension: '团队管理经验', description: 'JD要求带领5人以上团队', weight: 'high' },
          { dimension: '高并发经验', description: 'JD提到QPS百万级', weight: 'medium' },
          { dimension: '技术选型能力', description: 'JD提到技术栈评估', weight: 'low' },
        ],
      }),
    });

    const jdText = '招聘高级后端工程师，要求5年以上经验，熟悉分布式系统...';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });

    expect(result.focusPoints).toBeDefined();
    expect(result.focusPoints).toHaveLength(4);
    expect(result.focusPoints![0].dimension).toBe('系统设计能力');
    expect(result.focusPoints![0].weight).toBe('high');
    expect(result.focusPoints![2].weight).toBe('medium');
    expect(result.focusPoints![3].weight).toBe('low');

    // Validate schema
    const validation = FOCUS_POINTS_SCHEMA.safeParse(result.focusPoints);
    expect(validation.success).toBe(true);
  });

  it('returns empty focusPoints when LLM does not provide them', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        title: '前端工程师',
        hardRequirements: [{ category: '学历', description: '本科', priority: 'must' }],
        responsibilities: [],
        skills: [],
      }),
    });

    const jdText = '招聘前端工程师';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });

    expect(result.focusPoints).toBeDefined();
    expect(result.focusPoints).toEqual([]);
  });

  it('rule-based fallback returns empty focusPoints', async () => {
    const jdText = '招聘 Java 工程师，要求 3 年以上经验';
    const result = await parseJD(jdText);

    expect(result.meta.source).toBe('text');
    expect(result.focusPoints).toBeDefined();
    expect(result.focusPoints).toEqual([]);
  });

  it('rule-based fallback returns empty focusPoints when LLM fails', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM error'));
    const jdText = '招聘 Java 工程师，要求 3 年以上经验';
    const result = await parseJD(jdText, { llmInvoke: mockLLM });

    expect(result.meta.source).toBe('text');
    expect(result.focusPoints).toEqual([]);
  });

  it('validates focusPoints Zod schema rejects invalid weight', () => {
    const invalid = [
      { dimension: '测试', description: 'test', weight: 'invalid' },
    ];

    const result = FOCUS_POINTS_SCHEMA.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates focusPoints Zod schema rejects missing dimension', () => {
    const invalid = [
      { description: 'test', weight: 'high' },
    ];

    const result = FOCUS_POINTS_SCHEMA.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates focusPoints Zod schema accepts empty array', () => {
    const result = FOCUS_POINTS_SCHEMA.safeParse([]);
    expect(result.success).toBe(true);
  });

  it('validates focusPoints Zod schema accepts valid data', () => {
    const valid = [
      { dimension: '系统设计', description: '描述', weight: 'high' },
      { dimension: '团队管理', description: '描述', weight: 'medium' },
      { dimension: '技术广度', description: '描述', weight: 'low' },
    ];

    const result = FOCUS_POINTS_SCHEMA.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
  });
});