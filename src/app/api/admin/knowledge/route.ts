// src/app/api/admin/knowledge/route.ts
// ReUp v2 Phase 1.5: admin "knowledge" tab read-only endpoint.
//
// Local architecture has no upload/delete — chunks are pre-bundled in
// `data/skill-vectors.json`. This endpoint surfaces:
//   - action=stats                          → high-level counts + group breakdowns
//   - action=search&q=...&limit=N           → free-text search over chunk text
//   - action=by-book|category|skill         → chunk groups by metadata key
//   - action=by-chapter|by-section|by-topic → chunk groups by L3 metadata
//                                              (doc_title / section_title / topic)
//   - action=topic-summary                  → book × category 2D cross-tab
//   - action=reload                         → re-runs ensureVectorStoreLoaded()
//
// All read paths delegate to `src/lib/admin-knowledge`. The reload action
// delegates to `src/lib/rag-init.ensureVectorStoreLoaded` (provided by
// the parallel rag-init sub-agent).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  getKnowledgeStats,
  searchKnowledge,
  listByGroup,
  getTopicSummary,
} from '@/lib/admin-knowledge';
import { ensureVectorStoreLoaded } from '@/lib/rag-init';

export const runtime = 'nodejs';

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Parse a positive-integer limit (1..1000) from a query string, or null. */
function parseLimit(raw: string | null): number | null | 'bad' {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return 'bad';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return 'bad';
  return n;
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  if (!action) return jsonError('missing_action', 400);

  // Lazy-load the pre-bundled index on first use; subsequent calls reuse
  // the same loaded store via the memoized promise in rag-init.
  const store = await ensureVectorStoreLoaded();

  switch (action) {
    case 'stats': {
      const stats = await getKnowledgeStats(store);
      return NextResponse.json(stats);
    }

    case 'search': {
      const q = url.searchParams.get('q') ?? '';
      if (!q.trim()) return jsonError('bad_request', 400);
      const limit = parseLimit(url.searchParams.get('limit'));
      if (limit === 'bad') return jsonError('bad_request', 400);
      const book = url.searchParams.get('book') ?? undefined;
      const category = url.searchParams.get('category') ?? undefined;
      const skillName = url.searchParams.get('skillName') ?? undefined;
      const opts: { limit?: number; book?: string; category?: string; skillName?: string } = {};
      if (limit !== null) opts.limit = limit;
      if (book) opts.book = book;
      if (category) opts.category = category;
      if (skillName) opts.skillName = skillName;
      const results = await searchKnowledge(store, q, opts);
      return NextResponse.json({ results });
    }

    case 'by-book':
    case 'by-category':
    case 'by-skill':
    case 'by-chapter':
    case 'by-section':
    case 'by-topic': {
      const limit = parseLimit(url.searchParams.get('limit'));
      if (limit === 'bad') return jsonError('bad_request', 400);
      const key =
        action === 'by-book' ? 'book'
        : action === 'by-category' ? 'category'
        : action === 'by-skill' ? 'skillName'
        : action === 'by-chapter' ? 'docTitle'
        : action === 'by-section' ? 'sectionTitle'
        : 'topic';
      const opts: { limit?: number } = {};
      if (limit !== null) opts.limit = limit;
      const groups = await listByGroup(store, key, opts);
      return NextResponse.json({ groups });
    }

    /**
     * book × category 2D 交叉表 + 各维度独立计数（不依赖 store）。
     * 由 admin metadata tab 用于一眼看出"晋升书里讲答辩有多少 chunk"。
     */
    case 'topic-summary': {
      const summary = await getTopicSummary();
      return NextResponse.json(summary);
    }

    case 'reload': {
      // ensureVectorStoreLoaded() above already returned the (memoized) loaded
      // store; report the current total so the client can refresh the panel.
      const dim = store.getDimension();
      const total = dim === 0 ? 0 : store.getVectorBuffer().length / dim;
      return NextResponse.json({
        ok: true,
        reloadedAt: new Date().toISOString(),
        total,
      });
    }

    default:
      return jsonError('unknown_action', 400);
  }
}
