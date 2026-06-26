// src/server/utils/__tests__/logger.test.ts
// Tests for the hand-rolled structured logger (utils/logger.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, type LogFields } from '../logger';

const realNodeEnv = process.env.NODE_ENV;

// NODE_ENV 在本项目类型中是 readonly, 通过 cast 写入以切换日志格式。
function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

describe('utils/logger', () => {
  let stdoutWrite: ReturnType<typeof vi.fn>;
  let stderrWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stdoutWrite = vi.fn();
    stderrWrite = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(
      stdoutWrite as unknown as typeof process.stdout.write
    );
    vi.spyOn(process.stderr, 'write').mockImplementation(
      stderrWrite as unknown as typeof process.stderr.write
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setNodeEnv(realNodeEnv);
  });

  function stdoutLine(): string {
    const call = stdoutWrite.mock.calls[0]?.[0] as string | undefined;
    if (!call) throw new Error('No stdout output captured');
    return call.endsWith('\n') ? call.slice(0, -1) : call;
  }

  function stderrLine(): string {
    const call = stderrWrite.mock.calls[0]?.[0] as string | undefined;
    if (!call) throw new Error('No stderr output captured');
    return call.endsWith('\n') ? call.slice(0, -1) : call;
  }

  describe('production (JSON Lines)', () => {
    beforeEach(() => {
      setNodeEnv('production');
    });

    it('info emits JSON with ts/level/msg/fields to stdout', () => {
      logger.info('hello', { requestId: 'r1' });
      const entry = JSON.parse(stdoutLine()) as Record<string, unknown>;
      expect(entry.level).toBe('info');
      expect(entry.msg).toBe('hello');
      expect(typeof entry.ts).toBe('string');
      expect(entry.fields).toEqual({ requestId: 'r1' });
    });

    it('warn writes to stdout', () => {
      logger.warn('careful');
      const entry = JSON.parse(stdoutLine()) as Record<string, unknown>;
      expect(entry.level).toBe('warn');
      expect(entry.msg).toBe('careful');
      // fields present even when empty
      expect(entry.fields).toEqual({});
    });

    it('error writes to stderr', () => {
      logger.error('boom', { code: 500 });
      expect(stderrWrite).toHaveBeenCalled();
      const entry = JSON.parse(stderrLine()) as Record<string, unknown>;
      expect(entry.level).toBe('error');
      expect(entry.msg).toBe('boom');
      expect(entry.fields).toEqual({ code: 500 });
    });

    it('output ends with newline', () => {
      logger.info('x');
      const call = stdoutWrite.mock.calls[0]?.[0] as string;
      expect(call.endsWith('\n')).toBe(true);
    });
  });

  describe('dev (human-readable colored)', () => {
    beforeEach(() => {
      setNodeEnv('development');
    });

    it('info line contains level tag and message', () => {
      logger.info('starting up');
      const line = stdoutLine();
      expect(line).toContain('starting up');
      expect(line).toContain('INFO');
      // contains ANSI color escape
      expect(line).toContain('\x1b[');
    });

    it('error writes colored line to stderr', () => {
      logger.error('failed');
      const line = stderrLine();
      expect(line).toContain('failed');
      expect(line).toContain('ERROR');
    });

    it('omits fields section when no fields', () => {
      logger.info('no fields');
      const line = stdoutLine();
      // no fields → no JSON object appended after the message
      expect(line.endsWith('no fields')).toBe(true);
    });
  });

  describe('child logger', () => {
    beforeEach(() => {
      setNodeEnv('production');
    });

    it('merges child fields into every log entry', () => {
      const reqLogger = logger.child({ requestId: 'abc-123' });
      reqLogger.info('handling request');
      reqLogger.warn('slow', { ms: 1200 });

      const first = JSON.parse(stdoutLine()) as Record<string, unknown>;
      const second = JSON.parse(
        (stdoutWrite.mock.calls[1]?.[0] as string).replace(/\n$/, '')
      ) as Record<string, unknown>;

      expect(first.fields).toEqual({ requestId: 'abc-123' });
      expect(second.fields).toEqual({ requestId: 'abc-123', ms: 1200 });
    });

    it('caller fields override child fields on conflict', () => {
      const base = logger.child({ requestId: 'parent' });
      base.info('override', { requestId: 'child' } as LogFields);
      const entry = JSON.parse(stdoutLine()) as Record<string, unknown>;
      expect(entry.fields).toEqual({ requestId: 'child' });
    });

    it('nested child accumulates fields', () => {
      const a = logger.child({ requestId: 'r' });
      const b = a.child({ userId: 'u1' });
      b.info('nested');
      const entry = JSON.parse(stdoutLine()) as Record<string, unknown>;
      expect(entry.fields).toEqual({ requestId: 'r', userId: 'u1' });
    });
  });
});
