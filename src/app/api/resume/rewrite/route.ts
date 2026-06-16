// src/app/api/resume/rewrite/route.ts
// Phase 3 P0 — B3 STAR rewrite SSE endpoint
// Two modes:
//   1. Full streaming: { resume } → SSE stream of STAR chunks
//   2. Single-section: { resume, section, currentText } → JSON { text, confidence }

import { type NextRequest } from 'next/server';
import { rewriteResumeStream } from '@/lib/resume/star-rewriter';
import { rewriteResumeSection } from '@/lib/resume/iteration';
import type { ResumeDocument } from '@/lib/resume/types';
import type { StarSection } from '@/lib/resume/star-rewriter';

const STAR_SECTION_SET = new Set<string>(['我的分析', 'STAR改写', '底层心法', '建议']);

function isStarSection(s: string): s is StarSection {
  return STAR_SECTION_SET.has(s);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resume = body.resume as ResumeDocument;
    const section = body.section as string | undefined;
    const currentText = body.currentText as string | undefined;

    if (!resume) {
      return new Response(JSON.stringify({ error: 'Missing resume' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Mode 2: Single-section rewrite (JSON response)
    if (section && currentText !== undefined) {
      if (!isStarSection(section)) {
        return new Response(JSON.stringify({ error: 'Invalid section' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      try {
        const result = await rewriteResumeSection(resume, section, currentText);
        return new Response(JSON.stringify({ text: result.text, confidence: result.confidence }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Section rewrite failed';
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Mode 1: Full streaming STAR rewrite (SSE)
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    request.signal.addEventListener('abort', onAbort, { once: true });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const chunk of rewriteResumeStream(resume, {
            signal: ctrl.signal,
          })) {
            const data = JSON.stringify({
              type: 'chunk',
              section: chunk.section,
              delta: chunk.delta,
              done: chunk.done,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'STAR rewrite failed';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
