import { type NextRequest } from 'next/server';
import { LLMClient } from '@/server/llm/llm-client';
import { getSession, addMessage } from '@/features/interview/coach';
import type { InterviewMessage } from '@/features/interview/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { sessionId: string; message: string };
  try {
    body = await request.json() as { sessionId: string; message: string };
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!body.sessionId || !body.message?.trim()) {
    return new Response('Missing sessionId or message', { status: 400 });
  }

  const session = getSession(body.sessionId);
  if (!session) {
    return new Response('Session not found', { status: 404 });
  }

  addMessage(session, { role: 'candidate', content: body.message });

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: session.systemPrompt },
    ...session.messages.map((m: InterviewMessage) => ({
      role: m.role === 'interviewer' ? 'assistant' as const : 'user' as const,
      content: m.content,
    })),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const llm = new LLMClient();
        let fullContent = '';
        for await (const chunk of llm.stream(messages)) {
          fullContent += chunk.content;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk.content })}\n\n`));
        }
        addMessage(session, { role: 'interviewer', content: fullContent });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
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