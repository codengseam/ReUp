import { type NextRequest } from 'next/server';
import { LLMClient } from '@/server/llm/llm-client';
import { getTranscript } from '@/features/interview/transcript';
import { analyzeTranscript } from '@/features/interview/analysis';
import type { AnalysisProgress } from '@/features/interview/analysis';
import type { JDDocument } from '@/features/jd/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function makeJDFromText(jdText: string): JDDocument {
  return {
    meta: { source: 'text', parsedAt: new Date().toISOString() },
    title: 'JD',
    hardRequirements: [],
    responsibilities: [],
    skills: [],
    raw: jdText,
  };
}

export async function POST(request: NextRequest) {
  let body: { transcriptId: string; resumeId?: string; jdText?: string };
  try {
    body = await request.json() as { transcriptId: string; resumeId?: string; jdText?: string };
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!body.transcriptId) {
    return new Response('Missing transcriptId', { status: 400 });
  }

  const transcript = getTranscript(body.transcriptId);
  if (!transcript) {
    return new Response('Transcript not found', { status: 404 });
  }

  const llm = new LLMClient();
  const encoder = new TextEncoder();
  const jd = body.jdText ? makeJDFromText(body.jdText) : undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const result = await analyzeTranscript(
          transcript, llm, { jd },
          (progress: AnalysisProgress) => { enqueue(progress); }
        );
        enqueue({ type: 'done', result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Analysis error';
        enqueue({ type: 'error', message: msg });
      } finally {
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
}