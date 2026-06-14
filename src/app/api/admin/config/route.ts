// src/app/api/admin/config/route.ts
// ReUp v2 Phase 1: stubbed. The legacy Coze knowledge-base bridge was removed
// in the LLM client migration (C5). The route stays registered (GET/POST) so
// the admin UI can probe the feature gap and surface a 503 with a stable
// error envelope. Local prompt/model/rag config is still served from
// `src/lib/server-config` once the admin UI is re-wired in Phase 1.5.

import type { NextRequest } from 'next/server';

function notImplemented(): Response {
  return new Response(
    JSON.stringify({
      error: 'NOT_IMPLEMENTED',
      message:
        'Admin documents API is deferred to ReUp v2 Phase 1.5 (BGE-M3 + admin UI not yet integrated).',
      endpoint: '/api/admin/config',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } }
  );
}

// ====== GET: 读取配置 ======
export async function GET(req: NextRequest): Promise<Response> {
  void req;
  return notImplemented();
}

// ====== POST: 写入配置 / 知识库操作 ======
export async function POST(req: NextRequest): Promise<Response> {
  void req;
  return notImplemented();
}
