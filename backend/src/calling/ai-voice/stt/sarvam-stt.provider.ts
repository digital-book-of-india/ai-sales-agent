import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket, { type RawData } from 'ws';
import type {
  SpeechToTextProvider,
  SttStream,
  SttStreamHandlers,
  StartSttStreamOptions,
} from './stt-provider.interface';
import { rawDataToString } from '../ws-raw-data';
import { VoiceActivityDetector } from '../vad/voice-activity-detector';

// All Sarvam-specific request/response shapes and auth live in this file
// only — nothing outside stt/ should know what a Sarvam STT frame looks
// like (same rule ../../telephony/asterisk.provider.ts follows for AMI).
//
// Wire format below is verified live against the real endpoint (2026-09):
// connect to wss://api.sarvam.ai/speech-to-text/ws?language-code=<code>&model=<model>
// with header `api-subscription-key: <key>`, send raw audio as
// `{"audio": {"data": "<base64 PCM16LE>", "sample_rate": 16000, "encoding":
// "audio/wav"}}` messages, and receive `{"type": "data", "data": {"transcript":
// "..."}}` — or, on a bad request, `{"type": "error", "data": {"message":
// "..."}}`. Two live-confirmed surprises: `encoding` only accepts the literal
// value `"audio/wav"` (`"pcm_s16le"` gets a hard validation error) AND
// genuinely means an actual WAV file, not just a label — see wavStreamHeader()
// below. And real "data" responses never carry `is_final` at all; treat its
// absence as final; see isFinal comment below for why. Re-verify field names
// against current Sarvam docs before relying on this long-term — everything
// provider-specific is isolated to buildUrl()/sendAudio()/parseMessage()
// below, so a schema change doesn't ripple beyond this file.
//
// Sarvam's streaming STT hard-requires 16 kHz PCM16 input ("'audio.sample_rate'
// must be 16000" — confirmed live) while the telephony bridge streams call
// audio at 8 kHz (AI_VOICE_SAMPLE_RATE_HZ). resamplePcm16() below upsamples
// every chunk before it goes out, so callers elsewhere never need to know
// Sarvam's rate requirement.
//
// This endpoint does NOT auto-finalize on trailing silence the way the
// interface's isFinal doc implies a provider normally would — confirmed
// live: minutes of real speech followed by silence, with no explicit
// `{"type":"flush"}`, produces zero transcript events, ever. It also
// doesn't want a fresh WAV header per chunk (each one alone is too short to
// transcribe) — instead, ONE WAV header goes out on the very first chunk of
// the connection's lifetime (with sentinel 0xFFFFFFFF RIFF/data lengths,
// since the true total isn't known upfront), every later chunk is raw PCM
// continuing that same logical file, and `flush` triggers transcription of
// everything since the last flush — repeatable any number of times on one
// socket (confirmed live across two flush cycles). So StreamingSttStream
// runs its own VoiceActivityDetector over the outgoing (resampled) audio
// and sends `flush` on every speech_end, keeping "provider decides when an
// utterance is settled" true from the interface's point of view even
// though Sarvam itself needs to be told.

const SARVAM_STT_SAMPLE_RATE_HZ = 16000;

/** Linear-interpolation PCM16LE resampler — good enough for STT input (which
 * tolerates far more artifacts than a human ear would) without pulling in a
 * DSP dependency for what's normally just an 8kHz->16kHz upsample. */
function resamplePcm16(input: Buffer, fromRateHz: number, toRateHz: number): Buffer {
  if (fromRateHz === toRateHz || input.length < 2) return input;

  const inSamples = Math.floor(input.length / 2);
  const outSamples = Math.round((inSamples * toRateHz) / fromRateHz);
  const output = Buffer.alloc(outSamples * 2);
  const step = (inSamples - 1) / Math.max(outSamples - 1, 1);

  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * step;
    const lowIndex = Math.floor(srcPos);
    const highIndex = Math.min(lowIndex + 1, inSamples - 1);
    const frac = srcPos - lowIndex;
    const low = input.readInt16LE(lowIndex * 2);
    const high = input.readInt16LE(highIndex * 2);
    output.writeInt16LE(Math.round(low + (high - low) * frac), i * 2);
  }

  return output;
}

/** Builds the one-time 44-byte RIFF/WAVE header that opens the connection's
 * logical audio stream. Uses the standard streaming-WAV sentinel
 * (0xFFFFFFFF) for both length fields since the true total isn't known
 * upfront — confirmed live that Sarvam accepts this and keeps decoding
 * chunks appended after it for the life of the socket. */
