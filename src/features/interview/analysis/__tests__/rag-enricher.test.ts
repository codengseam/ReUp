import { describe, it, expect, vi } from 'vitest';
import { enrichWithRAG, enrichBatchWithRAG } from '../rag-enricher';

// Mock the RAG module
vi.mock('@/server/rag/rag', () => ({
  retrieve: vi.fn(),
}));

import { retrieve } from '@/server/rag/rag';

const mockedRetrieve = vi.mocked(retrieve);

describe('enrichWithRAG', () => {
  it('returns enriched knowledge on successful RAG retrieval', async () => {
    mockedRetrieve.mockResolvedValueOnce({
      results: [
        {
          content: '虚拟DOM是React核心概念，用于优化渲染性能。',
          score: 0.9,
          docId: 'react-vdom',
          source: 'React面试指南',
          category: '面试类',
        },
        {
          content: 'React使用diff算法比较新旧虚拟DOM树。',
          score: 0.85,
          docId: 'react-diff',
          source: 'React面试指南',
          category: '面试类',
        },
        {
          content: 'React Fiber架构改进了调度机制。',
          score: 0.8,
          docId: 'react-fiber',
          source: 'React深度解析',
          category: '面试类',
        },
      ],
      context: '',
      status: 'generating',
      citations: [],
    });

    const result = await enrichWithRAG('React虚拟DOM原理', 3);

    expect(result.question).toBe('React虚拟DOM原理');
    expect(result.relevantConcepts).toHaveLength(3);
    expect(result.relevantConcepts[0]!.title).toBe('react-vdom');
    expect(result.relevantConcepts[0]!.content).toContain('虚拟DOM');
    expect(result.relevantConcepts[0]!.source).toBe('React面试指南');
  });

  it('respects topK parameter', async () => {
    mockedRetrieve.mockResolvedValueOnce({
      results: [
        { content: 'Result 1', score: 0.9, docId: 'd1', source: 's1' },
        { content: 'Result 2', score: 0.8, docId: 'd2', source: 's2' },
        { content: 'Result 3', score: 0.7, docId: 'd3', source: 's3' },
      ],
      context: '',
      status: 'generating',
      citations: [],
    });

    const result = await enrichWithRAG('test question', 2);
    expect(result.relevantConcepts).toHaveLength(2);
  });

  it('returns empty results on RAG failure', async () => {
    mockedRetrieve.mockRejectedValueOnce(new Error('RAG service unavailable'));

    const result = await enrichWithRAG('test question');

    expect(result.question).toBe('test question');
    expect(result.relevantConcepts).toEqual([]);
  });

  it('returns empty results on empty RAG results', async () => {
    mockedRetrieve.mockResolvedValueOnce({
      results: [],
      context: '',
      status: 'generating',
      citations: [],
    });

    const result = await enrichWithRAG('test question');
    expect(result.relevantConcepts).toEqual([]);
  });

  it('filters out empty content results', async () => {
    mockedRetrieve.mockResolvedValueOnce({
      results: [
        { content: '', score: 0.9, docId: 'd1', source: 's1' },
        { content: 'Valid content', score: 0.8, docId: 'd2', source: 's2' },
      ],
      context: '',
      status: 'generating',
      citations: [],
    });

    const result = await enrichWithRAG('test question');
    expect(result.relevantConcepts).toHaveLength(1);
    expect(result.relevantConcepts[0]!.content).toBe('Valid content');
  });

  it('uses fallback title when docId and source are undefined', async () => {
    mockedRetrieve.mockResolvedValueOnce({
      results: [
        { content: 'Some content', score: 0.9 },
      ],
      context: '',
      status: 'generating',
      citations: [],
    });

    const result = await enrichWithRAG('test question');
    expect(result.relevantConcepts[0]!.title).toBe('相关知识');
    expect(result.relevantConcepts[0]!.source).toBe('知识库');
  });
});

describe('enrichBatchWithRAG', () => {
  it('enriches multiple questions in parallel', async () => {
    mockedRetrieve
      .mockResolvedValueOnce({
        results: [{ content: 'R1', score: 0.9, docId: 'd1', source: 's1' }],
        context: '',
        status: 'generating',
        citations: [],
      })
      .mockResolvedValueOnce({
        results: [{ content: 'R2', score: 0.8, docId: 'd2', source: 's2' }],
        context: '',
        status: 'generating',
        citations: [],
      });

    const results = await enrichBatchWithRAG(['q1', 'q2']);

    expect(results).toHaveLength(2);
    expect(results[0]!.question).toBe('q1');
    expect(results[0]!.relevantConcepts).toHaveLength(1);
    expect(results[1]!.question).toBe('q2');
    expect(results[1]!.relevantConcepts).toHaveLength(1);
  });

  it('isolates failures across questions', async () => {
    mockedRetrieve
      .mockRejectedValueOnce(new Error('RAG failure'))
      .mockResolvedValueOnce({
        results: [{ content: 'R2', score: 0.8, docId: 'd2', source: 's2' }],
        context: '',
        status: 'generating',
        citations: [],
      });

    const results = await enrichBatchWithRAG(['q1', 'q2']);

    expect(results).toHaveLength(2);
    expect(results[0]!.relevantConcepts).toEqual([]);
    expect(results[1]!.relevantConcepts).toHaveLength(1);
  });
});