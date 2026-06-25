// src/app/api/resume/jd-keywords/route.ts
// Server-side JD keyword extraction using LLMClient
// Client POST { jd } → { keywords: [{term, weight}] }
//
// Phase 6 (C5): the LLM system prompt is read from the admin runtime
// config (key: `resume.atsPrompt`) so admins can tune extraction behavior
// without code changes. Falls back to the default built into `ats.ts`.

import { type NextRequest } from 'next/server';
import { extractJdKeywords } from '@/features/resume/ats';
import { LLMClient } from '@/server/llm/llm-client';
import { getResumePrompt } from '@/features/resume/admin-config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jd = body.jd as string;

    if (!jd || jd.trim().length === 0) {
      return new Response(JSON.stringify({ keywords: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let llmClient: LLMClient | undefined;
    try {
      llmClient = new LLMClient();
    } catch {
      // LLM not configured — will fall back to TF
    }

    const customSystemPrompt = await getResumePrompt('ats');

    const keywords = await extractJdKeywords(jd, {
      llmClient,
      topK: 20,
      customSystemPrompt: customSystemPrompt ?? undefined,
    });

    return new Response(JSON.stringify({ keywords }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JD keyword extraction failed';
    return new Response(JSON.stringify({ error: message, keywords: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
