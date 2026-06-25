// src/shared/utils/analytics.ts
// Frontend analytics SDK — unified event tracking

export type AnalyticsEvent =
  | { type: 'page_view'; page: string; data?: Record<string, unknown> }
  | { type: 'resume_upload'; data: { format: string; fileSize: number } }
  | { type: 'jd_parse'; data: { source: 'paste' | 'upload' } }
  | { type: 'match_analysis'; data: { score: number } }
  | { type: 'star_rewrite'; data: { sectionCount: number } }
  | { type: 'interview_coach_start'; data: { hasJd: boolean } }
  | { type: 'interview_coach_end'; data: { messageCount: number } }
  | { type: 'transcript_upload'; data: { source: 'text' | 'voice' } }
  | { type: 'export'; data: { format: 'pdf' | 'docx' | 'md' } }
  | { type: 'error'; data: { message: string; stack?: string } };

const SESSION_STORAGE_KEY = 'reup_session_id';

function getSessionId(): string {
  // Browser-only: sessionStorage is available in the browser
  if (typeof sessionStorage === 'undefined') {
    return '';
  }
  try {
    let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return '';
  }
}

export function track(event: AnalyticsEvent): void {
  // Browser-only guard
  if (typeof window === 'undefined') {
    return;
  }

  const payload = {
    events: [event],
    sessionId: getSessionId(),
    timestamp: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const url = '/api/analytics/track';

  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      if (!sent) {
        // Fallback to fetch if sendBeacon fails
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {
          // Fire-and-forget: silently ignore errors
        });
      }
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // Fire-and-forget: silently ignore errors
      });
    }
  } catch {
    // Fire-and-forget: silently ignore any errors
  }
}