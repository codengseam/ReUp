// src/app/api/health/route.ts
// 健康检查端点：供 Docker HEALTHCHECK / K8s liveness/readiness probe / 反向代理使用。
// - GET /api/health        轻量探活，只返回进程状态
// - GET /api/health?deep=1 深度检查，额外验证向量索引和数据库可读

import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveVectorsPath(): string {
  const override = process.env.REUP_VECTORS_PATH;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override;
  }
  return path.join(process.cwd(), 'data', 'skill-vectors.json');
}

// Prisma 核心表 (schema.prisma)。Phase 0 entrypoint 在 `prisma db push` 失败时降级启动,
// 此时 .sqlite 文件可能存在但 Prisma 表缺失 —— 必须实际打开 DB 并 SELECT 1 校验,
// 仅 existsSync 会掩盖 schema 不完整故障。
const CORE_TABLES = ['InterviewSession', 'InterviewReview', 'OfferPrediction', 'AnalyticsEvent'];

function checkDatabase(dbPath: string): { ok: boolean; detail?: string; error?: string } {
  if (!existsSync(dbPath)) {
    return { ok: false, detail: dbPath, error: `database file not found: ${dbPath}` };
  }
  // readonly: 健康检查只读, 不创建文件、不写入、不污染 WAL
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    for (const table of CORE_TABLES) {
      // 表不存在 / 不可读时 prepare().get() 抛出 -> 视为 DB 不健康
      db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
    }
    return { ok: true, detail: dbPath };
  } catch (err) {
    return {
      ok: false,
      detail: dbPath,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // 关闭失败不影响健康判定, 忽略
      }
    }
  }
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

  // 深度检查：向量索引文件存在 + 数据库可读且核心表存在
  const checks: Record<string, { ok: boolean; detail?: string; error?: string }> = {};

  const vectorsPath = resolveVectorsPath();
  checks.vectors = {
    ok: existsSync(vectorsPath),
    detail: vectorsPath,
  };

  const dbPath = process.env.LOOP_ENGINEERING_DB
    ?? path.join(process.cwd(), 'data', 'loop-engineering.sqlite');
  checks.database = checkDatabase(dbPath);

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
