// src/app/api/admin/skills/route.ts
// ReUp v2 Phase 2C：admin "Skill 框架" tab 接口。
//
// 返回 data/skills.json 里的 8 个框架 Skill（L1，对话层）及其完整 SKILL.md 内容。
// 走 getFrameworkSkills()，避免 admin 端直接 fs 读 skills/<id>/SKILL.md。
//
// 鉴权：复用 admin-auth 的 cookie 验签（与 /api/admin/auth 一致）：
// - 401 unauthenticated：未携带有效 boss_admin_session cookie
// - 200 ok：返回 { ok, skills: FrameworkSkill[] }
// - 500 server_error：读取 / 解析失败（error 字段为中文消息）

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getFrameworkSkills } from '@/server/db/admin-knowledge';
import { verifyCookie } from '@/server/auth/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'boss_admin_session';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? 'dev-secret-change-me';

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * GET：返回 8 个框架 Skill 完整定义（含 SKILL.md 全文）。
 *
 * 鉴权失败 → 401。鉴权成功 → 200 + { ok, skills }。
 * 任意 IO 错误 → 500 + { error: '获取框架 Skill 失败：...' }。
 */
export async function GET(): Promise<Response> {
  // 1) 鉴权：复用 /api/admin/auth 签发的 httpOnly cookie
  const cookieStore = await cookies();
  const c = cookieStore.get(COOKIE_NAME);
  const authenticated = c ? verifyCookie(c.value, SESSION_SECRET) : false;
  if (!authenticated) {
    return jsonError('unauthenticated', 401);
  }

  // 2) 读取框架 Skill
  try {
    const skills = await getFrameworkSkills();
    return NextResponse.json({ ok: true, skills });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return jsonError(`获取框架 Skill 失败：${detail}`, 500);
  }
}
