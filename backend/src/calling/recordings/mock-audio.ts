/**
 * Synthesizes a short WAV tone in place of a real recording for
 * storageProvider "mock" — MockTelephonyProvider.getRecording returns a
 * fake, unreachable URL (there's no real audio anywhere for a simulated
 * call), so RecordingsService serves this instead of trying to fetch it.
 * Deterministic and dependency-free: a fading 440Hz tone, 8kHz/8-bit mono
 * to keep the buffer tiny.
 */

const SAMPLE_RATE = 8000;
const FREQUENCY_HZ = 440;
const MIN_SECONDS = 1;
const MAX_SECONDS = 10;

export function generateMockAudioWav(durationSeconds?: number | null): Buffer {
  const seconds = Math.max(
    MIN_SECONDS,
    Math.min(MAX_SECONDS, durationSeconds ?? MIN_SECONDS),
  );
  const numSamples = Math.round(SAMPLE_RATE * seconds);
  const dataSize = numSamples; // 8-bit mono => 1 byte/sample

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE, 28); // byte rate (1 byte/sample)
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = 1 - i / numSamples; // fade out, avoids an end-of-clip click
    const sample =
      128 +
      Math.round(60 * envelope * Math.sin(2 * Math.PI * FREQUENCY_HZ * t));
    data[i] = Math.max(0, Math.min(255, sample));
  }

  return Buffer.concat([header, data]);
}

export const MOCK_AUDIO_CONTENT_TYPE = 'audio/wav';
