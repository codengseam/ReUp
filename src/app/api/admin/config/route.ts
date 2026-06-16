// src/app/api/admin/config/route.ts
// ReUp v2 Phase 1.5: real read/write API for the 3 admin-config categories
// (prompt / model / rag) plus the 6 resume.* sub-keys, backed by
// `src/lib/server-config.ts`.
//
// URL contract (preserved — admin UI tabs depend on this):
//   GET  /api/admin/config?key=prompt|model|rag|resume.config|resume.privacy|resume.starPrompt|resume.starFewShot|resume.atsPrompt|resume.matchPrompt
//   POST /api/admin/config  body: { key, value }
//
// Auth: the cookie is enforced by the admin page layout via
// `/api/admin/auth`. This route intentionally does not re-check, so a
// direct fetch from a logged-in admin still works during background
// save flows (e.g. debounced persist).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  loadConfig,
  saveConfig,
  type ServerConfig,
} from '@/lib/server-config';
import { buildStarRewritePrompt } from '@/lib/resume/star-rewriter';

export const runtime = 'nodejs';

// ---------- Key catalogue ----------

const VALID_KEYS = [
  'prompt', 'model', 'rag',
  'resume.config', 'resume.privacy',
  'resume.starPrompt', 'resume.starFewShot',
  'resume.atsPrompt', 'resume.matchPrompt',
] as const;
type ConfigKey = (typeof VALID_KEYS)[number];

function isConfigKey(v: unknown): v is ConfigKey {
  return typeof v === 'string' && (VALID_KEYS as readonly string[]).includes(v);
}

// ---------- GET ----------

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const action = url.searchParams.get('action');

  // Preview default: return the runtime-generated default STAR prompt
  if (key === 'resume.starPrompt' && action === 'preview-default') {
    try {
      const defaultPrompt = buildStarRewritePrompt();
      return NextResponse.json(
        { defaultPrompt, previewAt: new Date().toISOString() },
        { status: 200 }
      );
    } catch (err) {
      return NextResponse.json(
        { error: 'preview_failed', detail: String(err) },
        { status: 500 }
      );
    }
  }

  if (key === null || key === '') {
    return NextResponse.json({ error: 'missing_key' }, { status: 400 });
  }
  if (!isConfigKey(key)) {
    return NextResponse.json(
      { error: 'unknown_key', validKeys: VALID_KEYS },
      { status: 400 }
    );
  }

  const config = await loadConfig();
  return NextResponse.json(toViewModel(key, config), { status: 200 });
}

// ---------- POST body schema ----------

const ragParamsSchema = z.object({
  topK: z.number(),
  minScore: z.number(),
  maxChars: z.number(),
  semanticWeight: z.number(),
  hydeEnabled: z.boolean(),
  rerankEnabled: z.boolean(),
  cacheTTL: z.number(),
  confidenceHighThreshold: z.number().min(0).max(1).optional(),
  confidenceMediumThreshold: z.number().min(0).max(1).optional(),
});

const customModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  providerType: z.string(),
  endpoint: z.string(),
  apiKey: z.string(),
  modelId: z.string(),
});

const resumeConfigSchema = z.object({
  topK: z.number().optional(),
  confidenceChars: z.number().optional(),
  fewShotIds: z.array(z.string()).optional(),
  sectionOrder: z.array(z.string()).optional(),
});

