import { EventEmitter as mockEventEmitter } from 'events';
import type { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { SarvamSttProvider } from './sarvam-stt.provider';

interface FakeSocketInstance extends mockEventEmitter {
  readonly url: string;
  readonly options: { headers: Record<string, string> };
  readonly sent: string[];
  readonly closeCalled: boolean;
  readyState: number;
}

interface FakeWebSocketStatic {
  OPEN: number;
  CONNECTING: number;
  instances: FakeSocketInstance[];
}

// The factory references `mockEventEmitter` from module scope — Jest's
// out-of-scope-variable check for jest.mock() factories special-cases
// identifiers starting with "mock" for exactly this reason, so this stays a
// real, properly-typed EventEmitter instead of an `any` from
// jest.requireActual. A single typed cast on the import (below) then gives
// every test proper types on `.instances` instead of `any`.
jest.mock('ws', () => {
  class FakeWebSocket extends mockEventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances: FakeWebSocket[] = [];

    readyState = FakeWebSocket.OPEN;
    sent: string[] = [];
    closeCalled = false;
    url: string;
    options: unknown;

    constructor(url: string, options: unknown) {
      super();
      this.url = url;
      this.options = options;
      FakeWebSocket.instances.push(this);
    }

    send(data: string) {
      this.sent.push(data);
    }

    close() {
      this.closeCalled = true;
      this.readyState = 3;
      this.emit('close');
    }
  }

  return { __esModule: true, default: FakeWebSocket, WebSocket: FakeWebSocket };
});

const FakeWebSocket = WebSocket as unknown as FakeWebSocketStatic;

function configStub(values: Record<string, string>) {
  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`missing ${key}`);
      return values[key];
    },
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function latestSocket(): FakeSocketInstance {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error('no socket was opened');
  return socket;
}

