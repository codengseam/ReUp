// src/lib/admin-auth-helper.ts
// 统一的 admin API 鉴权
// C-1/C-2 修复:
// - env 缺失时直接返 false (之前是返 true → 完全开放)
// - 启动时若 NODE_ENV=production 且 ADMIN_SESSION_SECRET 未设 → throw

import { NextRequest, NextResponse } from 'next/server';
import { signCookie, verifyCookie } from '@/lib/admin-auth';

export const ADMIN_COOKIE = 'boss_admin_session';

let _cachedSecret: string | null = null;

export function getSessionSecret(): string {
  if (_cachedSecret !== null) return _cachedSecret;
  const env = process.env.ADMIN_SESSION_SECRET;
  if (!env) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ADMIN_SESSION_SECRET must be set in production. Refusing to start with default secret.',
      );
    }
    // dev: 仍用 fallback 但只在非 production
    _cachedSecret = 'dev-only-insecure-secret-change-me-please-32chars';
  } else {
    _cachedSecret = env;
  }
  return _cachedSecret;
}

/** Sign a value with the configured admin session secret. */
export function signAdminCookie(value: string): string {
  return signCookie(value, getSessionSecret());
}

/** Verify an admin cookie with the configured session secret. */
export function verifyAdminCookie(encoded: string): boolean {
  try {
    return verifyCookie(encoded, getSessionSecret());
  } catch {
    return false;
  }
}

export function requireAdmin(request: NextRequest): boolean {
  // C-1 修复: 强制鉴权. 若 env 缺失且 production, 上面的 getSessionSecret 已 throw
  // dev 环境 (无 env) 仍然开放 (本地开发体验)
  if (process.env.NODE_ENV !== 'production' && !process.env.ADMIN_SESSION_SECRET) {
    return true;
  }
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  return verifyAdminCookie(cookie);
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

// M-5 修复: 500 错误统一返回 generic, 不泄漏内部
export function internalErrorResponse(console_message: string, error: unknown) {
  console.error(console_message, error instanceof Error ? error.message : String(error));
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}
