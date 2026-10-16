import {
  buildAudioPacket,
  buildTerminatePacket,
  parsePackets,
  PACKET_TYPE,
} from './audiosocket-protocol';

function packet(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(3);
  header.writeUInt8(type, 0);
  header.writeUInt16BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

describe('audiosocket-protocol', () => {
  describe('parsePackets', () => {
    it('decodes a uuid packet into canonical dashed form', () => {
      const raw = Buffer.from('a1b2c3d4e5f6789012345678deadbeef', 'hex');
      const { packets, rest } = parsePackets(packet(PACKET_TYPE.UUID, raw));

      expect(packets).toEqual([
        { type: 'uuid', uuid: 'a1b2c3d4-e5f6-7890-1234-5678deadbeef' },
      ]);
      expect(rest.length).toBe(0);
    });

    it('decodes an 8kHz audio packet, preserving payload bytes', () => {
      const audio = Buffer.from([1, 2, 3, 4, 5]);
      const { packets } = parsePackets(packet(PACKET_TYPE.AUDIO_8KHZ, audio));

      expect(packets).toEqual([{ type: 'audio', audio }]);
    });

    it('decodes a dtmf packet', () => {
      const { packets } = parsePackets(
        packet(PACKET_TYPE.DTMF, Buffer.from('5', 'ascii')),
      );

      expect(packets).toEqual([{ type: 'dtmf', digit: '5' }]);
    });

    it('decodes a terminate packet (zero-length payload)', () => {
      const { packets } = parsePackets(
        packet(PACKET_TYPE.TERMINATE, Buffer.alloc(0)),
      );

      expect(packets).toEqual([{ type: 'terminate' }]);
    });

    it('decodes an error packet', () => {
      const { packets } = parsePackets(
        packet(PACKET_TYPE.ERROR, Buffer.from([0x02])),
      );

      expect(packets).toEqual([{ type: 'error', code: 2 }]);
    });

    it('ignores an unrecognized packet type but still advances past it', () => {
      const unknown = packet(0x99, Buffer.from([1, 2]));
      const audio = packet(PACKET_TYPE.AUDIO_8KHZ, Buffer.from([9]));
      const { packets, rest } = parsePackets(Buffer.concat([unknown, audio]));

      expect(packets).toEqual([{ type: 'audio', audio: Buffer.from([9]) }]);
      expect(rest.length).toBe(0);
    });

    it('parses multiple packets delivered in a single buffer', () => {
      const buf = Buffer.concat([
        packet(PACKET_TYPE.AUDIO_8KHZ, Buffer.from([1])),
        packet(PACKET_TYPE.AUDIO_8KHZ, Buffer.from([2])),
        packet(PACKET_TYPE.AUDIO_8KHZ, Buffer.from([3])),
      ]);

      const { packets } = parsePackets(buf);

      expect(packets.map((p) => (p as { audio: Buffer }).audio[0])).toEqual([
        1, 2, 3,
      ]);
    });

    it('holds back an incomplete trailing packet as `rest` instead of erroring', () => {
      const full = packet(PACKET_TYPE.AUDIO_8KHZ, Buffer.from([1, 2, 3, 4]));
      const partial = full.subarray(0, full.length - 2); // header + short payload

      const { packets, rest } = parsePackets(partial);

      expect(packets).toEqual([]);
      expect(rest).toEqual(partial);
    });

    it('resumes correctly once the rest of a split packet arrives', () => {
      const full = packet(PACKET_TYPE.AUDIO_8KHZ, Buffer.from([1, 2, 3, 4]));
      const first = parsePackets(full.subarray(0, 4));
      const second = parsePackets(
        Buffer.concat([first.rest, full.subarray(4)]),
      );

      expect(second.packets).toEqual([
        { type: 'audio', audio: Buffer.from([1, 2, 3, 4]) },
      ]);
    });
  });

  describe('buildAudioPacket', () => {
    it('round-trips through parsePackets', () => {
      const audio = Buffer.from([10, 20, 30]);
      const { packets } = parsePackets(buildAudioPacket(audio));

      expect(packets).toEqual([{ type: 'audio', audio }]);
    });
  });

  describe('buildTerminatePacket', () => {
    it('round-trips through parsePackets', () => {
      const { packets } = parsePackets(buildTerminatePacket());

      expect(packets).toEqual([{ type: 'terminate' }]);
    });
  });
});
