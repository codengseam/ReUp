// src/app/api/analytics/track/route.ts
// Analytics event ingestion — fire-and-forget endpoint

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/server/logger';

const analyticsLogger = createLogger('analytics:track');

const analyticsEventSchema = z.object({
  type: z.enum([
    'page_view',
    'resume_upload',
    'jd_parse',
    'match_analysis',
    'star_rewrite',
    'interview_coach_start',
    'interview_coach_end',
    'transcript_upload',
    'export',
    'error',
  ]),
  page: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const trackBodySchema = z.object({
  events: z.array(analyticsEventSchema).min(1),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = trackBodySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { events, sessionId, timestamp } = parsed.data;

    for (const event of events) {
      analyticsLogger.info('analytics_event', {
        eventType: event.type,
        eventData: event.data,
        page: event.page,
        sessionId,
        timestamp,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400 },
    );
  }
}