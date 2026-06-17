// src/server/__tests__/logger.test.ts
// Tests for structured JSON logger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, generateTraceId, type LogContext } from '../logger';

describe('generateTraceId', () => {
  it('returns a 32-character hex string (UUID without dashes)', () => {
    const id = generateTraceId();
    expect(id).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(id)).toBe(true);
  });

  it('generates unique IDs on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe('createLogger', () => {
  let stdoutWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stdoutWrite = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(stdoutWrite as unknown as typeof process.stdout.write);
  });

  function getLogEntry(): Record<string, unknown> {
    const call = stdoutWrite.mock.calls[0]?.[0] as string | undefined;
    if (!call) throw new Error('No log output captured');
    // Strip trailing newline
    const trimmed = call.endsWith('\n') ? call.slice(0, -1) : call;
    return JSON.parse(trimmed) as Record<string, unknown>;
  }

  describe('info', () => {
    it('writes JSON Lines with level info and module', () => {
      const logger = createLogger('test:module');
      logger.info('hello world');

      const entry = getLogEntry();
      expect(entry.level).toBe('info');
      expect(entry.module).toBe('test:module');
      expect(entry.msg).toBe('hello world');
      expect(entry.ts).toBeTruthy();
      expect(typeof entry.ts).toBe('string');
    });

    it('includes traceId from context', () => {
      const logger = createLogger('test');
      logger.info('traced', { traceId: 'abc123' });

      const entry = getLogEntry();
      expect(entry.traceId).toBe('abc123');
    });

    it('includes duration from context', () => {
      const logger = createLogger('test');
      logger.info('done', { duration: 234 });

      const entry = getLogEntry();
      expect(entry.duration).toBe(234);
    });

    it('includes userId from context', () => {
      const logger = createLogger('test');
      logger.info('user action', { userId: 'user1' });

      const entry = getLogEntry();
      expect(entry.userId).toBe('user1');
    });

    it('includes extra context fields', () => {
      const logger = createLogger('test');
      logger.info('custom', { extra: 'data', count: 42 });

      const entry = getLogEntry();
      expect(entry.extra).toBe('data');
      expect(entry.count).toBe(42);
    });

    it('output ends with newline (JSON Lines)', () => {
      const logger = createLogger('test');
      logger.info('test');

      const call = stdoutWrite.mock.calls[0]?.[0] as string;
      expect(call.endsWith('\n')).toBe(true);
    });
  });

  describe('warn', () => {
    it('writes level warn', () => {
      const logger = createLogger('test');
      logger.warn('caution');

      const entry = getLogEntry();
      expect(entry.level).toBe('warn');
      expect(entry.msg).toBe('caution');
    });
  });

  describe('error', () => {
    it('writes level error with error details', () => {
      const logger = createLogger('test');
      const err = new Error('something broke');
      logger.error('failed', err);

      const entry = getLogEntry();
      expect(entry.level).toBe('error');
      expect(entry.msg).toBe('failed');
      expect(entry.error).toEqual({
        message: 'something broke',
        stack: err.stack,
      });
    });

    it('handles error without stack', () => {
      const logger = createLogger('test');
      const err = new Error('minimal');
      delete (err as { stack?: string }).stack;
      logger.error('failed', err);

      const entry = getLogEntry();
      expect(entry.error).toEqual({
        message: 'minimal',
        stack: undefined,
      });
    });

    it('works without error parameter', () => {
      const logger = createLogger('test');
      logger.error('just a message');

      const entry = getLogEntry();
      expect(entry.level).toBe('error');
      expect(entry.msg).toBe('just a message');
      expect(entry.error).toBeUndefined();
    });

    it('includes context alongside error', () => {
      const logger = createLogger('test');
      const err = new Error('boom');
      logger.error('failed', err, { traceId: 'trace-1', userId: 'u1' });

      const entry = getLogEntry();
      expect(entry.error).toBeDefined();
      expect(entry.traceId).toBe('trace-1');
      expect(entry.userId).toBe('u1');
    });
  });

  describe('debug', () => {
    it('writes level debug', () => {
      const logger = createLogger('test');
      logger.debug('verbose info');

      const entry = getLogEntry();
      expect(entry.level).toBe('debug');
      expect(entry.msg).toBe('verbose info');
    });
  });

  describe('ts format', () => {
    it('uses ISO 8601 format', () => {
      const logger = createLogger('test');
      logger.info('test');

      const entry = getLogEntry();
      const ts = entry.ts as string;
      // ISO 8601: 2026-06-17T10:00:00.000Z
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});