// src/app/admin/_components/prompt-tab.test.tsx
// ReUp v2 Phase 6 (D1): regression tests for the 4-sub-tab prompt admin
// editor. Each sub-tab is driven by the same `PromptEditor` instance, so
// we assert:
//   - 4 tabs render with their labels
//   - clicking each tab loads the correct key from /api/admin/config
//   - editing + saving calls POST with the correct key
//   - "恢复默认" / "清空" reverts to the spec default and POSTs it

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
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

describe('PromptTab (resume-parse-jd-prompts D1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all 4 sub-tabs with their labels', async () => {
    mockAdminConfigApi();
    render(<PromptTab />);
    expect(screen.getByTestId('prompt-tab-system')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-tab-star')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-tab-ats')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-tab-match')).toBeInTheDocument();
  });

  it('on mount, loads the "system" sub-tab prompt via /api/admin/config?key=prompt', async () => {
    const { getCalls } = mockAdminConfigApi();
    render(<PromptTab />);
    await waitFor(() => {
      expect(getCalls).toContain('prompt');
    });
  });

  it('clicking the match tab loads key=resume.matchPrompt', async () => {
    const { getCalls } = mockAdminConfigApi();
    const user = userEvent.setup();
    render(<PromptTab />);
    await user.click(screen.getByTestId('prompt-tab-match'));
    await waitFor(() => {
      expect(getCalls).toContain('resume.matchPrompt');
    });
  });

  it('editing + saving the match textarea POSTs the value to key=resume.matchPrompt', async () => {
    const { postCalls } = mockAdminConfigApi();
    const user = userEvent.setup();
    render(<PromptTab />);
    await user.click(screen.getByTestId('prompt-tab-match'));
    const textarea = await waitFor(() => screen.getByTestId('prompt-textarea-match'));
    await user.clear(textarea);
    await user.type(textarea, 'CUSTOM MATCH PROMPT');
    await user.click(screen.getByTestId('prompt-save-match'));
    await waitFor(() => {
      const calls = postCalls.filter((c) => c.key === 'resume.matchPrompt');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.at(-1)?.value.customPrompt).toContain('CUSTOM MATCH PROMPT');
    });
  });

  it('clicking "恢复默认" on the ats tab POSTs the spec default and toasts', async () => {
    const { postCalls } = mockAdminConfigApi();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PromptTab />);
    await user.click(screen.getByTestId('prompt-tab-ats'));
    const textarea = await waitFor(() => screen.getByTestId('prompt-textarea-ats'));
    // Sanity: textarea has the spec default
    expect((textarea as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    await user.click(screen.getByTestId('prompt-reset-ats'));
    confirmSpy.mockRestore();
    await waitFor(() => {
      const calls = postCalls.filter((c) => c.key === 'resume.atsPrompt');
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('the "star" sub-tab defaults to empty (runtime-built default)', async () => {
    mockAdminConfigApi();
    const user = userEvent.setup();
    render(<PromptTab />);
    await user.click(screen.getByTestId('prompt-tab-star'));
    const textarea = await waitFor(() => screen.getByTestId('prompt-textarea-star'));
    expect((textarea as HTMLTextAreaElement).value).toBe('');
    // Reset button label is special-cased for runtime defaults
    const resetBtn = screen.getByTestId('prompt-reset-star');
    expect(within(resetBtn).getByText(/清空/)).toBeInTheDocument();
  });
});
