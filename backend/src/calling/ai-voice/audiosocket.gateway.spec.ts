import type { ConfigService } from '@nestjs/config';
import {
  AudioSocketGateway,
  type AudioSocketConnection,
} from './audiosocket.gateway';
import type {
  VoiceSessionAudioSink,
  VoiceSessionService,
} from './voice-session.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { buildAudioPacket } from './audiosocket-protocol';

interface FakeSocket extends AudioSocketConnection {
  written: Buffer[];
  destroyed: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
}

function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    written: [],
    destroyed: false,
    handlers: {},
    write: (data: Buffer) => {
      socket.written.push(data);
    },
    destroy: () => {
      socket.destroyed = true;
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      socket.handlers[event] = listener;
    },
  };
  return socket;
}

// 16 raw bytes -> "a1b2c3d4-e5f6-7890-1234-5678deadbeef"
const TEST_UUID_BYTES = Buffer.from('a1b2c3d4e5f6789012345678deadbeef', 'hex');
const TEST_UUID = 'a1b2c3d4-e5f6-7890-1234-5678deadbeef';

function uuidPacket(): Buffer {
  const header = Buffer.alloc(3);
  header.writeUInt8(0x01, 0);
  header.writeUInt16BE(TEST_UUID_BYTES.length, 1);
  return Buffer.concat([header, TEST_UUID_BYTES]);
}

function audioPacket(bytes: number[]): Buffer {
  return buildAudioPacket(Buffer.from(bytes));
}

function terminatePacket(): Buffer {
  return Buffer.from([0x00, 0x00, 0x00]);
}

