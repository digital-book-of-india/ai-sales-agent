import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket, { type RawData } from 'ws';
import type {
  TextToSpeechProvider,
  TtsStream,
  TtsStreamHandlers,
  SynthesizeOptions,
} from './tts-provider.interface';
import { rawDataToString } from '../ws-raw-data';

// All Sarvam-specific request/response shapes and auth live in this file
// only — same isolation rule as ../stt/sarvam-stt.provider.ts and
// ../../telephony/asterisk.provider.ts.
//
// Wire format below is verified live against the real endpoint (2026-09):
// connect to wss://api.sarvam.ai/text-to-speech/ws?model=<model>&send_completion_event=true
// with header `api-subscription-key: <key>`, send a config frame
// `{"type": "config", "data": {"target_language_code", "speaker",
// "output_audio_codec": "linear16", "speech_sample_rate" (a string, e.g.
// "8000")}}`, then a text frame
// `{"type": "text", "data": {"text": "..."}}`, then `{"type": "flush"}` to
// request synthesis of everything sent so far. Audio streams back as
// `{"type": "audio", "data": {"audio": "<base64 PCM16LE>"}}` frames.
// `send_completion_event=true` is a connection *query param*, not a config
// frame field (confirmed live: putting it in the config data does nothing —
// audio just stops with the socket left open, no completion signal at all).
// With it on the URL, completion arrives as `{"type": "event", "data":
// {"event_type": "final"}}`, NOT a bare `{"type": "final"}`. Errors (e.g. an
// invalid speaker) arrive as `{"type": "error", "data": {"message": "..."}}`.
// Re-verify field names against current Sarvam docs before relying on this
// long-term — everything provider-specific is isolated to the private
// methods below.

interface SarvamTtsMessage {
  type?: string;
  data?: { audio?: string; message?: string; event_type?: string };
  error?: string;
}

/** One synthesize() call = one websocket connection = one utterance. Simpler
 * and safer cancel semantics than multiplexing sentences over a shared
 * socket: cancel() just tears the connection down, guaranteed to stop any
 * further audio for that sentence — no per-utterance bookkeeping needed. */
class SarvamTtsStream implements TtsStream {
  private readonly socket: WebSocket;
  private cancelled = false;
  private completed = false;

  constructor(
    url: string,
    apiKey: string,
    text: string,
    options: Required<Pick<SynthesizeOptions, 'languageCode'>> & {
      voice?: string;
    },
    sampleRateHz: number,
    private readonly handlers: TtsStreamHandlers,
    private readonly logger: Logger,
  ) {
    this.socket = new WebSocket(url, {
      headers: { 'api-subscription-key': apiKey },
    });

    this.socket.on('open', () => {
      this.socket.send(
        JSON.stringify({
          type: 'config',
          data: {
            target_language_code: options.languageCode,
            speaker: options.voice,
            output_audio_codec: 'linear16',
            // The field is `speech_sample_rate` (a string), NOT `sample_rate`
            // — confirmed live: sending `sample_rate` is silently ignored,
            // Sarvam falls back to its native 24kHz default while callers
            // keep believing they got back audio at sampleRateHz, corrupting
            // playback (audio comes out ~3x slower/deeper than real speech,
            // e.g. on an 8kHz telephony call).
            speech_sample_rate: String(sampleRateHz),
          },
        }),
      );
      this.socket.send(JSON.stringify({ type: 'text', data: { text } }));
      this.socket.send(JSON.stringify({ type: 'flush' }));
    });

    this.socket.on('message', (raw) => this.handleMessage(raw));
    this.socket.on('error', (error) => {
      if (!this.cancelled) handlers.onError(error);
    });
  }

  private handleMessage(raw: RawData): void {
    if (this.cancelled) return;

    let parsed: SarvamTtsMessage;
    try {
      parsed = JSON.parse(rawDataToString(raw)) as SarvamTtsMessage;
    } catch {
      this.logger.warn('Received non-JSON message from Sarvam TTS, ignoring');
      return;
    }

    if (parsed.type === 'error' || parsed.error) {
      const message = parsed.data?.message ?? parsed.error ?? 'unknown error';
      this.handlers.onError(new Error(`Sarvam TTS error: ${message}`));
      return;
    }

    if (parsed.type === 'audio' && parsed.data?.audio) {
      this.handlers.onAudioChunk({
        audio: Buffer.from(parsed.data.audio, 'base64'),
      });
      return;
    }

    if (parsed.type === 'event' && parsed.data?.event_type === 'final') {
      this.completed = true;
      this.handlers.onComplete();
      this.teardown();
    }
  }

  cancel(): void {
    if (this.cancelled || this.completed) return;
    this.cancelled = true;
    this.teardown();
  }

  private teardown(): void {
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close();
    }
  }
}

@Injectable()
export class SarvamTtsProvider implements TextToSpeechProvider {
  readonly name = 'sarvam';
  private readonly logger = new Logger(SarvamTtsProvider.name);

  constructor(private readonly config: ConfigService) {}

  synthesize(
    text: string,
    options: SynthesizeOptions,
    handlers: TtsStreamHandlers,
  ): TtsStream {
    const apiKey = this.config.getOrThrow<string>('SARVAM_API_KEY');
    const baseUrl =
      this.config.get<string>('SARVAM_TTS_WS_URL') ??
      'wss://api.sarvam.ai/text-to-speech/ws';
    const model = this.config.get<string>('SARVAM_TTS_MODEL') ?? 'bulbul:v3';
    const sampleRateHz = Number(
      this.config.get<string>('SARVAM_TTS_SAMPLE_RATE') ?? '8000',
    );
    const voice = options.voice ?? this.config.get<string>('SARVAM_TTS_VOICE');

    const url = `${baseUrl}?model=${encodeURIComponent(model)}&send_completion_event=true`;

    return new SarvamTtsStream(
      url,
      apiKey,
      text,
      { languageCode: options.languageCode, voice },
      sampleRateHz,
      handlers,
      this.logger,
    );
  }
}
