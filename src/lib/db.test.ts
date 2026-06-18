// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let capturedUrl: string | undefined;

class MockAdapter {
  url: string;
  constructor(opts: { url: string }) {
    this.url = opts.url;
    capturedUrl = opts.url;
  }
}

class MockPrismaClient {
  adapter: MockAdapter;
  constructor(opts: { adapter: MockAdapter }) {
    this.adapter = opts.adapter;
  }
}

vi.mock('../../prisma/generated/client', () => ({
  PrismaClient: MockPrismaClient,
}));

vi.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: MockAdapter,
}));

beforeEach(() => {
  capturedUrl = undefined;
  delete process.env.LOOP_ENGINEERING_DB;
});

afterEach(() => {
  vi.resetModules();
});

describe('Prisma database client', () => {
  it('uses LOOP_ENGINEERING_DB when set', async () => {
    process.env.LOOP_ENGINEERING_DB = '/app/data/custom.sqlite';
    const { createPrismaClient } = await import('./db');
    createPrismaClient();
    expect(capturedUrl).toBe('file:/app/data/custom.sqlite');
  });

  it('falls back to local dev.db when LOOP_ENGINEERING_DB is unset', async () => {
    const { createPrismaClient } = await import('./db');
    createPrismaClient();
    expect(capturedUrl).toBe('file:./dev.db');
  });
});
