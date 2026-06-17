// src/components/shared/resume/__tests__/ResumeAnalyzer.tracking.test.tsx
// Verifies the resume analyzer fires resume_upload, jd_parse,
// and match_analysis events at the right moments.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockSafeTrack = vi.fn();

vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

import { ResumeAnalyzer } from '../ResumeAnalyzer';

function mockAnalyzeSuccess(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      ok: true,
      resume: {
        meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-01T00:00:00.000Z' },
        basic: { name: '张三' },
        experience: [], projects: [], skills: [], education: [], raw: '张三',
      },
      jd: {
        meta: { version: 'reup.v2.phase3', source: 'paste', createdAt: '2026-01-01T00:00:00.000Z' },
        title: '前端工程师',
        requiredSkills: [], responsibilities: [],
        keywords: [], raw: '前端 JD',
      },
      diagnostics: { issues: [], summary: { total: 0, bySeverity: { high: 0, medium: 0, low: 0 } } },
      atsResult: { jdKeywords: [{ term: 'react', weight: 1 }], coverage: { hits: 1, total: 1, percentage: 100 }, missing: [] },
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function clickStart() {
  const btn = screen.getByRole('button', { name: /开始分析/ });
  fireEvent.click(btn);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResumeAnalyzer tracking', () => {
  it('emits page_view on mount', () => {
    render(<ResumeAnalyzer />);
    expect(mockSafeTrack).toHaveBeenCalledWith({ type: 'page_view', page: '/resume/analyzer' });
  });

  it('emits resume_upload, jd_parse, and match_analysis on successful analysis', async () => {
    mockAnalyzeSuccess();
    render(<ResumeAnalyzer />);

    const resumeArea = screen.getAllByPlaceholderText(/粘贴简历文本/)[0] as HTMLTextAreaElement;
    const jdArea = screen.getAllByPlaceholderText(/粘贴 JD 文本/)[0] as HTMLTextAreaElement;
    fireEvent.change(resumeArea, { target: { value: '我的简历' } });
    fireEvent.change(jdArea, { target: { value: '前端 JD' } });

    mockSafeTrack.mockClear();

    await act(async () => { clickStart(); });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'resume_upload',
        data: { format: 'txt', fileSize: 0 },
      });
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'jd_parse',
        data: { source: 'paste' },
      });
    });
    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'match_analysis',
        data: { score: 100 },
      });
    });
  });

  it('emits error event when analyze API throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    render(<ResumeAnalyzer />);

    const resumeArea = screen.getAllByPlaceholderText(/粘贴简历文本/)[0] as HTMLTextAreaElement;
    const jdArea = screen.getAllByPlaceholderText(/粘贴 JD 文本/)[0] as HTMLTextAreaElement;
    fireEvent.change(resumeArea, { target: { value: 'foo' } });
    fireEvent.change(jdArea, { target: { value: 'bar' } });

    mockSafeTrack.mockClear();
    await act(async () => { clickStart(); });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          data: expect.objectContaining({ message: 'network down' }),
        }),
      );
    });
  });
});
