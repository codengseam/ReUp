// src/app/api/admin/runtime-config/route.ts
// ReUp v2.5: Admin API for managing runtime API keys (DashScope / Zhipu).
//
// URL contract:
//   GET  /api/admin/runtime-config  -> { apiKeys: { dashscope, zhipu }, updatedAt }
//                                     All apiKey values are masked (***MASKED***) — never leak the real key.
//   POST /api/admin/runtime-config  body: { apiKeys: { dashscope?, zhipu? } }
//                                     Each provider is upserted; ***MASKED*** is rejected (refuse overwrite).
//                                     Empty string apiKey clears the slot.
//
// Auth: same convention as /api/admin/config — the cookie is enforced by the admin
// page layout; this route does not re-check so debounced background saves still work.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  loadRuntimeConfig,
  saveRuntimeConfig,
  maskRuntimeConfig,
  resolveMasked,
  type RuntimeConfig,
} from '@/server/runtime-config';

export const runtime = 'nodejs';

const MASK = '***MASKED***';

// ---------- POST body schema ----------

const providerKeySchema = z.object({
  endpoint: z.string().min(1).max(500),
  apiKey: z.string().max(500),
  provider: z.string().optional(),
});

const postBodySchema = z
  .object({
    apiKeys: z
      .object({
        dashscope: providerKeySchema.optional(),
        zhipu: providerKeySchema.optional(),
      })
      .optional(),
  })
  .passthrough();

// ---------- GET ----------

export async function GET(_req: NextRequest): Promise<Response> {
  const config = await loadRuntimeConfig();
  const masked = maskRuntimeConfig(config);
  // 始终返回 apiKeys: {}（即使文件不存在），便于前端渲染空表单
  return NextResponse.json(
    { apiKeys: masked.apiKeys ?? {}, updatedAt: masked.updatedAt },
    { status: 200 }
  );
}

// ---------- POST ----------

export async function POST(req: NextRequest): Promise<Response> {
  // 1) Parse JSON
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // 2) Validate body shape
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const partial: Partial<RuntimeConfig> = {};
  const apiKeysUpdate: Record<string, { endpoint: string; apiKey: string; provider?: string }> = {};

  const requested = parsed.data.apiKeys ?? {};

  for (const provider of ['dashscope', 'zhipu'] as const) {
    const slot = requested[provider];
    if (!slot) continue;

    // Refuse to write back the masked sentinel
    if (slot.apiKey === MASK) {
      return NextResponse.json(
        { error: 'bad_request', message: `拒绝写入：${provider} 的 apiKey 为掩码值，请填写真实密钥` },
        { status: 400 }
      );
    }

    apiKeysUpdate[provider] = {
      endpoint: slot.endpoint,
      apiKey: resolveMasked(slot.apiKey), // defensive (no-op unless MASK)
      provider,
    };
  }

  if (Object.keys(apiKeysUpdate).length > 0) {
    partial.apiKeys = apiKeysUpdate;
  }

  // 3) Persist (saveRuntimeConfig deep-merges apiKeys)
  const updated = await saveRuntimeConfig(partial);

  return NextResponse.json(
    { ok: true, updatedAt: updated.updatedAt },
    { status: 200 }
  );
}
