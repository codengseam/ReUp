// 阶段 3：url-safety 单测
// 覆盖：协议白名单 / 回环地址 / 私有 IP / 云元数据端点 / 无效 URL

import { describe, it, expect } from 'vitest';
import { isSafeEndpoint } from '@/shared/utils/url-safety';

describe('isSafeEndpoint', () => {
  it('accepts public https URL', () => {
    const r = isSafeEndpoint('https://api.openai.com/v1/chat/completions');
    expect(r.safe).toBe(true);
  });

  it('accepts public http URL', () => {
    const r = isSafeEndpoint('http://api.example.com/v1');
    expect(r.safe).toBe(true);
  });

  it('rejects file://', () => {
    const r = isSafeEndpoint('file:///etc/passwd');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unsupported_protocol');
  });

  it('rejects ftp://', () => {
    const r = isSafeEndpoint('ftp://example.com');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('unsupported_protocol');
  });

  it('rejects javascript:', () => {
    const r = isSafeEndpoint('javascript:alert(1)');
    expect(r.safe).toBe(false);
  });

  it('rejects localhost', () => {
    const r = isSafeEndpoint('http://localhost:3000/v1');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('private_or_loopback');
  });

  it('rejects 127.0.0.1', () => {
    const r = isSafeEndpoint('http://127.0.0.1:8080');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('private_or_loopback');
  });

  it('rejects 0.0.0.0', () => {
    const r = isSafeEndpoint('http://0.0.0.0');
    expect(r.safe).toBe(false);
  });

  it('rejects 10.0.0.0/8 private range', () => {
    expect(isSafeEndpoint('http://10.0.0.1').safe).toBe(false);
    expect(isSafeEndpoint('http://10.255.255.255').safe).toBe(false);
  });

  it('rejects 172.16.0.0/12 private range', () => {
    expect(isSafeEndpoint('http://172.16.0.1').safe).toBe(false);
    expect(isSafeEndpoint('http://172.31.255.255').safe).toBe(false);
    // 172.32 不在私有段（应被允许，注意这是测试范围之外的"误判"）
  });

  it('rejects 192.168.0.0/16 private range', () => {
    expect(isSafeEndpoint('http://192.168.1.1').safe).toBe(false);
  });

  it('rejects AWS metadata endpoint 169.254.169.254', () => {
    const r = isSafeEndpoint('http://169.254.169.254/latest/meta-data/');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('private_or_loopback');
  });

  it('rejects GCP metadata endpoint', () => {
    const r = isSafeEndpoint('http://metadata.google.internal/computeMetadata/v1/');
    expect(r.safe).toBe(false);
  });

  it('rejects IPv6 loopback ::1', () => {
    const r = isSafeEndpoint('http://[::1]:3000');
    expect(r.safe).toBe(false);
  });

  it('rejects malformed URL', () => {
    const r = isSafeEndpoint('not a url at all');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('invalid_url');
  });

  it('rejects empty string', () => {
    const r = isSafeEndpoint('');
    expect(r.safe).toBe(false);
  });
});
