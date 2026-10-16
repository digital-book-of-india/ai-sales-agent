import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/types/auth.types';
import type { HumanTransferContext } from './human-transfer/human-transfer.types';

export type CallEventName =
  | 'call.created'
  | 'call.dialing'
  | 'call.ringing'
  | 'call.connected'
  | 'call.ended';

export interface CallEventPayload {
  queueItemId: string;
  leadId: string;
  leadName: string;
  campaignId: string;
  campaignName: string;
  status: string;
  attempts: number;
  callId: string | null;
  outcome?: 'CONNECTED' | 'NO_ANSWER' | 'BUSY' | 'FAILED';
  talkMs?: number;
}

// Emitted by the AI voice pipeline (see ../ai-voice/voice-session.service.ts)
// so the live call monitor can show whether the AI is currently talking —
// distinct from CallEventName above, which tracks the call's own lifecycle.
export type AiVoiceEventName = 'ai.speaking' | 'ai.stopped';

export interface AiVoiceEventPayload {
  callId: string;
  /** The sentence being spoken — present on ai.speaking. */
  text?: string;
  /** Why the AI stopped talking — present on ai.stopped. */
  reason?: 'completed' | 'barge_in' | 'error';
}

// Emitted by TranscriptsService (see ../transcripts/transcripts.service.ts)
// every time one new message is saved — the live transcript panel appends
// it rather than refetching the whole transcript.
export type TranscriptEventName = 'transcript.updated';

export interface TranscriptEventPayload {
  callId: string;
  message: {
    id: string;
    speaker: 'AI' | 'CUSTOMER';
    text: string;
    timestamp: string;
    confidence: number | null;
  };
}

// Emitted by CallAnalysisService (see ./analysis/call-analysis.service.ts)
// once a call's post-call analysis finishes updating the lead. Deliberately
// thin — just enough for a listener to know to refetch the lead it's
// looking at, same posture as the CallEvent payloads above (the frontend
// never gets a full domain object pushed at it, only "something changed,
// go refetch").
export type LeadEventName = 'lead.updated' | 'lead.score.updated';

export interface LeadUpdatedEventPayload {
  leadId: string;
}

export interface LeadScoreUpdatedEventPayload {
  leadId: string;
  leadScore: number;
  leadScoreCategory: string;
}

// Emitted by HumanTransferService (see ./human-transfer/human-transfer.service.ts)
// once a live AI call has been handed off to a salesperson — a broadcast
// event like every other one on this gateway, so the frontend filters on
// targetUserId client-side (same posture as useLeadEventsSocket filtering
// on leadId) rather than the backend maintaining per-user socket rooms.
export type HumanTransferEventName = 'human.transfer';

export interface HumanTransferEventPayload extends HumanTransferContext {
  /** Who the call was bridged to — only that user's frontend should react. */
  targetUserId: string;
  notificationId: string;
  /** Human-readable labels for `reasons`, precomputed so the popup doesn't
   * need its own copy of TRANSFER_REASON_LABEL. */
  reasonLabels: string[];
}

// The frontend must never drive calling logic directly — this gateway is
// read-only from the client's perspective: it pushes queue/call state, it
// never accepts commands.
@WebSocketGateway({
  namespace: '/calling',
  cors: { origin: true, credentials: true },
})
export class CallingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(CallingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      this.logger.warn(`Rejected calling socket ${client.id}: invalid token`);
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;

    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    return null;
  }

  emitEvent(event: CallEventName, payload: CallEventPayload) {
    this.server.emit(event, payload);
  }

  emitAiVoiceEvent(event: AiVoiceEventName, payload: AiVoiceEventPayload) {
    this.server.emit(event, payload);
  }

  emitTranscriptEvent(
    event: TranscriptEventName,
    payload: TranscriptEventPayload,
  ) {
    this.server.emit(event, payload);
  }

  emitLeadEvent(event: 'lead.updated', payload: LeadUpdatedEventPayload): void;
  emitLeadEvent(
    event: 'lead.score.updated',
    payload: LeadScoreUpdatedEventPayload,
  ): void;
  emitLeadEvent(
    event: LeadEventName,
    payload: LeadUpdatedEventPayload | LeadScoreUpdatedEventPayload,
  ) {
    this.server.emit(event, payload);
  }

  emitHumanTransferEvent(
    event: HumanTransferEventName,
    payload: HumanTransferEventPayload,
  ) {
    this.server.emit(event, payload);
  }
}
