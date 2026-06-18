import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GET } from './route';

describe('/api/health', () => {
  const originalEnv = process.env;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'health-test-'));
    process.env = {
      ...originalEnv,
      REUP_STARTED_AT: String(Date.now()),
      DATABASE_URL: `file:${join(tmpDir, 'dev.db')}`,
      VECTORS_PATH: join(tmpDir, 'skill-vectors.json'),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns ok status without deep check', async () => {
    const req = new Request('http://localhost:5000/api/health');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.timestamp).toBeDefined();
    expect(json.uptimeMs).toBeDefined();
  });

  it('returns error when deep check files are missing', async () => {
    const req = new Request('http://localhost:5000/api/health?deep=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.status).toBe('error');
    expect(json.checks).toBeDefined();
    expect(json.checks.vectors).toBe(false);
    expect(json.checks.database).toBe(false);
  });

  it('returns ok when deep check files exist', async () => {
    mkdirSync(join(tmpDir, 'data'), { recursive: true });
    writeFileSync(process.env.VECTORS_PATH!, '{}');
    writeFileSync(join(tmpDir, 'dev.db'), '');

    const req = new Request('http://localhost:5000/api/health?deep=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.checks).toBeDefined();
    expect(json.checks.vectors).toBe(true);
    expect(json.checks.database).toBe(true);
  });
});
