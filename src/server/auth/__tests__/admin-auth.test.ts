// 阶段 3：admin-auth 单测
// 覆盖：密码哈希对比 + HMAC 签名 cookie + 篡改/伪造 cookie 防御

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  safeBufferEqual,
  safeStringEqual,
  signCookie,
  verifyCookie,
  verifyPassword,
  COOKIE_PAYLOAD,
} from '@/server/auth/admin-auth';

describe('safeStringEqual', () => {
  it('returns true for identical strings', () => {
    expect(safeStringEqual('admin', 'admin')).toBe(true);
  });
  it('returns false for different strings', () => {
    expect(safeStringEqual('admin', 'Admin')).toBe(false);
    expect(safeStringEqual('admin', 'adminx')).toBe(false);
  });
  it('returns false for length mismatch without leaking length', () => {
    expect(safeStringEqual('admin', 'admin_admin_admin')).toBe(false);
  });
});

describe('safeBufferEqual', () => {
  it('returns true for identical buffers', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('hello');
    expect(safeBufferEqual(a, b)).toBe(true);
  });
  it('returns false for different buffers', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('world');
    expect(safeBufferEqual(a, b)).toBe(false);
  });
  it('returns false for length mismatch', () => {
    const a = Buffer.from('hi');
    const b = Buffer.from('hello');
    expect(safeBufferEqual(a, b)).toBe(false);
  });
});

describe('hashPassword', () => {
  it('produces 32-byte buffer', () => {
    const h = hashPassword('any');
    expect(h.length).toBe(32);
  });
  it('produces deterministic output for same input', () => {
    const a = hashPassword('pass1');
    const b = hashPassword('pass1');
    expect(safeBufferEqual(a, b)).toBe(true);
  });
  it('produces different output for different input', () => {
    const a = hashPassword('pass1');
    const b = hashPassword('pass2');
    expect(safeBufferEqual(a, b)).toBe(false);
  });
});

describe('verifyPassword', () => {
  it('accepts correct password', () => {
    expect(verifyPassword('correct-horse-battery-staple', 'correct-horse-battery-staple')).toBe(true);
  });
  it('rejects wrong password', () => {
    expect(verifyPassword('correct', 'incorrect')).toBe(false);
  });
  it('rejects empty / non-string', () => {
    expect(verifyPassword('', 'something')).toBe(false);
    expect(verifyPassword('something', '')).toBe(false);
    // @ts-expect-error testing non-string
    expect(verifyPassword(null, 'something')).toBe(false);
  });
});

describe('signCookie / verifyCookie', () => {
  const secret = 'unit-test-secret-32-bytes-12345678';

  it('round-trips a valid cookie', () => {
    const enc = signCookie(COOKIE_PAYLOAD, secret);
    expect(verifyCookie(enc, secret)).toBe(true);
  });

  it('rejects cookie signed with different secret', () => {
    const enc = signCookie(COOKIE_PAYLOAD, secret);
    expect(verifyCookie(enc, 'other-secret')).toBe(false);
  });

  it('rejects tampered payload (flipping a byte in base64url)', () => {
    const enc = signCookie(COOKIE_PAYLOAD, secret);
    // 翻转中间 5 个字符
    const tampered = enc.slice(0, 5) + (enc[5] === 'A' ? 'B' : 'A') + enc.slice(6);
    expect(verifyCookie(tampered, secret)).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(verifyCookie('not-base64url', secret)).toBe(false);
    expect(verifyCookie('', secret)).toBe(false);
    expect(verifyCookie('YQ', secret)).toBe(false); // base64url("a") 但无 .
  });

  it('rejects when expected payload mismatches', () => {
    const enc = signCookie(COOKIE_PAYLOAD, secret);
    expect(verifyCookie(enc, secret, 'not-authed')).toBe(false);
  });

  it('rejects empty secret', () => {
    expect(() => signCookie('x', '')).toThrow();
  });
});
