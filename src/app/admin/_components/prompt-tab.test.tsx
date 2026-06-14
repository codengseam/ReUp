import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import PromptTab from './prompt-tab';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('PromptTab 空值兜底', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
    vi.restoreAllMocks();
  });

  it('当 customPrompt 是空字符串时,回退到 DEFAULT_SYSTEM_PROMPT', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customPrompt: '' }),
    } as unknown as Response);

    render(<PromptTab />);
    const textarea = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain('你是 ReUp');
    });
  });

  it('当 customPrompt 只有空白时,回退到默认', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customPrompt: '   \n  ' }),
    } as unknown as Response);

    render(<PromptTab />);
    const textarea = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain('你是 ReUp');
    });
  });

  it('当 customPrompt 是有意义的字符串时,正常显示', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customPrompt: '你是测试助手' }),
    } as unknown as Response);

    render(<PromptTab />);
    const textarea = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('你是测试助手');
    });
  });
});