const postBodySchema = z
  .object({
    key: z.string(),
    value: z.record(z.string(), z.unknown()),
  })
  .passthrough();

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
  const { key, value } = parsed.data;

  if (typeof key !== 'string' || !isConfigKey(key)) {
    return NextResponse.json(
      { error: 'unknown_key', validKeys: VALID_KEYS },
      { status: 400 }
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // 3) Load current config (needed to deep-merge resume.* sub-objects so
  //    persisting resume.config doesn't clobber resume.privacy, etc.)
  const current = await loadConfig();

  // 4) Per-key value validation + transform into a server-config partial
  const partial = toServerPartial(key, value, current);
  if ('error' in partial) {
    return NextResponse.json({ error: partial.error }, { status: 400 });
  }

  // 5) Persist (saveConfig merges with the on-disk state)
  const updated = await saveConfig(partial);

  return NextResponse.json(
    { ok: true, key, persistedAt: updated.updatedAt },
    { status: 200 }
  );
}

// ---------- Helpers ----------

function toViewModel(
  key: ConfigKey,
  config: ServerConfig
): Record<string, unknown> {
  switch (key) {
    case 'prompt':
      return { customPrompt: config.prompt ?? null };
    case 'model':
      return {
        defaultModelId: config.defaultModelId ?? '',
        customModels: config.customModels ?? [],
      };
    case 'rag':
      return { ragParams: config.ragParams ?? null };
    case 'resume.config':
      return config.resume?.config ?? {};
    case 'resume.privacy':
      return config.resume?.privacy ?? {};
    case 'resume.starPrompt':
      return { customPrompt: config.resume?.starPrompt ?? null };
    case 'resume.starFewShot':
      return { customPrompt: config.resume?.starFewShot ?? null };
    case 'resume.atsPrompt':
      return { customPrompt: config.resume?.atsPrompt ?? null };
    case 'resume.matchPrompt':
      return { customPrompt: config.resume?.matchPrompt ?? null };
  }
}

type ServerPartial =
  | { error: string }
  | {
      prompt?: string;
      defaultModelId?: string;
      customModels?: ServerConfig['customModels'];
      ragParams?: ServerConfig['ragParams'];
      resume?: NonNullable<ServerConfig['resume']>;
    };

function toServerPartial(
  key: ConfigKey,
  value: Record<string, unknown>,
  current: ServerConfig
): ServerPartial {
  switch (key) {
    case 'prompt': {
      const cp = value.customPrompt;
      if (cp !== undefined && typeof cp !== 'string') {
        return { error: 'bad_request' };
      }
      return { prompt: typeof cp === 'string' ? cp : '' };
    }
    case 'model': {
      const dmi = value.defaultModelId;
      const cms = value.customModels;
      if (dmi !== undefined && typeof dmi !== 'string') {
        return { error: 'bad_request' };
      }
      if (cms !== undefined && !Array.isArray(cms)) {
        return { error: 'bad_request' };
      }
      let customModels: ServerConfig['customModels'];
      if (Array.isArray(cms)) {
        const arr: NonNullable<ServerConfig['customModels']> = [];
        for (const item of cms) {
          const m = customModelSchema.safeParse(item);
          if (!m.success) return { error: 'bad_request' };
          arr.push(m.data);
        }
        customModels = arr;
      }
      return {
        defaultModelId: typeof dmi === 'string' ? dmi : undefined,
        customModels,
      };
    }
    case 'rag': {
      const rp = value.ragParams;
      if (rp === undefined) return { error: 'bad_request' };
      const parsed = ragParamsSchema.safeParse(rp);
      if (!parsed.success) return { error: 'bad_request' };
      return { ragParams: parsed.data };
    }
    case 'resume.config': {
      const parsed = resumeConfigSchema.safeParse(value);
      if (!parsed.success) return { error: 'bad_request' };
      const existing = current.resume ?? {};
      const next: NonNullable<ServerConfig['resume']>['config'] = {
        ...(existing.config ?? {}),
        ...parsed.data,
      };
      return { resume: { ...existing, config: next } };
    }
    case 'resume.privacy': {
      const fl = value.forcedLocal;
      if (typeof fl !== 'boolean') return { error: 'bad_request' };
      const existing = current.resume ?? {};
      return {
        resume: {
          ...existing,
          privacy: { ...(existing.privacy ?? {}), forcedLocal: fl },
        },
      };
    }
    case 'resume.starPrompt':
    case 'resume.starFewShot':
    case 'resume.atsPrompt':
    case 'resume.matchPrompt': {
      const cp = value.customPrompt;
      if (typeof cp !== 'string') return { error: 'bad_request' };
      const slot = key.split('.')[1] as
        | 'starPrompt'
        | 'starFewShot'
        | 'atsPrompt'
        | 'matchPrompt';
      const existing = current.resume ?? {};
      return { resume: { ...existing, [slot]: cp } };
    }
  }
}
