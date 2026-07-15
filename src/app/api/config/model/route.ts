// src/app/api/config/model/route.ts
// 公开（免鉴权）端点：返回管理后台配置的默认模型 id。
// 仅返回 defaultModelId，不泄露任何 API Key / endpoint / 自定义模型明细。
// 供前端聊天页在首次加载时同步后台默认模型，修复「后台切换默认模型，用户端不生效」的 bug。

import { NextResponse } from 'next/server';
import { loadConfig } from '@/server/server-config';
import { BUILTIN_MODEL_IDS, DEFAULT_MODEL_ID } from '@/shared/config/models';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const config = await loadConfig();
  const serverDefault = config.defaultModelId;
  const allowed = BUILTIN_MODEL_IDS as readonly string[];
  const defaultModelId =
    serverDefault && allowed.includes(serverDefault) ? serverDefault : DEFAULT_MODEL_ID;
  return NextResponse.json({ defaultModelId }, { status: 200 });
}
