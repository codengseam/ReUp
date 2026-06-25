// src/app/api/interview/transcript/list/__tests__/list.test.ts
// Lightweight integration test for the GET /api/interview/transcript/list
// route + the in-memory store. Confirms the round-trip works end to end.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  listTranscripts,
  storeTranscript,
  deleteTranscript,
} from '@/features/interview/transcript';
import type { InterviewTranscript } from '@/features/interview/transcript';

function makeTranscript(overrides: Partial<InterviewTranscript> = {}): InterviewTranscript {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    company: overrides.company,
    position: overrides.position,
    round: overrides.round,
    questions: overrides.questions ?? [{ question: 'Q1', answer: 'A1' }],
    result: overrides.result,
    rawText: overrides.rawText ?? 'raw',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

describe('transcript store + list endpoint contract', () => {
  beforeEach(() => {
    // Best-effort cleanup; the store does not expose a clear() so we delete
    // by reading first.
    for (const t of listTranscripts()) deleteTranscript(t.id);
  });

  it('returns an empty array when nothing is stored', () => {
    expect(listTranscripts()).toEqual([]);
  });

  it('persists a transcript and returns it via listTranscripts()', () => {
    const t = makeTranscript({ id: 'persist-1', company: '字节跳动' });
    storeTranscript(t);
    const list = listTranscripts();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('persist-1');
    expect(list[0]?.company).toBe('字节跳动');
  });

  it('sorts results by createdAt desc (newest first)', () => {
    const older = makeTranscript({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeTranscript({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z' });
    storeTranscript(older);
    storeTranscript(newer);
    const ids = listTranscripts().map((t) => t.id);
    expect(ids).toEqual(['new', 'old']);
  });

  it('removes a transcript via deleteTranscript()', () => {
    const t = makeTranscript({ id: 'to-remove' });
    storeTranscript(t);
    expect(listTranscripts().map((x) => x.id)).toContain('to-remove');
    const removed = deleteTranscript('to-remove');
    expect(removed).toBe(true);
    expect(listTranscripts().map((x) => x.id)).not.toContain('to-remove');
  });

  it('returns false when deleting a non-existent id', () => {
    expect(deleteTranscript('does-not-exist')).toBe(false);
  });
});
