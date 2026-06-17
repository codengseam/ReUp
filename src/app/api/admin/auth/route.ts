// src/app/api/admin/auth/route.ts
// 阶段 3：Admin 鉴权迁后端
// - 用 Node 内置 `crypto`（pbkdf2 + hmac）做密码对比 + cookie 签名（不引第三方）
// - 用 ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SESSION_SECRET 环境变量
// - 失败原因区分：not_configured（503）/ bad_credentials（401）

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  hashPassword,
  safeBufferEqual,
  safeStringEqual,
  signCookie,
  verifyCookie,
  COOKIE_PAYLOAD,
} from '@/server/auth/admin-auth';

export const runtime = 'nodejs';

// ====== Env / 配置 ======
const USERNAME = process.env.ADMIN_USERNAME;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? 'dev-secret-change-me';

const COOKIE_NAME = 'boss_admin_session';
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 天

function isAuthConfigured(): boolean {
  return Boolean(USERNAME && PASSWORD);
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
  const usernameOk = safeStringEqual(username, USERNAME!);
  // 2. 密码常量时间比较（基于 PBKDF2 派生后的等长 buffer）
  const passwordHash = hashPassword(password);
  const expectedHash = hashPassword(PASSWORD!);
  const passwordOk = safeBufferEqual(passwordHash, expectedHash);

  if (!usernameOk || !passwordOk) {
    // 故意统一返回 401，不区分"用户名错"和"密码错"，防账号枚举
    return NextResponse.json({ error: 'bad_credentials', message: '账号或密码错误' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, signCookie(COOKIE_PAYLOAD, SESSION_SECRET), {
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
  res.cookies.delete(COOKIE_NAME);
  return res;
}

/**
 * GET: 检查当前 cookie 是否有效
 * - 返回 { authenticated: boolean, configured: boolean }
 * - configured=false 时前端可展示"未配置"提示
 */
export async function GET() {
  const configured = isAuthConfigured();
  const cookieStore = await cookies();
  const c = cookieStore.get(COOKIE_NAME);
  const authenticated = c ? verifyCookie(c.value, SESSION_SECRET) : false;
  return NextResponse.json({ authenticated, configured });
}
