import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'net';
import { PrismaService } from '../../prisma/prisma.service';
import {
  VoiceSessionService,
  type VoiceSessionAudioSink,
} from './voice-session.service';
import {
  buildAudioPacket,
  parsePackets,
  type InboundPacket,
} from './audiosocket-protocol';

/** The minimal surface this file needs from a live connection. `net`'s
 * Socket satisfies this structurally, so listen() can hand one straight
 * through; tests instead pass a plain fake — same pattern
 * VoiceCallGateway's StreamSocket (this file's Exotel-era predecessor)
 * used for its WebSocket connections. */
export interface AudioSocketConnection {
  readonly destroyed: boolean;
  readonly remoteAddress?: string;
  write(data: Buffer): void;
  destroy(): void;
  on(
    event: 'data' | 'close' | 'error',
    listener: (...args: unknown[]) => void,
  ): void;
}

/**
 * Real-time bridge between Asterisk's AudioSocket dialplan app (raw TCP,
 * not WebSocket — see audiosocket-protocol.ts) and VoiceSessionService.
 * Asterisk is told to connect here via the `AI_AUDIOSOCKET_SERVICE` global
 * in infra/asterisk/etc/asterisk/extensions.conf's [ai-bridge] context.
 *
 * Swapping telephony providers again later means swapping this file for
 * whatever protocol the new provider's media streaming speaks — same seam
 * VoiceCallGateway (this file's Exotel-era predecessor) occupied.
 *
 * Unlike AgentStream, AudioSocket has no per-connection auth handshake —
 * Asterisk just opens a TCP connection and starts streaming. The security
 * boundary is therefore the network, not this file: firewall this port to
 * only accept connections from the Asterisk server's IP (see
 * infra/asterisk/README.md "Security"). ASTERISK_SERVER_IPS below is a
 * second, in-process layer of that same restriction — same defense-in-depth
 * reasoning as AMI's bind + permit/deny + firewall trio.
 */
@Injectable()
export class AudioSocketGateway {
  private readonly logger = new Logger(AudioSocketGateway.name);
  private server: Server | null = null;

  constructor(
    private readonly voiceSession: VoiceSessionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Starts listening. Call once from main.ts. */
  listen(): void {
    const host = this.config.get<string>('AUDIOSOCKET_HOST') ?? '0.0.0.0';
    const port = Number(this.config.get<string>('AUDIOSOCKET_PORT') ?? 9019);

    this.server = createServer((socket) =>
      this.handleConnection(socket, socket.remoteAddress),
    );
    this.server.listen(port, host, () => {
      this.logger.log(`AudioSocket bridge listening on ${host}:${port}`);
    });
  }

  close(): void {
    this.server?.close();
  }

  private allowedIps(): string[] | null {
    const raw = this.config.get<string>('ASTERISK_SERVER_IPS');
    if (!raw) return null;
    return raw.split(',').map((ip) => ip.trim());
  }

  handleConnection(
    socket: AudioSocketConnection,
    remoteAddress?: string,
  ): void {
    const allowed = this.allowedIps();
    const remoteIp = (remoteAddress ?? '').replace(/^::ffff:/, '');
    if (allowed && !allowed.includes(remoteIp)) {
      this.logger.warn(`Rejected AudioSocket connection from ${remoteIp}`);
      socket.destroy();
      return;
    }

    let buffer: Buffer = Buffer.alloc(0);
    let callId: string | null = null;

    socket.on('data', (...args: unknown[]) => {
      const chunk = Buffer.from(args[0] as Buffer);
      buffer = Buffer.concat([buffer, chunk]);
      const { packets, rest } = parsePackets(buffer);
      buffer = rest;

      for (const packet of packets) {
        void this.handlePacket(socket, packet, callId, (id) => {
          callId = id;
        }).catch((error: Error) =>
          this.logger.error(
            `AudioSocket packet handling failed: ${error.message}`,
          ),
        );
      }
    });

    socket.on('close', () => {
      if (callId) this.voiceSession.stop(callId);
    });

    socket.on('error', (...args: unknown[]) => {
      const error = args[0] as Error;
      this.logger.error(`AudioSocket connection error: ${error.message}`);
    });
  }

  async handlePacket(
    socket: AudioSocketConnection,
    packet: InboundPacket,
    currentCallId: string | null,
    setCallId: (id: string) => void,
  ): Promise<void> {
    switch (packet.type) {
      case 'uuid': {
        const call = await this.prisma.call.findUnique({
          where: { providerCallId: packet.uuid },
        });
        if (!call) {
          this.logger.warn(
            `AudioSocket uuid packet for unknown call ${packet.uuid}`,
          );
          socket.destroy();
          return;
        }

        setCallId(call.id);
        const sampleRateHz = Number(
          this.config.get<string>('AI_VOICE_SAMPLE_RATE_HZ') ?? 8000,
        );
        await this.voiceSession.start(
          call.id,
          this.buildSink(socket),
          sampleRateHz,
        );
        return;
      }

      case 'audio': {
        if (!currentCallId) return;
        this.voiceSession.handleInboundAudio(currentCallId, packet.audio);
        return;
      }

      case 'terminate': {
        if (currentCallId) this.voiceSession.stop(currentCallId);
        return;
      }

      // 'dtmf'/'error' — nothing this pipeline needs to act on, same
      // tolerance VoiceCallGateway applied to AgentStream's 'connected'/
      // 'dtmf'/'mark' events.
      default:
        return;
    }
  }

  private buildSink(socket: AudioSocketConnection): VoiceSessionAudioSink {
    return {
      sendAudio: (chunk) => {
        if (socket.destroyed) return;
        socket.write(buildAudioPacket(chunk));
      },
      // No `clear` — AudioSocket has no "flush buffered audio, keep the
      // call up" instruction (see audiosocket-protocol.ts buildTerminatePacket
      // doc comment). Left unimplemented since it's optional on
      // VoiceSessionAudioSink.
    };
  }
}