function wavStreamHeader(sampleRateHz: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(0xffffffff, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(sampleRateHz * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(0xffffffff, 40);
  return header;
}

interface SarvamSttMessage {
  type?: string;
  data?: {
    transcript?: string;
    language_code?: string;
    is_final?: boolean;
    confidence?: number;
    message?: string;
  };
  // Some deployments flatten the payload instead of nesting under `data`.
  transcript?: string;
  language_code?: string;
  is_final?: boolean;
  confidence?: number;
  error?: string;
}

class SarvamSttStream implements SttStream {
  private readonly socket: WebSocket;
  private closed = false;
  private headerSent = false;
  // Sarvam never auto-finalizes on silence (see file header comment) — this
  // local VAD is what actually decides "the customer stopped talking" and
  // triggers the flush that gets a transcript out of Sarvam at all.
  private readonly vad = new VoiceActivityDetector({
    sampleRateHz: SARVAM_STT_SAMPLE_RATE_HZ,
  });

  constructor(
    url: string,
    apiKey: string,
    private readonly sampleRateHz: number,
    private readonly handlers: SttStreamHandlers,
    private readonly logger: Logger,
  ) {
    this.socket = new WebSocket(url, {
      headers: { 'api-subscription-key': apiKey },
    });

    this.socket.on('message', (raw) => this.handleMessage(raw));
    this.socket.on('error', (error) => handlers.onError(error));
    this.socket.on('close', () => {
      if (!this.closed) handlers.onClose();
    });
  }

  private handleMessage(raw: RawData): void {
    let parsed: SarvamSttMessage;
    try {
      parsed = JSON.parse(rawDataToString(raw)) as SarvamSttMessage;
    } catch {
      this.logger.warn('Received non-JSON message from Sarvam STT, ignoring');
      return;
    }

    if (parsed.type === 'error' || parsed.error) {
      const message = parsed.data?.message ?? parsed.error ?? 'unknown error';
      this.handlers.onError(new Error(`Sarvam STT error: ${message}`));
      return;
    }

    const transcript = parsed.data?.transcript ?? parsed.transcript;
    if (transcript === undefined) return; // control/keepalive frame, nothing to surface

    this.handlers.onTranscript({
      text: transcript,
      // Confirmed live: a real "data" response never actually carries
      // `is_final` at all — every event is inherently the completed result
      // of the flush that produced it (this endpoint has no separate
      // interim/partial event), so an absent field means final, not "not
      // final yet". Defaulting to false here silently drops every real
      // transcript before it ever reaches the LLM reasoner.
      isFinal: parsed.data?.is_final ?? parsed.is_final ?? true,
      languageCode: parsed.data?.language_code ?? parsed.language_code,
      confidence: parsed.data?.confidence ?? parsed.confidence,
    });
  }

  sendAudio(chunk: Buffer): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    const resampled = resamplePcm16(
      chunk,
      this.sampleRateHz,
      SARVAM_STT_SAMPLE_RATE_HZ,
    );

    const payload = this.headerSent
      ? resampled
      : Buffer.concat([wavStreamHeader(SARVAM_STT_SAMPLE_RATE_HZ), resampled]);
    this.headerSent = true;

    this.socket.send(
      JSON.stringify({
        audio: {
          data: payload.toString('base64'),
          sample_rate: SARVAM_STT_SAMPLE_RATE_HZ,
          // 'audio/wav' is the ONLY value this endpoint's `audio.encoding`
          // accepts — confirmed live, `pcm_s16le` gets a hard pydantic
          // validation error ("Input should be 'audio/wav'"). It genuinely
          // means a WAV file too: raw PCM tagged 'audio/wav' with no header
          // anywhere in the stream is accepted (no error) but silently
          // produces zero transcripts.
          encoding: 'audio/wav',
        },
      }),
    );

    if (this.vad.process(resampled) === 'speech_end') {
      this.socket.send(JSON.stringify({ type: 'flush' }));
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close();
    }
  }
}

@Injectable()
export class SarvamSttProvider implements SpeechToTextProvider {
  readonly name = 'sarvam';
  private readonly logger = new Logger(SarvamSttProvider.name);

  constructor(private readonly config: ConfigService) {}

  startStream(
    options: StartSttStreamOptions,
    handlers: SttStreamHandlers,
  ): SttStream {
    const apiKey = this.config.getOrThrow<string>('SARVAM_API_KEY');
    const baseUrl =
      this.config.get<string>('SARVAM_STT_WS_URL') ??
      'wss://api.sarvam.ai/speech-to-text/ws';
    const model = this.config.get<string>('SARVAM_STT_MODEL') ?? 'saaras:v3';
    const languageCode = options.languageHint ?? 'unknown';

    const url = `${baseUrl}?language-code=${encodeURIComponent(languageCode)}&model=${encodeURIComponent(model)}`;

    return new SarvamSttStream(
      url,
      apiKey,
      options.sampleRateHz,
      handlers,
      this.logger,
    );
  }
}
