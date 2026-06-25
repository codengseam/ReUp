// src/features/interview/transcript/audio-split.ts
// Client-side audio chunking utility for long audio (>30s).

export interface AudioChunk {
  blob: Blob;
  index: number;
  startTime: number;
  endTime: number;
}

/**
 * Split an audio Blob into chunks of specified maximum duration.
 * Uses Web Audio API to decode and slice the audio buffer.
 * This is a client-side utility — works only in browser environments.
 *
 * @param audioBlob - The audio blob to split (e.g. from MediaRecorder or file input)
 * @param maxChunkSeconds - Maximum duration per chunk in seconds (default 30)
 * @returns Array of AudioChunk, each containing a sliced blob with time metadata
 */
export async function splitAudio(
  audioBlob: Blob,
  maxChunkSeconds: number = 30
): Promise<AudioChunk[]> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const totalDuration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;

  const chunks: AudioChunk[] = [];
  let chunkIndex = 0;
  let startTime = 0;

  while (startTime < totalDuration) {
    const endTime = Math.min(startTime + maxChunkSeconds, totalDuration);
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const frameCount = endSample - startSample;

    const chunkBuffer = audioContext.createBuffer(channels, frameCount, sampleRate);
    for (let channel = 0; channel < channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel).slice(startSample, endSample);
      chunkBuffer.copyToChannel(channelData, channel, 0);
    }

    const wavBlob = bufferToWavBlob(chunkBuffer);
    chunks.push({
      blob: wavBlob,
      index: chunkIndex,
      startTime,
      endTime,
    });

    chunkIndex++;
    startTime = endTime;
  }

  await audioContext.close();
  return chunks;
}

/**
 * Encode an AudioBuffer to a WAV Blob.
 */
function bufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numberOfChannels * (bitsPerSample / 8);
  const blockAlign = numberOfChannels * (bitsPerSample / 8);
  const dataSize = length * numberOfChannels * (bitsPerSample / 8);
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Cache channel data arrays to avoid repeated getChannelData calls
  const channelDataArrays: Float32Array[] = [];
  for (let channel = 0; channel < numberOfChannels; channel++) {
    channelDataArrays.push(audioBuffer.getChannelData(channel));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = channelDataArrays[channel]![i];
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}