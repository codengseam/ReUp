// src/app/api/resume/rewrite/route.ts
// 3 modes: 1) single-section JSON  2) contextual SSE  3) legacy STAR SSE
export const maxDuration = 300;

import { type NextRequest } from 'next/server';
import { LLMClient } from '@/server/llm/llm-client';
import { rewriteResumeStream as starStream } from '@/features/resume/star-rewriter';
import { rewriteResumeSection } from '@/features/resume/iteration';
import { rewriteResumeStream as ctxStream } from '@/features/resume/rewriter/contextual-rewriter';
import type { ResumeDocument, MatchReport } from '@/features/resume/types';
import type { StarSection } from '@/features/resume/star-rewriter';
import type { TargetSection } from '@/features/resume/rewriter/contextual-rewriter';

const STAR_S = new Set(['我的分析', 'STAR改写', '底层心法', '建议']);
const TGT_S = new Set(['experience', 'projects', 'skills']);
const isStar = (s: string): s is StarSection => STAR_S.has(s);
const isTgt = (s: string): s is TargetSection => TGT_S.has(s as TargetSection);
const sse = (d: Record<string, unknown>) => `data: ${JSON.stringify(d)}\n\n`;
const j = (d: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resume = body.resume as ResumeDocument | undefined;
    if (!resume) return j({ error: 'Missing resume' }, 400);

    // Mode 1: Single-section rewrite
    const section = body.section as string | undefined;
    const cur = body.currentText as string | undefined;
    if (section && cur !== undefined) {
      if (!isStar(section)) return j({ error: 'Invalid section' }, 400);
      try {
        const r = await rewriteResumeSection(resume, section, cur);
        return j({ text: r.text, confidence: r.confidence });
      } catch (err) {
        return j({ error: err instanceof Error ? err.message : 'Section rewrite failed' }, 500);
      }
    }

    // Mode 2 (contextual) or Mode 3 (legacy STAR)
    const rawSections: string[] | undefined = body.targetSections;
    const matchReport = body.matchReport as MatchReport | undefined;
    const isCtx = Array.isArray(rawSections) && rawSections.length > 0;

    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    request.signal.addEventListener('abort', onAbort, { once: true });

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const enq = (d: Record<string, unknown>) => controller.enqueue(enc.encode(sse(d)));
        try {
          if (isCtx) {
            const tgts = rawSections!.filter(isTgt);
            if (tgts.length === 0) { enq({ type: 'error', error: 'No valid target sections' }); controller.close(); return; }
            const llm = new LLMClient();
            for await (const c of ctxStream({ resume, matchReport, targetSections: tgts }, llm))
              enq({ type: 'chunk', section: c.section, delta: c.delta, done: c.done });
          } else {
            for await (const c of starStream(resume, { signal: ctrl.signal }))
              enq({ type: 'chunk', section: c.section, delta: c.delta, done: c.done });
          }
          enq({ type: 'done' });
          controller.close();
        } catch (err) {
          enq({ type: 'error', error: err instanceof Error ? err.message : 'Rewrite failed' });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch {
    return j({ error: 'Invalid request' }, 400);
  }
}