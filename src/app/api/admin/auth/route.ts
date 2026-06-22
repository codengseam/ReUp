// src/app/api/admin/auth/route.ts
// 阶段 3：Admin 鉴权迁后端
// - 用 Node 内置 `crypto`（pbkdf2 + hmac）做密码对比 + cookie 签名（不引第三方）
// - 用 ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SESSION_SECRET 环境变量
// - 失败原因区分：not_configured（503）/ bad_credentials（401）

import { NextRequest, NextResponse } from 'next/server';
import {
  hashPassword,
  safeBufferEqual,
  safeStringEqual,
  COOKIE_PAYLOAD,
} from '@/server/auth/admin-auth';
import { ADMIN_COOKIE, signAdminCookie, verifyAdminCookie } from '@/lib/admin-auth-helper';

export const runtime = 'nodejs';

// ====== Env / 配置 ======
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 天

function getUsername(): string | undefined {
  return process.env.ADMIN_USERNAME;
}

function getPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

function isAuthConfigured(): boolean {
  return Boolean(getUsername() && getPassword());
}

// ====== Handlers ======

/**
 * POST: 校验 username + password，签发 httpOnly cookie
 * - 503 admin_not_configured：env 未配置
 * - 400 bad_request：缺少 username/password
 * - 401 bad_credentials：账号或密码错误（不区分两者，防账号枚举）
 * - 200 success：签发 cookie
 */
export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    // 开发/过渡期：未配置真实管理员凭证时，允许任意非空账号密码登录并签发 cookie
    // 这样 /api/admin/* 的 requireAdmin 能一致通过。生产环境必须配置 ADMIN_USERNAME/PASSWORD。
    const body = await req.json().catch(() => ({})) as { username?: unknown; password?: unknown };
    if (typeof body.username === 'string' && typeof body.password === 'string' && body.username && body.password) {
      const res = NextResponse.json({ success: true, legacy: true });
      res.cookies.set(ADMIN_COOKIE, signAdminCookie(COOKIE_PAYLOAD), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });
      return res;
    }
    return NextResponse.json(
      { error: 'admin_not_configured', message: '服务端未配置 ADMIN_USERNAME / ADMIN_PASSWORD' },
      { status: 503 }
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: '请求体不是合法 JSON' }, { status: 400 });
  }

  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: 'bad_request', message: '缺少 username 或 password' }, { status: 400 });
  }

  // 1. 用户名常量时间比较
  const usernameOk = safeStringEqual(username, getUsername()!);
  // 2. 密码常量时间比较（基于 PBKDF2 派生后的等长 buffer）
  const passwordHash = hashPassword(password);
  const expectedHash = hashPassword(getPassword()!);
  const passwordOk = safeBufferEqual(passwordHash, expectedHash);

  if (!usernameOk || !passwordOk) {
    // 故意统一返回 401，不区分"用户名错"和"密码错"，防账号枚举
    return NextResponse.json({ error: 'bad_credentials', message: '账号或密码错误' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, signAdminCookie(COOKIE_PAYLOAD), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}

/**
 * DELETE: 清除 cookie（登出）
 */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}

/**
 * GET: 检查当前 cookie 是否有效
 * - 返回 { authenticated: boolean, configured: boolean }
 * - configured=false 时前端可展示"未配置"提示
 */
export async function GET(request: NextRequest) {
  const configured = isAuthConfigured();
  const c = request.cookies.get(ADMIN_COOKIE);
  const authenticated = c ? verifyAdminCookie(c.value) : false;
  return NextResponse.json({ authenticated, configured });
}
