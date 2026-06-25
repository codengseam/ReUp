import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getResumeRuntimeConfig, getResumePrompt, isForcedLocalMode, clearResumeConfigCache } from './admin-config';

const CONFIG = '/api/admin/config';

describe('admin-config', () => {
  beforeEach(() => { clearResumeConfigCache(); vi.restoreAllMocks(); });

  it('returns defaults when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const cfg = await getResumeRuntimeConfig();
    expect(cfg.topK).toBe(20);
    expect(cfg.confidenceChars).toBe(2000);
    expect(cfg.fewShotIds).toEqual(['example-1']);
    expect(cfg.sectionOrder).toEqual(['我的分析', 'STAR改写', '底层心法', '建议']);
  });

  it('merges server config with defaults (partial)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === `${CONFIG}?key=resume.config`) {
        return new Response(JSON.stringify({ topK: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }));
    const cfg = await getResumeRuntimeConfig();
    expect(cfg.topK).toBe(30);
    expect(cfg.confidenceChars).toBe(2000);
  });

  it('caches results within 5s window', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ topK: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await getResumeRuntimeConfig();
    await getResumeRuntimeConfig();
    await getResumeRuntimeConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clearResumeConfigCache forces refetch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ topK: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await getResumeRuntimeConfig();
    clearResumeConfigCache();
    await getResumeRuntimeConfig();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('getResumePrompt returns null when not set', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const p = await getResumePrompt('star');
    expect(p).toBeNull();
  });

  it('getResumePrompt returns string for resume.starPrompt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === `${CONFIG}?key=resume.starPrompt`) {
        return new Response(JSON.stringify({ customPrompt: 'OVERRIDE' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }));
    const p = await getResumePrompt('star');
    expect(p).toBe('OVERRIDE');
  });

  it('isForcedLocalMode reads resume.privacy.forcedLocal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === `${CONFIG}?key=resume.privacy`) {
        return new Response(JSON.stringify({ forcedLocal: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }));
    expect(await isForcedLocalMode()).toBe(true);
  });
});
