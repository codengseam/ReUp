import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, getSession, addMessage } from '../session';
import type { CoachSession } from '../session';
import type { ResumeDocument } from '@/features/resume/types';
import type { JDDocument } from '@/features/jd/types';

function makeResume(): ResumeDocument {
  return {
    meta: { version: 'reup.v2.phase3', source: 'text', createdAt: new Date().toISOString() },
    basic: { name: '张三', title: '前端工程师', yearsOfExperience: 5 },
    experience: [
      { company: 'A公司', role: '高级前端', period: '2022-2024', bullets: ['负责核心业务开发'] },
    ],
    projects: [],
    skills: ['React', 'TypeScript'],
    education: [],
    raw: 'test',
  };
}

function makeJD(): JDDocument {
  return {
    meta: { source: 'text', parsedAt: new Date().toISOString() },
    title: '高级前端工程师',
    hardRequirements: [],
    responsibilities: [],
    skills: [],
    raw: 'test jd',
  };
}

describe('createSession', () => {
  it('creates a session with a unique id', () => {
    const session1 = createSession(makeResume());
    const session2 = createSession(makeResume());

    expect(session1.id).toBeTruthy();
    expect(session2.id).toBeTruthy();
    expect(session1.id).not.toBe(session2.id);
  });

  it('includes system prompt based on resume', () => {
    const session = createSession(makeResume());

    expect(session.systemPrompt).toContain('张三');
    expect(session.systemPrompt).toContain('前端工程师');
  });

  it('includes JD info in system prompt when JD provided', () => {
    const session = createSession(makeResume(), makeJD());

    expect(session.systemPrompt).toContain('高级前端工程师');
  });

  it('stores JD raw text', () => {
    const session = createSession(makeResume(), makeJD());

    expect(session.jdText).toBe('test jd');
  });

  it('initializes with empty messages', () => {
    const session = createSession(makeResume());

    expect(session.messages).toEqual([]);
  });

  it('stores the resume', () => {
    const resume = makeResume();
    const session = createSession(resume);

    expect(session.resume).toBe(resume);
  });

  it('has a valid createdAt timestamp', () => {
    const session = createSession(makeResume());

    expect(session.createdAt).toBeTruthy();
    expect(() => new Date(session.createdAt)).not.toThrow();
  });
});

describe('getSession', () => {
  it('retrieves a stored session', () => {
    const session = createSession(makeResume());
    const retrieved = getSession(session.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(session.id);
  });

  it('returns undefined for unknown id', () => {
    const result = getSession('non-existent-id');

    expect(result).toBeUndefined();
  });
});

describe('addMessage', () => {
  it('appends message to session messages', () => {
    const session = createSession(makeResume());

    addMessage(session, { role: 'interviewer', content: 'Hello' });
    addMessage(session, { role: 'candidate', content: 'Hi' });

    expect(session.messages).toHaveLength(2);
    expect(session.messages[0]).toEqual({ role: 'interviewer', content: 'Hello' });
    expect(session.messages[1]).toEqual({ role: 'candidate', content: 'Hi' });
  });

  it('mutates the original session object', () => {
    const session = createSession(makeResume());
    const originalLength = session.messages.length;

    addMessage(session, { role: 'interviewer', content: 'Test' });

    expect(session.messages.length).toBe(originalLength + 1);
  });
});