// src/lib/admin-auth.ts
// 阶段 3：Admin 鉴权用的纯函数（便于单测 + 复用）
// - hashPassword / verifyPassword：PBKDF2 派生 + timingSafeEqual
// - signCookie / verifyCookie：HMAC-SHA256 签名 + base64url
// 阶段 4：可复用做 dashboard API 鉴权

import { pbkdf2Sync, createHmac, timingSafeEqual } from 'crypto';

const PBKDF2_SALT = 'boss-admin-static-salt-v1';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

export const COOKIE_PAYLOAD = 'authed';

/**
 * 把明文密码 PBKDF2 派生为定长 Buffer。
 * 用定长 buffer 的目的是让 timingSafeEqual 能用（防 timing attack）。
 */
export function hashPassword(plain: string): Buffer {
  return pbkdf2Sync(plain, PBKDF2_SALT, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
}

/**
 * 常量时间比较两个 Buffer（先做长度判断再 timingSafeEqual）
 */
export function safeBufferEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    // 假比较以避免通过长度差异推断信息
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * 常量时间比较两个字符串（先按 utf-8 转 buffer 再走 safeBufferEqual）
 */
export function safeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  return safeBufferEqual(aBuf, bBuf);
}

/**
 * 验证密码：基于"密码 + salt"派生等长 buffer 再比较，密码本身始终不出现在比较路径里。
 * - 返回 true 表示匹配，false 表示不匹配或参数非法
 */
export function verifyPassword(input: string, expected: string): boolean {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;
  if (!input || !expected) return false;
  const inputHash = hashPassword(input);
  const expectedHash = hashPassword(expected);
  return safeBufferEqual(inputHash, expectedHash);
}

/**
 * 用 HMAC-SHA256 签名一个字符串，输出 base64url。
 * - 格式：base64url("<value>.<hex_hmac>")
 */
export function signCookie(value: string, secret: string): string {
  if (!secret) throw new Error('signCookie requires non-empty secret');
  const hmac = createHmac('sha256', secret);
  hmac.update(value);
  const sig = hmac.digest('hex');
  return Buffer.from(`${value}.${sig}`, 'utf-8').toString('base64url');
}

/**
 * 验签 + 校验 payload 内容。
 * - payload 不匹配 → false
 * - HMAC 不匹配 → false
 * - 解析失败 / 长度异常 → false
 */
export function verifyCookie(encoded: string, secret: string, expectedPayload: string = COOKIE_PAYLOAD): boolean {
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
    const dotIdx = decoded.lastIndexOf('.');
    if (dotIdx <= 0 || dotIdx === decoded.length - 1) return false;
    const payload = decoded.slice(0, dotIdx);
    const sig = decoded.slice(dotIdx + 1);
    if (payload !== expectedPayload) return false;
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSig = hmac.digest('hex');
    return safeStringEqual(sig, expectedSig);
  } catch {
    return false;
  }
}
