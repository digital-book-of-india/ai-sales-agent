/**
 * Provider-agnostic streaming text-to-speech contract — mirrors
 * ../stt/stt-provider.interface.ts and ../../telephony/telephony-provider.interface.ts.
 * Swapping TTS vendors means implementing this interface and registering it
 * in calling.module.ts — nothing in VoiceSessionService changes.
 */

export interface TtsAudioChunk {
  /** Synthesized audio ready to stream into the call, in the codec/sample
   * rate the provider was configured with (see TextToSpeechProvider.name /
   * provider-specific config — kept out of this interface deliberately, the
   * same way TelephonyProvider doesn't leak per-provider request shapes). */
  audio: Buffer;
}

export interface TtsStreamHandlers {
  onAudioChunk(chunk: TtsAudioChunk): void;
  /** Fires once all audio for this synthesize() call has been delivered. */
  onComplete(): void;
  onError(error: Error): void;
}

export interface TtsStream {
  /** Stops generation/delivery immediately — the barge-in path. Safe to call
   * after completion (no-op). Must not fire any further onAudioChunk calls
   * once cancel() returns. */
  cancel(): void;
}

export interface SynthesizeOptions {
  languageCode: string;
  voice?: string;
}

export interface TextToSpeechProvider {
  /** Name this provider registers under (for logging/diagnostics). */
  readonly name: string;

  /** Streams synthesized speech for `text`. Returns as soon as generation
   * starts — audio arrives incrementally via handlers, not as one blob.
   * Callers may synthesize the next sentence while a previous TtsStream is
   * still delivering audio (sentence-at-a-time streaming, see
   * VoiceSessionService) — each call gets its own independent stream. */
  synthesize(
    text: string,
    options: SynthesizeOptions,
    handlers: TtsStreamHandlers,
  ): TtsStream;
}
