// src/app/admin/_components/prompt-tab.test.tsx
// 回归测试 for the prompt admin editor. Only the "system" sub-tab remains
// after genericization (star/ats/match were domain-specific and removed).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import PromptTab from './prompt-tab';

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

function mockAdminConfigApi() {
  const getCalls: string[] = [];
  const postCalls: Array<{ key: string; value: { customPrompt: string } }> = [];
  global.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      postCalls.push(body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes('/api/admin/config')) {
      getCalls.push(new URL(u, 'http://x').searchParams.get('key') ?? '');
      return new Response(JSON.stringify({ customPrompt: '' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { getCalls, postCalls };
}

describe('PromptTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the system sub-tab', async () => {
    mockAdminConfigApi();
    render(<PromptTab />);
    expect(screen.getByTestId('prompt-tab-system')).toBeInTheDocument();
  });

  it('on mount, loads the "system" sub-tab prompt via /api/admin/config?key=prompt', async () => {
    const { getCalls } = mockAdminConfigApi();
    render(<PromptTab />);
    await waitFor(() => {
      expect(getCalls).toContain('prompt');
    });
  });

  it('editing + saving the system textarea POSTs the value to key=prompt', async () => {
    const { postCalls } = mockAdminConfigApi();
    const user = userEvent.setup();
    render(<PromptTab />);
    const textarea = await waitFor(() => screen.getByTestId('prompt-textarea-system'));
    await user.clear(textarea);
    await user.type(textarea, 'CUSTOM SYSTEM PROMPT');
    await user.click(screen.getByTestId('prompt-save-system'));
    await waitFor(() => {
      const calls = postCalls.filter((c) => c.key === 'prompt');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.at(-1)?.value.customPrompt).toContain('CUSTOM SYSTEM PROMPT');
    });
  });

  it('clicking "恢复默认" on the system tab POSTs the spec default and toasts', async () => {
    const { postCalls } = mockAdminConfigApi();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PromptTab />);
    const textarea = await waitFor(() => screen.getByTestId('prompt-textarea-system'));
    expect((textarea as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    await user.click(screen.getByTestId('prompt-reset-system'));
    confirmSpy.mockRestore();
    await waitFor(() => {
      const calls = postCalls.filter((c) => c.key === 'prompt');
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(toast.success).toHaveBeenCalled();
  });
});
