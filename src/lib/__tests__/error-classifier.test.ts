import { describe, expect, it } from 'vitest';
import { classifyError } from '../error-classifier';

describe('classifyError', () => {
  it('treats fetch TypeError as service unavailable', () => {
    const err = new TypeError('Failed to fetch');
    const result = classifyError(err);
    expect(result.title).toBe('AI 服务暂不可用');
    expect(result.hint).toContain('5001');
  });

  it('detects missing credentials (400/Missing)', () => {
    const err = new Error('Missing credentials: OPENAI_API_KEY');
    const result = classifyError(err);
    expect(result.title).toBe('AI 服务未配置');
    expect(result.hint).toContain('OPENAI_API_KEY');
  });

  it('detects 401 unauthorized', () => {
    const err = new Error('401 unauthorized: invalid api key');
    const result = classifyError(err);
    expect(result.title).toBe('API 密钥无效');
  });

  it('detects 403 forbidden', () => {
    const err = new Error('403 forbidden');
    const result = classifyError(err);
    expect(result.title).toBe('API 密钥无效');
  });

  it('detects 429 rate limit', () => {
    const err = new Error('429 rate limit exceeded');
    const result = classifyError(err);
    expect(result.title).toBe('调用额度已用完');
  });

  it('detects 500 upstream', () => {
    const err = new Error('500 upstream service error');
    const result = classifyError(err);
    expect(result.title).toBe('上游模型服务异常');
  });

  it('detects 502/503/504 server errors', () => {
    expect(classifyError(new Error('502 bad gateway')).title).toBe('上游模型服务异常');
    expect(classifyError(new Error('503 service unavailable')).title).toBe('上游模型服务异常');
    expect(classifyError(new Error('504 gateway timeout')).title).toBe('上游模型服务异常');
  });

  it('detects timeout', () => {
    const err = new Error('Request timeout');
    const result = classifyError(err);
    expect(result.title).toBe('请求超时');
  });

  it('falls back to generic for unknown errors', () => {
    const err = new Error('Some weird error');
    const result = classifyError(err);
    expect(result.title).toBe('出错了');
    expect(result.message).toBe('Some weird error');
  });

  it('handles non-Error inputs', () => {
    const result1 = classifyError('just a string');
    expect(result1.title).toBe('出错了');

    const result2 = classifyError(null);
    expect(result2.title).toBe('出错了');

    const result3 = classifyError(undefined);
    expect(result3.title).toBe('出错了');
  });

  it('preserves the original message when not classified', () => {
    const err = new Error('Custom business logic error: xyz');
    const result = classifyError(err);
    expect(result.message).toContain('Custom business logic error');
  });
});
