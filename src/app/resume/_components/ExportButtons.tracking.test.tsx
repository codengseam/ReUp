// src/app/resume/_components/ExportButtons.tracking.test.tsx
// Verifies the export event fires on Copy MD / PDF / DOCX clicks.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockSafeTrack = vi.fn();
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

import { ExportButtons } from './ExportButtons';
import type { ResumeDocument } from '@/features/resume/types';
import type { StarRewriteResult } from '@/features/resume/star-rewriter';

const resume: ResumeDocument = {
  meta: { version: 'reup.v2.phase3', source: 'text', createdAt: '2026-01-15T00:00:00.000Z' },
  basic: { name: '张三' },
  experience: [],
  projects: [],
  skills: ['Python'],
  education: [],
  raw: '张三',
};

const starResult: StarRewriteResult = {
  sections: { '我的分析': '', 'STAR改写': '', '底层心法': '', '建议': '' },
  confidence: 0.5,
};

function mockBlobFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(['x'])),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubClickForAnchor() {
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreate(tag) as HTMLAnchorElement;
    if (tag === 'a') {
      Object.defineProperty(el, 'click', { value: vi.fn(), configurable: true });
    }
    return el;
  });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:fake' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExportButtons tracking', () => {
  it('emits export with format=md on Copy MD click', async () => {
    render(<ExportButtons resume={resume} starResult={starResult} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy Markdown|复制 Markdown/i }));
    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'export',
        data: { format: 'md' },
      });
    });
  });

  it('emits export with format=pdf on PDF click', async () => {
    mockBlobFetch();
    stubClickForAnchor();
    render(<ExportButtons resume={resume} starResult={starResult} />);
    fireEvent.click(screen.getByRole('button', { name: /^PDF$|导出 PDF/i }));
    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'export',
        data: { format: 'pdf' },
      });
    });
  });

  it('emits export with format=docx on DOCX click', async () => {
    mockBlobFetch();
    stubClickForAnchor();
    render(<ExportButtons resume={resume} starResult={starResult} />);
    fireEvent.click(screen.getByRole('button', { name: /^DOCX$|导出 DOCX/i }));
    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'export',
        data: { format: 'docx' },
      });
    });
  });
});
