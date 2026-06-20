// Voice input helpers: Web Speech API detection + transcript assembly.
// Extracted from page.tsx so the speech-result logic can be unit-tested.

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

export interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string; message: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechRecognitionCtorLike {
  new (): SpeechRecognitionLike;
}

export function createRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtorLike;
    webkitSpeechRecognition?: SpeechRecognitionCtorLike;
  };
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = false;
  return recognition;
}

/**
 * Build display and final transcript from a SpeechRecognition result list.
 * The Web Speech API fires `onresult` multiple times while listening:
 * interim results stream in, then the same result flips to `isFinal`.
 * This helper returns the current final text plus any interim text, avoiding
 * duplication by deriving both from the latest result list state.
 */
export function buildSpeechTranscript(
  results: SpeechRecognitionResultListLike,
): { final: string; interim: string } {
  let final = '';
  let interim = '';
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const transcript = result[0]?.transcript ?? '';
    if (result.isFinal) final += transcript;
    else interim += transcript;
  }
  return { final: final.trim(), interim: interim.trim() };
}

export function joinInputParts(...parts: string[]): string {
  return parts.map(p => p.trim()).filter(Boolean).join(' ');
}
