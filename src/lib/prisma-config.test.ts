// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Prisma config', () => {
  beforeEach(() => {
    delete process.env.LOOP_ENGINEERING_DB;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('uses LOOP_ENGINEERING_DB when set', async () => {
    process.env.LOOP_ENGINEERING_DB = '/app/data/prod.sqlite';
    const { default: config } = await import('../../prisma.config');
    expect(config.datasource?.url).toBe('file:/app/data/prod.sqlite');
  });

  it('falls back to local dev.db when LOOP_ENGINEERING_DB is unset', async () => {
    const { default: config } = await import('../../prisma.config');
    expect(config.datasource?.url).toBe('file:./dev.db');
  });
});
