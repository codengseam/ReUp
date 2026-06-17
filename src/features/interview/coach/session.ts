import type { ResumeDocument } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';
import { buildCoachSystemPrompt } from './system-prompt';
import type { InterviewMessage } from './evaluator';

export type { InterviewMessage } from './evaluator';

export interface CoachSession {
  id: string;
  resumeId?: string;
  jdText?: string;
  systemPrompt: string;
  messages: InterviewMessage[];
  resume: ResumeDocument;
  createdAt: string;
}

// TTL: clean up sessions older than 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // clean every 10 minutes

const sessionStore = new Map<string, CoachSession>();

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessionStore) {
    const createdAt = new Date(session.createdAt).getTime();
    if (now - createdAt > SESSION_TTL_MS) {
      sessionStore.delete(id);
    }
  }
}

// Schedule periodic cleanup
const cleanupTimer = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
// Allow the timer to not block process exit
if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
  cleanupTimer.unref();
}

export function createSession(
  resume: ResumeDocument,
  jd?: JDDocument | null
): CoachSession {
  const session: CoachSession = {
    id: crypto.randomUUID(),
    jdText: jd?.raw,
    systemPrompt: buildCoachSystemPrompt(resume, jd),
    messages: [],
    resume,
    createdAt: new Date().toISOString(),
  };
  sessionStore.set(session.id, session);
  return session;
}

export function getSession(id: string): CoachSession | undefined {
  return sessionStore.get(id);
}

export function addMessage(session: CoachSession, message: InterviewMessage): void {
  session.messages.push(message);
}