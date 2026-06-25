// src/features/interview/transcript/__tests__/audio-split.test.ts
// Audio chunk splitting utility tests.

import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { splitAudio } from '../audio-split';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal WAV ArrayBuffer with the given sampleRate and channelData.
 */
function buildWavBlob(sampleRate: number, channelData: Float32Array): Blob {
  const length = channelData.length;
  const wavBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wavBuffer);
  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + length * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(44 + i * 2, int16, true);
  }
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Install a mock AudioContext on globalThis.
 * Must use a regular function (not arrow) so it can be used with `new`.
 */
function installMockAudioContext(channelData: Float32Array, sampleRate: number): void {
  const duration = channelData.length / sampleRate;

  const mockBuffer = {
    sampleRate,
    length: channelData.length,
    duration,
    numberOfChannels: 1,
    getChannelData: () => channelData,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).AudioContext = vi.fn(function () {
    return {
      sampleRate,
      decodeAudioData: async () => mockBuffer as unknown as AudioBuffer,
      createBuffer: (_channels: number, frameCount: number) => ({
        sampleRate,
        length: frameCount,
        duration: frameCount / sampleRate,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(frameCount),
        copyFromChannel: () => {},
        copyToChannel: () => {},
      }),
      close: async () => {},
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('splitAudio', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).AudioContext;
  });

  it('module exports splitAudio function', () => {
    expect(typeof splitAudio).toBe('function');
  });

  it('splits 1-second audio into 2 chunks of 0.5s each', async () => {
    const sampleRate = 44100;
    const length = sampleRate; // 1 second
    const channelData = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
    }

    installMockAudioContext(channelData, sampleRate);
    const audioBlob = buildWavBlob(sampleRate, channelData);

    const chunks = await splitAudio(audioBlob, 0.5);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].endTime).toBeCloseTo(0.5, 1);
    expect(chunks[1].index).toBe(1);
    expect(chunks[1].startTime).toBeCloseTo(0.5, 1);
    expect(chunks[1].endTime).toBeCloseTo(1, 0);

    for (const chunk of chunks) {
      expect(chunk.blob).toBeInstanceOf(Blob);
      expect(chunk.blob.type).toBe('audio/wav');
      expect(chunk.blob.size).toBeGreaterThan(44);
    }
  });

  it('handles audio shorter than maxChunkSeconds', async () => {
    const sampleRate = 44100;
    const length = sampleRate; // 1 second
    const channelData = new Float32Array(length);

    installMockAudioContext(channelData, sampleRate);
    const audioBlob = buildWavBlob(sampleRate, channelData);

    const chunks = await splitAudio(audioBlob, 30);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].endTime).toBeCloseTo(1, 0);
  });

  it('uses default maxChunkSeconds of 30', async () => {
    const sampleRate = 44100;
    const length = sampleRate * 2; // 2 seconds
    const channelData = new Float32Array(length);

    installMockAudioContext(channelData, sampleRate);
    const audioBlob = buildWavBlob(sampleRate, channelData);

    const chunks = await splitAudio(audioBlob);

    // 2 seconds with default maxChunkSeconds of 30 → 1 chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].endTime).toBeCloseTo(2, 0);
  });
});