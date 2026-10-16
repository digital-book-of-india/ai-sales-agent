import type { RawData } from 'ws';

/** `ws` message payloads arrive as Buffer, Buffer[] (fragmented frames), or
 * ArrayBuffer depending on config — a bare `.toString()` on the union
 * mis-stringifies the ArrayBuffer case ("[object ArrayBuffer]"). Used by
 * both stt/sarvam-stt.provider.ts and tts/sarvam-tts.provider.ts to decode
 * incoming JSON frames. */
export function rawDataToString(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}
