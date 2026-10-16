import { EventEmitter as mockEventEmitter } from 'events';
import type { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { SarvamTtsProvider } from './sarvam-tts.provider';

interface FakeSocketInstance extends mockEventEmitter {
  readonly url: string;
  readonly sent: string[];
  readonly closeCalled: boolean;
  readyState: number;
}

interface FakeWebSocketStatic {
  OPEN: number;
  CONNECTING: number;
  instances: FakeSocketInstance[];
}

// See sarvam-stt.provider.spec.ts for why this shape (self-contained
// factory class + `mockEventEmitter` — Jest's out-of-scope-variable rule
// special-cases "mock"-prefixed identifiers).
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

describe('SarvamTtsProvider', () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
  });

  it('sends config, text, and flush frames once the socket opens', () => {
    const provider = new SarvamTtsProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );

    provider.synthesize(
      'Namaste, kaise madad kar sakta hoon?',
      { languageCode: 'hi-IN' },
      { onAudioChunk: jest.fn(), onComplete: jest.fn(), onError: jest.fn() },
    );

    const socket = latestSocket();
    socket.emit('open');

    expect(socket.url).toContain('send_completion_event=true');
    expect(socket.sent).toHaveLength(3);
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'config',
      // `speech_sample_rate`, not `sample_rate` — the wrong field name is
      // silently ignored by Sarvam (falls back to its native 24kHz), which
      // corrupts every playback that assumes it got sampleRateHz back.
      data: { target_language_code: 'hi-IN', speech_sample_rate: '8000' },
    });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'text',
      data: { text: 'Namaste, kaise madad kar sakta hoon?' },
    });
    expect(JSON.parse(socket.sent[2])).toEqual({ type: 'flush' });
  });

  it('decodes streamed audio frames and signals completion', () => {
    const provider = new SarvamTtsProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const onAudioChunk = jest.fn();
    const onComplete = jest.fn();

    provider.synthesize(
      'Hello there',
      { languageCode: 'en-IN' },
      { onAudioChunk, onComplete, onError: jest.fn() },
    );

    const socket = latestSocket();
    const audioBase64 = Buffer.from([10, 20, 30]).toString('base64');
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({ type: 'audio', data: { audio: audioBase64 } }),
      ),
    );
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({ type: 'event', data: { event_type: 'final' } }),
      ),
    );

    expect(onAudioChunk).toHaveBeenCalledWith({
      audio: Buffer.from([10, 20, 30]),
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(socket.closeCalled).toBe(true);
  });

  it('cancel() tears the connection down and suppresses further delivery', () => {
    const provider = new SarvamTtsProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const onAudioChunk = jest.fn();
    const onComplete = jest.fn();

    const stream = provider.synthesize(
      'This will be interrupted',
      { languageCode: 'en-IN' },
      { onAudioChunk, onComplete, onError: jest.fn() },
    );

    const socket = latestSocket();
    stream.cancel();
    expect(socket.closeCalled).toBe(true);

    // A frame that arrives after cancel (race with the network) must not
    // reach handlers — this is what makes barge-in actually silent.
    const audioBase64 = Buffer.from([1]).toString('base64');
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({ type: 'audio', data: { audio: audioBase64 } }),
      ),
    );

    expect(onAudioChunk).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('surfaces provider errors', () => {
    const provider = new SarvamTtsProvider(
      configStub({ SARVAM_API_KEY: 'key-123' }),
    );
    const onError = jest.fn();

    provider.synthesize(
      'Hello',
      { languageCode: 'en-IN' },
      { onAudioChunk: jest.fn(), onComplete: jest.fn(), onError },
    );

    latestSocket().emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'error',
          data: { message: 'synthesis failed' },
        }),
      ),
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('synthesis failed') as string,
      }),
    );
  });
});