describe('SarvamSttProvider', () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
  });

  it('opens a websocket with the language hint and model in the URL', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );

    provider.startStream(
      { languageHint: 'hi-IN', sampleRateHz: 8000 },
      { onTranscript: jest.fn(), onError: jest.fn(), onClose: jest.fn() },
    );

    const socket = latestSocket();
    expect(socket.url).toContain('language-code=hi-IN');
    expect(socket.options.headers['api-subscription-key']).toBe('key-123');
  });

  it('resamples outgoing audio to the 16kHz Sarvam requires, regardless of input rate', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const stream = provider.startStream(
      { sampleRateHz: 8000 },
      { onTranscript: jest.fn(), onError: jest.fn(), onClose: jest.fn() },
    );

    // 4 samples (8 bytes) of 8kHz PCM16 -> 8 samples (16 bytes) at 16kHz.
    const chunk = Buffer.from(
      new Int16Array([100, 200, 300, 400]).buffer as ArrayBuffer,
    );
    stream.sendAudio(chunk);

    const sentPayload = JSON.parse(latestSocket().sent[0]) as {
      audio: { data: string; sample_rate: number; encoding: string };
    };
    const wrapped = Buffer.from(sentPayload.audio.data, 'base64');
    // 'audio/wav' is validated as an actual WAV file server-side — a stream
    // with no header anywhere is accepted but silently yields zero
    // transcripts, so the very first chunk must open with a real RIFF header.
    expect(sentPayload.audio.encoding).toBe('audio/wav');
    expect(wrapped.subarray(0, 4).toString()).toBe('RIFF');
    expect(wrapped.subarray(8, 12).toString()).toBe('WAVE');
    expect(sentPayload.audio.sample_rate).toBe(16000);
    const resampled = wrapped.subarray(44);
    expect(resampled.length).toBe(chunk.length * 2);
    // Endpoints of the resampled stream must match the source exactly.
    expect(resampled.readInt16LE(0)).toBe(100);
    expect(resampled.readInt16LE(resampled.length - 2)).toBe(400);
  });

  it('sends the WAV header only once per stream, not on every chunk', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const stream = provider.startStream(
      { sampleRateHz: 16000 },
      { onTranscript: jest.fn(), onError: jest.fn(), onClose: jest.fn() },
    );

    const chunk = Buffer.from([1, 2, 3, 4]);
    stream.sendAudio(chunk);
    stream.sendAudio(chunk);

    const sent = latestSocket().sent.map(
      (s) =>
        (JSON.parse(s) as { audio: { data: string } }).audio.data,
    );
    const first = Buffer.from(sent[0], 'base64');
    const second = Buffer.from(sent[1], 'base64');
    // First chunk of the connection's lifetime opens with a header — but a
    // per-utterance header (repeated on later chunks) is what actually
    // breaks this live: Sarvam only decodes the very first one it sees on
    // a socket, so a second header mid-stream would silently orphan every
    // chunk that follows it.
    expect(first.subarray(0, 4).toString()).toBe('RIFF');
    expect(second.subarray(0, 4).toString()).not.toBe('RIFF');
    expect(second.equals(chunk)).toBe(true);
  });

  it('flushes when its internal VAD detects the customer stopped talking', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const stream = provider.startStream(
      { sampleRateHz: 16000 },
      { onTranscript: jest.fn(), onError: jest.fn(), onClose: jest.fn() },
    );

    // Sarvam never finalizes on its own silence detection (confirmed live)
    // — an explicit `{"type":"flush"}` is the only thing that produces a
    // transcript, so the provider's own VAD has to drive it. One loud frame
    // (speech onset) followed by enough silent frames to cross the VAD's
    // silence-frame threshold should trigger exactly one flush.
    const loudFrame = Buffer.alloc(640); // 20ms @16kHz
    for (let i = 0; i < loudFrame.length; i += 2) loudFrame.writeInt16LE(20000, i);
    const silentFrame = Buffer.alloc(640);

    stream.sendAudio(loudFrame);
    stream.sendAudio(loudFrame);
    for (let i = 0; i < 30; i++) stream.sendAudio(silentFrame);

    const flushes = latestSocket().sent.filter(
      (s) => (JSON.parse(s) as { type?: string }).type === 'flush',
    );
    expect(flushes).toHaveLength(1);
  });

  it('surfaces final and interim transcripts to handlers', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const onTranscript = jest.fn();
    provider.startStream(
      { sampleRateHz: 8000 },
      { onTranscript, onError: jest.fn(), onClose: jest.fn() },
    );

    latestSocket().emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'data',
          data: {
            transcript: 'hello there',
            is_final: true,
            language_code: 'en-IN',
          },
        }),
      ),
    );

    expect(onTranscript).toHaveBeenCalledWith({
      text: 'hello there',
      isFinal: true,
      languageCode: 'en-IN',
      confidence: undefined,
    });
  });

  it('treats a transcript with no is_final field as final (real Sarvam responses never send it)', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const onTranscript = jest.fn();
    provider.startStream(
      { sampleRateHz: 8000 },
      { onTranscript, onError: jest.fn(), onClose: jest.fn() },
    );

    latestSocket().emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'data',
          data: { transcript: 'namaste', language_code: 'hi-IN' },
        }),
      ),
    );

    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'namaste', isFinal: true }),
    );
  });

  it('surfaces provider errors', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const onError = jest.fn();
    provider.startStream(
      { sampleRateHz: 8000 },
      { onTranscript: jest.fn(), onError, onClose: jest.fn() },
    );

    latestSocket().emit(
      'message',
      Buffer.from(
        JSON.stringify({ type: 'error', data: { message: 'boom' } }),
      ),
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('boom') as string,
      }),
    );
  });

  it('close() is idempotent and does not fire onClose for a self-initiated close', () => {
    const provider = new SarvamSttProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const onClose = jest.fn();
    const stream = provider.startStream(
      { sampleRateHz: 8000 },
      { onTranscript: jest.fn(), onError: jest.fn(), onClose },
    );

    stream.close();
    stream.close();

    expect(latestSocket().closeCalled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});
