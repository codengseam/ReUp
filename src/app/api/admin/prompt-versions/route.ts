// src/app/api/admin/prompt-versions/route.ts
// M3: Prompt 版本注册表 CRUD
// 修复: requireAdmin 收紧, experiment_traffic 范围校验, 500 统一

import { NextRequest, NextResponse } from 'next/server';
import {
  registerPromptVersion,
  getAllPromptVersions,
  getActivePrompt,
  activatePromptVersion,
  type PromptVersionInput,
} from '@/lib/db/prompt-versions';
import { requireAdmin, unauthorizedResponse, internalErrorResponse } from '@/lib/admin-auth-helper';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return unauthorizedResponse();
  try {
    const active = getActivePrompt();
    const all = getAllPromptVersions();
    return NextResponse.json({ active, all });
  } catch (error) {
    return internalErrorResponse('[Admin PromptVersions API]', error);
  }
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) return unauthorizedResponse();
  try {
    const body = await request.json() as PromptVersionInput & { action?: 'register' | 'activate' };

    if (body.action === 'activate') {
      if (!body.version) {
        return NextResponse.json({ error: 'version 必填' }, { status: 400 });
      }
      const ok = activatePromptVersion(body.version);
      return NextResponse.json({ activated: ok });
    }

    // register
    if (!body.version || !body.prompt_content) {
      return NextResponse.json({ error: 'version 和 prompt_content 必填' }, { status: 400 });
    }
    // M-2 修复: experiment_traffic 必须在 [0,1]
    if (body.experiment_traffic != null && (body.experiment_traffic < 0 || body.experiment_traffic > 1)) {
      return NextResponse.json({ error: 'experiment_traffic 必须在 [0, 1]' }, { status: 400 });
    }
    const id = registerPromptVersion({
      version: body.version,
      prompt_content: body.prompt_content,
      change_description: body.change_description,
      author: body.author,
      is_active: 0,
      is_experiment: body.is_experiment ? 1 : 0,
      experiment_id: body.experiment_id,
      experiment_traffic: body.experiment_traffic ?? 0,
    });
    return NextResponse.json({ id, version: body.version });
  } catch (error) {
    return internalErrorResponse('[Admin PromptVersions POST]', error);
  }
}
