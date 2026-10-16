/**
 * Local energy-based voice activity detector, used purely to decide "has the
 * customer started/stopped talking" fast enough to drive barge-in. This is
 * deliberately independent of the STT provider: STT round-trips (network +
 * partial-result latency) are too slow to gate "stop the AI's mouth right
 * now" — VAD runs synchronously on every inbound audio frame in-process, so
 * a speech onset while the AI is talking can cancel TTS within one frame
 * (~20ms) instead of waiting on a transcript. STT still runs in parallel on
 * the same audio for what to actually say back.
 *
 * Pure and framework-free by design — no Nest DI, no I/O — so it's cheap to
 * unit test with synthetic PCM buffers.
 */

export interface VadOptions {
  sampleRateHz: number;
  /** Analysis frame size in ms. Inbound chunks are split into frames of this
   * size for scoring; a chunk that isn't an exact multiple carries its
   * remainder into the next chunk. Default 20ms, standard for telephony VAD. */
  frameMs?: number;
  /** RMS energy threshold, normalized to [0, 1] against int16 full scale.
   * Telephone audio noise floor is typically well under 0.02; default 0.03
   * is a conservative "clearly someone is talking" threshold. */
  energyThreshold?: number;
  /** Consecutive above-threshold frames required before declaring
   * speech_start — debounces transient noise/clicks. Default 2 (~40ms). */
  onsetFrames?: number;
  /** Consecutive below-threshold frames required before declaring
   * speech_end — debounces brief pauses mid-sentence. Default 25 (~500ms). */
  silenceFrames?: number;
}

export type VadEvent = 'speech_start' | 'speech_end' | null;

const PCM16_FULL_SCALE = 32768;

export class VoiceActivityDetector {
  private readonly frameBytes: number;
  private readonly energyThreshold: number;
  private readonly onsetFrames: number;
  private readonly silenceFrames: number;

  private residual = Buffer.alloc(0);
  private speaking = false;
  private aboveStreak = 0;
  private belowStreak = 0;

  constructor(options: VadOptions) {
    const frameMs = options.frameMs ?? 20;
    // 2 bytes/sample (PCM16), mono.
    this.frameBytes = Math.round((options.sampleRateHz * frameMs) / 1000) * 2;
    this.energyThreshold = options.energyThreshold ?? 0.03;
    this.onsetFrames = options.onsetFrames ?? 2;
    this.silenceFrames = options.silenceFrames ?? 25;
  }

  /** Feed one chunk of raw PCM16LE mono audio. Returns the most recent
   * onset/offset transition produced while processing this chunk, if any
   * (a chunk spanning multiple frames only ever reports the latest one —
   * callers care about the current state, not per-frame history). */
  process(chunk: Buffer): VadEvent {
    const buffer = Buffer.concat([this.residual, chunk]);
    const frameCount = Math.floor(buffer.length / this.frameBytes);
    this.residual = buffer.subarray(frameCount * this.frameBytes);

    let lastEvent: VadEvent = null;
    for (let i = 0; i < frameCount; i++) {
      const frame = buffer.subarray(
        i * this.frameBytes,
        (i + 1) * this.frameBytes,
      );
      const event = this.scoreFrame(frame);
      if (event) lastEvent = event;
    }
    return lastEvent;
  }

  private scoreFrame(frame: Buffer): VadEvent {
    const rms = rmsOf(frame);
    const aboveThreshold = rms >= this.energyThreshold;

    if (aboveThreshold) {
      this.aboveStreak++;
      this.belowStreak = 0;
    } else {
      this.belowStreak++;
      this.aboveStreak = 0;
    }

    if (!this.speaking && this.aboveStreak >= this.onsetFrames) {
      this.speaking = true;
      return 'speech_start';
    }
    if (this.speaking && this.belowStreak >= this.silenceFrames) {
      this.speaking = false;
      return 'speech_end';
    }
    return null;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /** Clears all state (streaks, buffered partial frame, speaking flag) —
   * call between calls/sessions when reusing a detector instance. */
  reset(): void {
    this.residual = Buffer.alloc(0);
    this.speaking = false;
    this.aboveStreak = 0;
    this.belowStreak = 0;
  }
}

function rmsOf(frame: Buffer): number {
  const sampleCount = frame.length / 2;
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < frame.length; i += 2) {
    const sample = frame.readInt16LE(i) / PCM16_FULL_SCALE;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}
