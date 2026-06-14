// src/app/api/documents/delete/route.ts
// ReUp v2 Phase 1: stubbed. The legacy Coze knowledge-base bridge was removed
// in the LLM client migration (C5). Document deletion is deferred to
// Phase 1.5. Returns 503 with a stable error envelope so the admin UI can
// detect the feature gap.

import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest): Promise<Response> {
  void request;
  return new Response(
    JSON.stringify({
      error: 'NOT_IMPLEMENTED',
      message:
        'Admin documents API is deferred to ReUp v2 Phase 1.5 (BGE-M3 + admin UI not yet integrated).',
      endpoint: '/api/documents/delete',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } }
  );
}
