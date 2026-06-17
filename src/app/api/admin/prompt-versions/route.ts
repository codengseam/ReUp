// src/app/api/admin/prompt-versions/route.ts
// M3: Prompt 版本注册表 CRUD

import { NextRequest, NextResponse } from 'next/server';
import {
  registerPromptVersion,
  getAllPromptVersions,
  getActivePrompt,
  activatePromptVersion,
  type PromptVersionInput,
} from '@/lib/db/prompt-versions';
import { verifyCookie } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const ADMIN_COOKIE = 'boss_admin_session';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'dev-only-insecure-secret-change-me-please-32chars';

async function requireAdmin(request: NextRequest): Promise<boolean> {
  if (!process.env.ADMIN_SESSION_SECRET) return true;
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  return verifyCookie(cookie, SESSION_SECRET);
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const active = getActivePrompt();
    const all = getAllPromptVersions();
    return NextResponse.json({ active, all });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取版本失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json() as PromptVersionInput & { action?: 'register' | 'activate' };

    if (body.action === 'activate') {
      const ok = activatePromptVersion(body.version);
      return NextResponse.json({ activated: ok });
    }

    // register
    if (!body.version || !body.prompt_content) {
      return NextResponse.json({ error: 'version 和 prompt_content 必填' }, { status: 400 });
    }
    const id = registerPromptVersion({
      version: body.version,
      prompt_content: body.prompt_content,
      change_description: body.change_description,
      author: body.author,
      is_active: 0, // 新注册默认不激活
      is_experiment: body.is_experiment ? 1 : 0,
      experiment_id: body.experiment_id,
      experiment_traffic: body.experiment_traffic,
    });
    return NextResponse.json({ id, version: body.version });
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
