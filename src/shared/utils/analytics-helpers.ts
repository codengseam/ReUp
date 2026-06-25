// src/shared/utils/analytics-helpers.ts
// Frontend analytics helpers — safe wrapper around `track` plus a
// sessionId accessor. Designed for use from client components
// ('use client') only.
//
// Why a wrapper around `track`?
//   The SDK's `track` is fire-and-forget but it can still throw
//   synchronously if the runtime environment is unusual (e.g. a
//   partial jest fake without `Blob`). We never want a tracking
//   call to break business logic, so every helper below catches
//   its own errors and swallows them silently.

import { track, type AnalyticsEvent } from './analytics';

const SESSION_STORAGE_KEY = 'reup_session_id';

/**
 * Get the current session id from sessionStorage, lazily creating one
 * the first time it is read. Returns an empty string when the storage
 * API is unavailable (SSR, privacy-mode browsers, etc.).
 */
export function getSessionId(): string {
  if (typeof sessionStorage === 'undefined') {
    return '';
  }
  try {
    let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

/**
 * Fire-and-forget wrapper around `track` that never throws.
 * Use this from business logic to guarantee that a tracking failure
 * (network, stub mismatch, etc.) cannot break the user flow.
 */
export function safeTrack(event: AnalyticsEvent): void {
  try {
    track(event);
  } catch {
    // Intentionally swallow: tracking must never crash business code.
  }
}
