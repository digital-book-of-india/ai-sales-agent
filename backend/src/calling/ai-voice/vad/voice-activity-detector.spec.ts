import { VoiceActivityDetector } from './voice-activity-detector';

const SAMPLE_RATE = 8000; // typical telephony rate

function silenceFrame(samples: number): Buffer {
  return Buffer.alloc(samples * 2); // all-zero PCM16
}

function toneFrame(samples: number, amplitude: number): Buffer {
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    // Alternate +amplitude/-amplitude — cheap "always loud" signal, RMS ≈ amplitude.
    const value = i % 2 === 0 ? amplitude : -amplitude;
    buf.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  return buf;
}

function samplesPerFrame(frameMs = 20): number {
  return Math.round((SAMPLE_RATE * frameMs) / 1000);
}

describe('VoiceActivityDetector', () => {
  it('reports speech_start only after the onset debounce is satisfied', () => {
    const vad = new VoiceActivityDetector({
      sampleRateHz: SAMPLE_RATE,
      onsetFrames: 3,
      energyThreshold: 0.1,
    });

    const loudFrame = toneFrame(samplesPerFrame(), 0.5);

    expect(vad.process(loudFrame)).toBeNull();
    expect(vad.process(loudFrame)).toBeNull();
    expect(vad.process(loudFrame)).toBe('speech_start');
    expect(vad.isSpeaking()).toBe(true);
  });

  it('stays silent on low-level noise below the threshold', () => {
    const vad = new VoiceActivityDetector({
      sampleRateHz: SAMPLE_RATE,
      energyThreshold: 0.1,
    });

    const quietFrame = toneFrame(samplesPerFrame(), 0.01);
    for (let i = 0; i < 10; i++) {
      expect(vad.process(quietFrame)).toBeNull();
    }
    expect(vad.isSpeaking()).toBe(false);
  });

  it('reports speech_end only after the silence debounce is satisfied', () => {
    const vad = new VoiceActivityDetector({
      sampleRateHz: SAMPLE_RATE,
      onsetFrames: 1,
      silenceFrames: 2,
      energyThreshold: 0.1,
    });

    const loud = toneFrame(samplesPerFrame(), 0.5);
    const quiet = silenceFrame(samplesPerFrame());

    expect(vad.process(loud)).toBe('speech_start');
    expect(vad.process(quiet)).toBeNull(); // 1st below-threshold frame
    expect(vad.process(quiet)).toBe('speech_end'); // 2nd — debounce satisfied
    expect(vad.isSpeaking()).toBe(false);
  });

  it('handles chunks that do not align to a whole frame by carrying the remainder', () => {
    const vad = new VoiceActivityDetector({
      sampleRateHz: SAMPLE_RATE,
      onsetFrames: 1,
      energyThreshold: 0.1,
    });

    const loud = toneFrame(samplesPerFrame(), 0.5);
    const half = loud.subarray(0, Math.floor(loud.length / 2));
    const otherHalf = loud.subarray(Math.floor(loud.length / 2));

    // Neither half alone completes a frame's worth of bytes on its own,
    // but together they do — the second call should complete the frame.
    expect(vad.process(half)).toBeNull();
    expect(vad.process(otherHalf)).toBe('speech_start');
  });

  it('reset() clears streaks and the speaking flag', () => {
    const vad = new VoiceActivityDetector({
      sampleRateHz: SAMPLE_RATE,
      onsetFrames: 1,
      energyThreshold: 0.1,
    });

    vad.process(toneFrame(samplesPerFrame(), 0.5));
    expect(vad.isSpeaking()).toBe(true);

    vad.reset();
    expect(vad.isSpeaking()).toBe(false);
  });
});
