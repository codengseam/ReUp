// src/app/api/health/route.ts
// 健康检查端点：供 Docker HEALTHCHECK / K8s liveness/readiness probe / 反向代理使用。
// - GET /api/health        轻量探活，只返回进程状态
// - GET /api/health?deep=1 深度检查，额外验证向量索引和数据库可读

import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveVectorsPath(): string {
  const override = process.env.REUP_VECTORS_PATH;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override;
  }
  return path.join(process.cwd(), 'data', 'skill-vectors.json');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === '1';

  const startedAt = process.env.REUP_STARTED_AT;
  const uptimeMs = startedAt ? Date.now() - Number(startedAt) : null;

  const base = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeMs,
    node: process.version,
    env: process.env.NODE_ENV ?? 'development',
  };

  if (!deep) {
    return NextResponse.json(base);
  }

  // 深度检查：向量索引文件存在 + 数据库文件可读
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  const vectorsPath = resolveVectorsPath();
  checks.vectors = {
    ok: existsSync(vectorsPath),
    detail: vectorsPath,
  };

  const dbPath = process.env.LOOP_ENGINEERING_DB
    ?? path.join(process.cwd(), 'data', 'loop-engineering.sqlite');
  checks.database = {
    ok: existsSync(dbPath),
    detail: dbPath,
  };

  checks.apiKey = {
    ok: Boolean(process.env.DASHSCOPE_API_KEY?.trim() || process.env.ZHIPU_API_KEY?.trim()),
    detail: `dashscope=${process.env.DASHSCOPE_API_KEY ? 'set' : 'unset'}; zhipu=${process.env.ZHIPU_API_KEY ? 'set' : 'unset'}`,
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ...base, checks },
    { status: allOk ? 200 : 503 }
  );
}
