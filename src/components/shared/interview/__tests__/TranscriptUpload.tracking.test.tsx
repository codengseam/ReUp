// src/components/shared/interview/__tests__/TranscriptUpload.tracking.test.tsx
// Verifies transcript_upload event on submit.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockSafeTrack = vi.fn();
vi.mock('@/shared/utils/analytics-helpers', () => ({
  safeTrack: (event: unknown) => mockSafeTrack(event),
}));

import TranscriptUpload from '../TranscriptUpload';

function mockUploadSuccess() {
  const transcript = {
    id: 't-1',
    company: '字节',
    position: '前端',
    round: '一面',
    text: '面经内容',
    questions: [{ id: 'q1', text: '问题1' }],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ transcript }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TranscriptUpload tracking', () => {
  it('emits transcript_upload with source=text on submit', async () => {
    mockUploadSuccess();
    const onReady = vi.fn();
    render(<TranscriptUpload onTranscriptReady={onReady} />);

    const ta = screen.getByPlaceholderText(/请粘贴或口述/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '我的面经内容' } });

    mockSafeTrack.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /提交解析/ }));
    });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith({
        type: 'transcript_upload',
        data: { source: 'text' },
      });
    });
  });

  it('emits error event on upload failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('upload failed'));
    vi.stubGlobal('fetch', fetchMock);
    render(<TranscriptUpload onTranscriptReady={vi.fn()} />);

    const ta = screen.getByPlaceholderText(/请粘贴或口述/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '内容' } });

    mockSafeTrack.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /提交解析/ }));
    });

    await waitFor(() => {
      expect(mockSafeTrack).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      );
    });
  });
});
