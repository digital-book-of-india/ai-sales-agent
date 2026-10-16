import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CallingGateway } from '../calling.gateway';
import { TranscriptSpeaker } from '../../../generated/prisma/enums';

/**
 * Owns the `transcripts`/`transcript_messages` tables. A Transcript row is
 * created lazily by addMessage's first call for a given callId — a MANUAL
 * call, which never runs the AI voice pipeline, simply never gets one.
 * Every write also pushes a transcript.updated event over the /calling
 * websocket namespace so the live transcript panel can append in place
 * instead of refetching (see CallingGateway.emitTranscriptEvent).
 */
@Injectable()
export class TranscriptsService {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: CallingGateway,
  ) {}

  /** Idempotent: returns the existing transcript for this call, creating one
   * if this is the first message saved for it. */
  private async getOrCreate(callId: string): Promise<{ id: string }> {
    const existing = await this.prisma.transcript.findUnique({
      where: { callId },
      select: { id: true },
    });
    if (existing) return existing;

    return this.prisma.transcript.create({
      data: { callId },
      select: { id: true },
    });
  }

  /** Saves one utterance and emits transcript.updated. Called fire-and-forget
   * from the voice pipeline (see VoiceSessionService) so a slow write never
   * blocks live call audio — callers should .catch() and log rather than
   * await this on the hot path. */
  async addMessage(
    callId: string,
    speaker: TranscriptSpeaker,
    text: string,
    confidence?: number,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    const transcript = await this.getOrCreate(callId);
    const message = await this.prisma.transcriptMessage.create({
      data: {
        transcriptId: transcript.id,
        speaker,
        text: trimmed,
        confidence: confidence ?? null,
      },
    });

    this.gateway.emitTranscriptEvent('transcript.updated', {
      callId,
      message: {
        id: message.id,
        speaker: message.speaker,
        text: message.text,
        timestamp: message.timestamp.toISOString(),
        confidence: message.confidence,
      },
    });
  }

  /** Stamps finalizedAt once the call reaches a terminal status (see
   * CallsService.finish). A no-op — not an error — when the call never had
   * a transcript (MANUAL calls, or an AI call that never produced STT
   * output before hanging up). */
  async finalize(callId: string): Promise<void> {
    const result = await this.prisma.transcript.updateMany({
      where: { callId, finalizedAt: null },
      data: { finalizedAt: new Date() },
    });
    if (result.count === 0) {
      this.logger.debug(`No open transcript to finalize for call ${callId}`);
    }
  }

  /** Full transcript + messages in speaking order — backs the historical
   * view on the Call Detail page and the live panel's initial load. Returns
   * null (not a 404) for a call with no transcript yet — a MANUAL call, or
   * an AI call whose voice session never produced a saved message — so the
   * frontend can render a plain empty state, same as
   * RecordingsService.getForCall. */
  async getForCall(callId: string) {
    return this.prisma.transcript.findUnique({
      where: { callId },
      select: {
        id: true,
        callId: true,
        finalizedAt: true,
        createdAt: true,
        messages: {
          orderBy: { timestamp: 'asc' },
          select: {
            id: true,
            speaker: true,
            text: true,
            timestamp: true,
            confidence: true,
          },
        },
      },
    });
  }
}
