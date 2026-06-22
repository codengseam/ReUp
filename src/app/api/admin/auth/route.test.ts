// Tests for /api/admin/auth route
// Verifies that the same admin session secret is used for signing and verifying cookies,
// and that legacy/dev login issues a valid cookie accepted by /api/admin/skills' requireAdmin.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET, DELETE } from './route';
import { GET as skillsGET } from '../skills/route';

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function cookieFromResponse(res: Response): string | undefined {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return undefined;
  const match = setCookie.match(/boss_admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : undefined;
}

function authRequestWithCookie(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `boss_admin_session=${cookie}`;
  return new NextRequest('http://localhost/api/admin/auth', { headers });
}

function skillsRequestWithCookie(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `boss_admin_session=${cookie}`;
  return new NextRequest('http://localhost/api/admin/skills', { headers });
}

describe('/api/admin/auth', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_SESSION_SECRET = 'test-secret-123456789012345678901234567890';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'secret';
  });

  afterEach(() => {
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });

  it('issues a cookie that /api/admin/skills accepts', async () => {
    const loginRes = await POST(makeRequest({ username: 'admin', password: 'secret' }));
    expect(loginRes.status).toBe(200);
    const cookie = cookieFromResponse(loginRes);
    expect(cookie).toBeTruthy();

    const checkRes = await GET(authRequestWithCookie(cookie));
    const checkBody = await checkRes.json();
    expect(checkBody.authenticated).toBe(true);

    const skillsRes = await skillsGET(skillsRequestWithCookie(cookie));
    expect(skillsRes.status).toBe(200);
    const skillsBody = await skillsRes.json();
    expect(skillsBody.ok).toBe(true);
  });

  it('rejects invalid credentials', async () => {
    const res = await POST(makeRequest({ username: 'admin', password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('legacy dev login issues cookie accepted by /api/admin/skills when credentials not configured', async () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;

    const loginRes = await POST(makeRequest({ username: 'any', password: 'any' }));
    expect(loginRes.status).toBe(200);
    const body = await loginRes.json();
    expect(body.legacy).toBe(true);
    const cookie = cookieFromResponse(loginRes);
    expect(cookie).toBeTruthy();

    const skillsRes = await skillsGET(skillsRequestWithCookie(cookie));
    expect(skillsRes.status).toBe(200);
  });

  it('DELETE clears the cookie', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/boss_admin_session=;/);
  });
});
