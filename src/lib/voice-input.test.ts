import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRecognition,
  buildSpeechTranscript,
  joinInputParts,
  type SpeechRecognitionResultListLike,
} from './voice-input';

function makeResult(transcript: string, isFinal: boolean): SpeechRecognitionResultListLike[number] {
  return {
    length: 1,
    isFinal,
    item: () => ({ transcript }),
    0: { transcript },
  };
}

function makeResults(items: Array<{ transcript: string; isFinal: boolean }>): SpeechRecognitionResultListLike {
  const results = items.map(i => makeResult(i.transcript, i.isFinal));
  return {
    length: results.length,
    item: (index: number) => results[index]!,
    ...Object.fromEntries(results.map((r, i) => [i, r])),
  } as unknown as SpeechRecognitionResultListLike;
}

describe('voice-input helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createRecognition', () => {
    it('returns null when SpeechRecognition is unavailable', () => {
      expect(createRecognition()).toBeNull();
    });

    it('falls back to webkitSpeechRecognition', () => {
      const mockRecognition = {
        lang: '',
        interimResults: false,
        continuous: false,
        onresult: null,
        onend: null,
        onerror: null,
        start: vi.fn(),
        stop: vi.fn(),
        abort: vi.fn(),
      };
      (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = vi.fn(function () {
        return mockRecognition;
      });

      const recognition = createRecognition();
      expect(recognition).toBe(mockRecognition);
      expect(recognition?.lang).toBe('zh-CN');
      expect(recognition?.interimResults).toBe(true);
      expect(recognition?.continuous).toBe(false);
    });
  });

  describe('buildSpeechTranscript', () => {
    it('separates final and interim results', () => {
      const results = makeResults([
        { transcript: '你好', isFinal: true },
        { transcript: '世界', isFinal: false },
      ]);
      expect(buildSpeechTranscript(results)).toEqual({ final: '你好', interim: '世界' });
    });

    it('does not duplicate when the same result transitions from interim to final', () => {
      // First callback: one interim result
      const interim = makeResults([{ transcript: 'hello', isFinal: false }]);
      expect(buildSpeechTranscript(interim)).toEqual({ final: '', interim: 'hello' });

      // Second callback: same index now final
      const final = makeResults([{ transcript: 'hello', isFinal: true }]);
      expect(buildSpeechTranscript(final)).toEqual({ final: 'hello', interim: '' });
    });

    it('accumulates final results across multiple indices', () => {
      const results = makeResults([
        { transcript: '第一句', isFinal: true },
        { transcript: '第二句', isFinal: true },
      ]);
      expect(buildSpeechTranscript(results)).toEqual({ final: '第一句第二句', interim: '' });
    });

    it('ignores empty transcripts', () => {
      const results = makeResults([{ transcript: '', isFinal: true }]);
      expect(buildSpeechTranscript(results)).toEqual({ final: '', interim: '' });
    });
  });

  describe('joinInputParts', () => {
    it('joins non-empty parts with a single space', () => {
      expect(joinInputParts('  hello  ', '', 'world  ')).toBe('hello world');
    });

    it('returns empty string when all parts are empty', () => {
      expect(joinInputParts('', '  ', '')).toBe('');
    });
  });
});
