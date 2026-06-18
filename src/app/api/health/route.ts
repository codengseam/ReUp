import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get('deep') === '1';
  const now = Date.now();
  const startedAt = parseInt(process.env.REUP_STARTED_AT || String(now), 10);
  const uptimeMs = now - startedAt;

  const response: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date(now).toISOString(),
    uptimeMs,
    node: process.version,
    env: process.env.NODE_ENV || 'unknown',
  };

  if (deep) {
    const dbUrl = process.env.DATABASE_URL || 'file:./data/dev.db';
    const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;
    const vectorsPath =
      process.env.VECTORS_PATH || path.join(process.cwd(), 'data', 'skill-vectors.json');

    const checks = {
      vectors: existsSync(vectorsPath),
      database: existsSync(dbPath),
    };

    response.checks = checks;

    if (!checks.vectors || !checks.database) {
      response.status = 'error';
      return NextResponse.json(response, { status: 503 });
    }
  }

  return NextResponse.json(response);
}
