/**
 * Wire format for Asterisk's AudioSocket dialplan app — a raw TCP protocol
 * (not WebSocket, unlike Exotel's AgentStream this replaces):
 * https://docs.asterisk.org/Configuration/Channel-Drivers/AudioSocket/
 *
 * Every packet is a 1-byte type + 2-byte big-endian payload length + payload.
 * Asterisk's AudioSocket() app is fixed at 8kHz mono, so only the 0x10
 * (slin/8kHz) audio type is used here — Asterisk supports 0x11-0x18 for
 * other rates, but this app never sends/expects them. All parsing/framing
 * is isolated to this file (pure, no I/O) — same isolation rule
 * ../telephony/ami-client.ts follows for AMI's own wire format.
 */

export const PACKET_TYPE = {
  TERMINATE: 0x00,
  UUID: 0x01,
  DTMF: 0x03,
  AUDIO_8KHZ: 0x10,
  ERROR: 0xff,
} as const;

export type InboundPacket =
  | { type: 'uuid'; uuid: string }
  | { type: 'audio'; audio: Buffer }
  | { type: 'dtmf'; digit: string }
  | { type: 'terminate' }
  | { type: 'error'; code: number };

const HEADER_LEN = 3;

/**
 * Incrementally parses packets out of a growing byte buffer. TCP gives no
 * message boundaries, so callers feed in whatever `data` events deliver and
 * get back however many complete packets are now available, plus the
 * leftover bytes to keep buffering (mirrors the accumulate-and-slice loop
 * ../telephony/ami-client.ts uses for its own line-based framing).
 */
export function parsePackets(buffer: Buffer): {
  packets: InboundPacket[];
  rest: Buffer;
} {
  const packets: InboundPacket[] = [];
  let offset = 0;

  while (buffer.length - offset >= HEADER_LEN) {
    const type = buffer.readUInt8(offset);
    const length = buffer.readUInt16BE(offset + 1);
    const totalLen = HEADER_LEN + length;
    if (buffer.length - offset < totalLen) break; // wait for more data

    const payload = buffer.subarray(offset + HEADER_LEN, offset + totalLen);
    const packet = decodePacket(type, payload);
    if (packet) packets.push(packet);
    offset += totalLen;
  }

  return { packets, rest: buffer.subarray(offset) };
}

function decodePacket(type: number, payload: Buffer): InboundPacket | null {
  switch (type) {
    case PACKET_TYPE.UUID:
      return { type: 'uuid', uuid: formatUuid(payload) };
    case PACKET_TYPE.AUDIO_8KHZ:
      return { type: 'audio', audio: Buffer.from(payload) };
    case PACKET_TYPE.DTMF:
      return { type: 'dtmf', digit: payload.toString('ascii') };
    case PACKET_TYPE.TERMINATE:
      return { type: 'terminate' };
    case PACKET_TYPE.ERROR:
      return { type: 'error', code: payload.length ? payload.readUInt8(0) : 0 };
    default:
      // Unrecognized type (e.g. a different sample rate we never asked
      // for) — ignore rather than error, same tolerance
      // exotel-stream-protocol.ts's predecessor applied to unknown events.
      return null;
  }
}

function formatUuid(payload: Buffer): string {
  const hex = payload.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Outbound "here's some AI speech audio" packet — 8kHz mono PCM16LE. */
export function buildAudioPacket(audio: Buffer): Buffer {
  const header = Buffer.alloc(HEADER_LEN);
  header.writeUInt8(PACKET_TYPE.AUDIO_8KHZ, 0);
  header.writeUInt16BE(audio.length, 1);
  return Buffer.concat([header, audio]);
}

/** Tells Asterisk to hang up this leg — the closest AudioSocket equivalent
 * to AgentStream's `clear` event, though coarser: AudioSocket has no
 * "flush buffered TTS but keep the call up" instruction, so
 * AudioSocketGateway's sink leaves `clear` unimplemented (it's optional on
 * VoiceSessionAudioSink) rather than hanging up on every barge-in. */
export function buildTerminatePacket(): Buffer {
  const header = Buffer.alloc(HEADER_LEN);
  header.writeUInt8(PACKET_TYPE.TERMINATE, 0);
  header.writeUInt16BE(0, 1);
  return header;
}