describe('AudioSocketGateway', () => {
  const start = jest.fn<
    Promise<void>,
    [string, VoiceSessionAudioSink, number]
  >();
  const stop = jest.fn();
  const handleInboundAudio = jest.fn();
  const voiceSession = {
    start,
    stop,
    handleInboundAudio,
  } as unknown as VoiceSessionService;

  const findUnique = jest.fn();
  const prisma = { call: { findUnique } } as unknown as PrismaService;

  let configValues: Record<string, string | undefined>;
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  let gateway: AudioSocketGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    configValues = {};
    start.mockResolvedValue(undefined);
    gateway = new AudioSocketGateway(voiceSession, prisma, config);
  });

  describe('handleConnection — IP allowlist', () => {
    it('accepts a connection when no allowlist is configured', () => {
      const socket = fakeSocket();
      gateway.handleConnection(socket, '203.0.113.9');

      expect(socket.destroyed).toBe(false);
      expect(socket.handlers.data).toBeDefined();
    });

    it('rejects a connection whose remote IP is not in ASTERISK_SERVER_IPS', () => {
      configValues.ASTERISK_SERVER_IPS = '10.0.0.9, 10.0.0.10';
      const socket = fakeSocket();

      gateway.handleConnection(socket, '203.0.113.9');

      expect(socket.destroyed).toBe(true);
    });

    it('accepts a connection whose remote IP is in ASTERISK_SERVER_IPS (IPv4-mapped IPv6 stripped)', () => {
      configValues.ASTERISK_SERVER_IPS = '10.0.0.9';
      const socket = fakeSocket();

      gateway.handleConnection(socket, '::ffff:10.0.0.9');

      expect(socket.destroyed).toBe(false);
    });
  });

  describe('handlePacket', () => {
    it('on uuid: looks up the call by providerCallId and starts the voice session', async () => {
      findUnique.mockResolvedValue({ id: 'call-1' });
      const socket = fakeSocket();
      let callId: string | null = null;

      await gateway.handlePacket(
        socket,
        { type: 'uuid', uuid: TEST_UUID },
        null,
        (id) => (callId = id),
      );

      expect(findUnique).toHaveBeenCalledWith({
        where: { providerCallId: TEST_UUID },
      });
      expect(start).toHaveBeenCalledWith('call-1', expect.anything(), 8000);
      expect(callId).toBe('call-1');
    });

    it('on uuid: uses AI_VOICE_SAMPLE_RATE_HZ when configured', async () => {
      configValues.AI_VOICE_SAMPLE_RATE_HZ = '16000';
      findUnique.mockResolvedValue({ id: 'call-1' });
      const socket = fakeSocket();

      await gateway.handlePacket(
        socket,
        { type: 'uuid', uuid: TEST_UUID },
        null,
        () => {},
      );

      expect(start).toHaveBeenCalledWith('call-1', expect.anything(), 16000);
    });

    it('on uuid: destroys the socket when the call is unknown', async () => {
      findUnique.mockResolvedValue(null);
      const socket = fakeSocket();

      await gateway.handlePacket(
        socket,
        { type: 'uuid', uuid: TEST_UUID },
        null,
        () => {},
      );

      expect(socket.destroyed).toBe(true);
      expect(start).not.toHaveBeenCalled();
    });

    it('on audio: forwards decoded bytes to the voice session for the current call', async () => {
      const socket = fakeSocket();
      const audio = Buffer.from([1, 2, 3]);

      await gateway.handlePacket(
        socket,
        { type: 'audio', audio },
        'call-1',
        () => {},
      );

      expect(handleInboundAudio).toHaveBeenCalledWith('call-1', audio);
    });

    it('on audio: does nothing before a uuid packet has set the call id', async () => {
      const socket = fakeSocket();

      await gateway.handlePacket(
        socket,
        { type: 'audio', audio: Buffer.from([1]) },
        null,
        () => {},
      );

      expect(handleInboundAudio).not.toHaveBeenCalled();
    });

    it('on terminate: stops the voice session', async () => {
      const socket = fakeSocket();

      await gateway.handlePacket(
        socket,
        { type: 'terminate' },
        'call-1',
        () => {},
      );

      expect(stop).toHaveBeenCalledWith('call-1');
    });

    it('ignores dtmf and error packets', async () => {
      const socket = fakeSocket();

      await gateway.handlePacket(
        socket,
        { type: 'dtmf', digit: '5' },
        'call-1',
        () => {},
      );
      await gateway.handlePacket(
        socket,
        { type: 'error', code: 1 },
        'call-1',
        () => {},
      );

      expect(stop).not.toHaveBeenCalled();
      expect(handleInboundAudio).not.toHaveBeenCalled();
    });
  });

  describe('the audio sink built for a started session', () => {
    it('sendAudio() writes an AudioSocket 8kHz packet, and nothing once destroyed', async () => {
      findUnique.mockResolvedValue({ id: 'call-1' });
      const socket = fakeSocket();

      await gateway.handlePacket(
        socket,
        { type: 'uuid', uuid: TEST_UUID },
        null,
        () => {},
      );
      const sink = start.mock.calls[0][1];

      sink.sendAudio(Buffer.from([9, 9]));
      expect(socket.written[0]).toEqual(buildAudioPacket(Buffer.from([9, 9])));

      socket.destroyed = true;
      sink.sendAudio(Buffer.from([1]));
      expect(socket.written).toHaveLength(1);
    });
  });

  describe('end-to-end wire framing via handleConnection', () => {
    it('splits a uuid packet arriving split across two data events, then handles a following audio packet', async () => {
      findUnique.mockResolvedValue({ id: 'call-1' });
      const socket = fakeSocket();
      gateway.handleConnection(socket, '10.0.0.9');

      const full = uuidPacket();
      socket.handlers.data(full.subarray(0, 5));
      socket.handlers.data(full.subarray(5));
      // handlePacket runs async (fire-and-forget from the data handler) —
      // flush microtasks before asserting.
      await Promise.resolve();
      await Promise.resolve();

      expect(findUnique).toHaveBeenCalledWith({
        where: { providerCallId: TEST_UUID },
      });

      socket.handlers.data(audioPacket([7, 8, 9]));
      await Promise.resolve();
      expect(handleInboundAudio).toHaveBeenCalledWith(
        'call-1',
        Buffer.from([7, 8, 9]),
      );

      socket.handlers.data(terminatePacket());
      await Promise.resolve();
      expect(stop).toHaveBeenCalledWith('call-1');
    });

    it('on close: stops the voice session if one was started', () => {
      const socket = fakeSocket();
      gateway.handleConnection(socket, '10.0.0.9');

      socket.handlers.close();

      // No uuid packet ever arrived, so there's no callId to stop.
      expect(stop).not.toHaveBeenCalled();
    });
  });
});
