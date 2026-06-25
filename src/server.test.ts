// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let listenArgs: unknown[] = [];
let prepareResolved = true;
let prepareError: Error | null = null;
let exitCode: number | null = null;

const mockHandle = vi.fn();
const mockClose = vi.fn();
const mockApp = {
  getRequestHandler: () => mockHandle,
  prepare: vi.fn(() => {
    if (prepareError) return Promise.reject(prepareError);
    return Promise.resolve();
  }),
  close: mockClose,
};

vi.mock('next', () => ({
  default: () => mockApp,
}));

vi.mock('http', () => ({
  createServer: vi.fn((handler) => ({
    on: vi.fn(),
    listen: vi.fn((...args: unknown[]) => {
      listenArgs = args;
      const cb = args.find((a): a is () => void => typeof a === 'function');
      if (cb) cb();
    }),
    close: vi.fn((cb) => cb && cb()),
  })),
}));

beforeEach(() => {
  listenArgs = [];
  prepareResolved = true;
  prepareError = null;
  exitCode = null;
  mockHandle.mockReset();
  mockClose.mockReset();
  vi.stubGlobal('process', {
    ...process,
    on: vi.fn(),
    exit: (code: number) => {
      exitCode = code;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('custom Next.js server', () => {
  it('listens on the configured hostname and port', async () => {
    process.env.HOSTNAME = '127.0.0.1';
    process.env.PORT = '4000';
    await import('./server');
    await new Promise((r) => setTimeout(r, 10));
    expect(listenArgs[0]).toBe(4000);
    expect(listenArgs[1]).toBe('127.0.0.1');
  });

  it('exits with code 1 when app.prepare() rejects', async () => {
    prepareError = new Error('prepare failed');
    await import('./server');
    await new Promise((r) => setTimeout(r, 10));
    expect(exitCode).toBe(1);
  });
});
