/**
 * Provider-agnostic streaming speech-to-text contract — the voice pipeline
 * depends only on this interface (injected via the STT_PROVIDER token, see
 * stt-provider.token.ts), never on a concrete provider class. Mirrors the
 * shape of ../../telephony/telephony-provider.interface.ts: swapping STT
 * vendors means implementing this interface and registering it in
 * calling.module.ts — nothing in VoiceSessionService changes.
 */

export interface SttTranscriptEvent {
  text: string;
  /** False for interim/partial results that may still change; true once the
   * provider considers the utterance settled. Only final transcripts should
   * be handed to the LLM reasoner — interim ones are for UI/monitoring only. */
  isFinal: boolean;
  /** Provider-detected language of this transcript, e.g. "hi-IN", "en-IN".
   * Used to match the customer's language back in the TTS reply. */
  languageCode?: string;
  confidence?: number;
}

export interface SttStreamHandlers {
  onTranscript(event: SttTranscriptEvent): void;
  onError(error: Error): void;
  /** Fires when the provider closes the connection on its own (e.g. idle
   * timeout) — distinct from close(), which we call ourselves. */
  onClose(): void;
}

export interface SttStream {
  /** Pushes one chunk of raw inbound call audio into the stream. Chunk size
   * is whatever the audio source hands us frame-by-frame — providers must
   * not require the caller to buffer a full utterance first. */
  sendAudio(chunk: Buffer): void;
  /** Signals no more audio is coming (call ended) and releases the
   * underlying connection. Safe to call more than once. */
  close(): void;
}

export interface StartSttStreamOptions {
  /** BCP-47-ish language hint, or "unknown" to ask the provider to
   * auto-detect (needed for Hindi/English/Hinglish code-switching). */
  languageHint?: string;
  sampleRateHz: number;
}

export interface SpeechToTextProvider {
  /** Name this provider registers under (for logging/diagnostics). */
  readonly name: string;

  /** Opens one streaming STT session for the lifetime of a call. Every
   * inbound audio frame captured from the customer is pushed through the
   * returned SttStream via sendAudio(); handlers fire asynchronously as
   * transcripts arrive. Returns immediately — the connection is established
   * in the background. */
  startStream(
    options: StartSttStreamOptions,
    handlers: SttStreamHandlers,
  ): SttStream;
}
