import { generateMockAudioWav } from './mock-audio';

describe('generateMockAudioWav', () => {
  it('produces a valid RIFF/WAVE header', () => {
    const wav = generateMockAudioWav(3);

    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.subarray(12, 16).toString('ascii')).toBe('fmt ');
    expect(wav.subarray(36, 40).toString('ascii')).toBe('data');
  });

  it('scales the buffer length with the requested duration', () => {
    const short = generateMockAudioWav(1);
    const long = generateMockAudioWav(5);

    expect(long.length).toBeGreaterThan(short.length);
  });

  it('clamps to a sane minimum/maximum so a bogus duration cannot blow up the buffer', () => {
    const zero = generateMockAudioWav(0);
    const nullish = generateMockAudioWav(null);
    const huge = generateMockAudioWav(10_000);
    const cappedAtTen = generateMockAudioWav(10);

    expect(zero.length).toBe(nullish.length);
    expect(huge.length).toBe(cappedAtTen.length);
  });
});
