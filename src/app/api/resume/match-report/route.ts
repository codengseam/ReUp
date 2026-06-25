// src/app/api/resume/match-report/route.ts
// Phase 4 — LLM-driven match report generation.
// Accepts { resume, jd } → returns { strengths, gaps, priorities } with
// meaningful Chinese dimension names (not knowledge-base skill IDs).
//
// Phase 6 (C2-C4): the system prompt now lives in src/lib/resume/prompts/match.ts
// and is overridable via the admin runtime config (key: `resume.matchPrompt`).
// The user turn now contains the FULL structured resume (truncated at 6KB)
// rather than a one-line summary, so the LLM can actually ground its analysis
// in resume facts. Parse failures are surfaced as HTTP 502 instead of a
// silent fallback so the UI can show a red banner.

export const maxDuration = 150; // 150 seconds for LLM invoke with large prompt

import { type NextRequest } from 'next/server';
import { LLMClient } from '@/server/llm/llm-client';
import type { MatchReport, ResumeDocument } from '@/features/resume/types';
import { DEFAULT_PRIORITIES } from '@/features/resume/matcher';
import { getResumePrompt } from '@/features/resume/admin-config';
import {
  DEFAULT_MATCH_REPORT_PROMPT,
  buildMatchReportUserPrompt,
} from '@/features/resume/match';

const EMPTY_REPORT: MatchReport = {
  strengths: [],
  gaps: [],
  priorities: DEFAULT_PRIORITIES.map((p) => ({ ...p })),
};

function parseMatchReport(content: string): MatchReport | null {
  // Try to extract JSON from the response
  let jsonStr = content.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1]?.trim() ?? jsonStr;
  }

  // Try to find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const report: MatchReport = {
      strengths: [],
      gaps: [],
      priorities: DEFAULT_PRIORITIES.map((p) => ({ ...p })),
    };

    if (Array.isArray(parsed.strengths)) {
      for (const s of parsed.strengths) {
        if (s && typeof s === 'object' && 'dimension' in s) {
          report.strengths.push({
            dimension: String(s.dimension),
            evidence: String(s.evidence ?? ''),
          });
        }
      }
    }

    if (Array.isArray(parsed.gaps)) {
      for (const g of parsed.gaps) {
        if (g && typeof g === 'object' && 'dimension' in g) {
          const sev = String(g.severity ?? 'medium');
          report.gaps.push({
            dimension: String(g.dimension),
            severity: sev === 'high' || sev === 'medium' || sev === 'low' ? sev : 'medium',
          });
        }
      }
    }

    if (Array.isArray(parsed.priorities)) {
      const priorities: MatchReport['priorities'] = [];
      for (const p of parsed.priorities) {
        if (p && typeof p === 'object' && 'rank' in p && 'action' in p) {
          const rank = Number(p.rank);
          const impact = String(p.expectedImpact ?? 'Medium');
          if (rank >= 1 && rank <= 3) {
            priorities.push({
              rank: rank as 1 | 2 | 3,
              action: String(p.action),
              expectedImpact: impact,
            });
          }
        }
      }
      if (priorities.length > 0) {
        report.priorities = priorities;
      }
    }

    return report;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resume = body.resume as ResumeDocument;
    const jd = body.jd as string;

    if (!resume || !jd) {
      return new Response(JSON.stringify({ error: 'Missing resume or jd' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let llmClient: LLMClient;
    try {
      llmClient = new LLMClient();
    } catch (err) {
      // No API key — return empty report with default priorities.
      // This is a normal "feature disabled" state, not an error.
      const message = err instanceof Error ? err.message : 'No LLM client';
      // eslint-disable-next-line no-console
      console.warn('[match-report] LLM not configured, returning empty report:', message);
      return new Response(JSON.stringify({ ...EMPTY_REPORT, llmEnabled: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const customPrompt = await getResumePrompt('match');
    const systemPrompt = customPrompt && customPrompt.trim().length > 0
      ? customPrompt
      : DEFAULT_MATCH_REPORT_PROMPT;

    // C1: send the FULL structured resume (truncated to 6KB) instead of
    // a hand-compressed one-line summary.
    const serializedResume = JSON.stringify(resume, null, 2);
    const userPrompt = buildMatchReportUserPrompt(serializedResume, jd);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    let response;
    try {
      response = await llmClient.invoke(messages, { temperature: 0.3, timeoutMs: 120_000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM invoke failed';
      // eslint-disable-next-line no-console
      console.error('[match-report] LLM invoke failed:', message);
      return new Response(JSON.stringify({ ...EMPTY_REPORT, error: message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const report = parseMatchReport(response.content);
    if (!report) {
      // C3: parse failure is no longer silent — surface a 502 with the raw
      // tail of the response (truncated) so the UI can show a useful banner.
      const tail = response.content.slice(-200);
      // eslint-disable-next-line no-console
      console.error('[match-report] LLM JSON parse failed. tail=', tail);
      return new Response(
        JSON.stringify({
          ...EMPTY_REPORT,
          error: 'match_report_parse_failed',
          message: 'LLM 返回的内容无法解析为匹配报告',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify(report), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Match report generation failed';
    // eslint-disable-next-line no-console
    console.error('[match-report] unexpected error:', message);
    return new Response(JSON.stringify({ ...EMPTY_REPORT, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
