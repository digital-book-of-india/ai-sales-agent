import {
  BadGatewayException,
  forwardRef,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TELEPHONY_PROVIDER } from '../telephony/telephony-provider.token';
import type { TelephonyProvider } from '../telephony/telephony-provider.interface';
import { RecordingRetentionStatus } from '../../../generated/prisma/enums';
import type { Recording } from '../../../generated/prisma/client';
import {
  buildSignedRecordingPath,
  verifyRecordingToken,
  type RecordingDisposition,
  type RecordingStreamQuery,
} from './recording-url.util';
import { generateMockAudioWav, MOCK_AUDIO_CONTENT_TYPE } from './mock-audio';

export const RECORDINGS_QUEUE = 'recordings';
export const FETCH_RECORDING_JOB = 'fetch-recording';

const DEFAULT_TTL_SECONDS = 300;

// Gives the provider a few seconds to finish processing/uploading the
// recording after the call ends before the first fetch attempt.
const FETCH_DELAY_MS = 5000;

/** Filename extension for a download/stream response, derived from the
 * actual Content-Type served rather than which provider stored the
 * recording — storageProvider is an internal bookkeeping label, not a
 * reliable predictor of audio format (MixMonitor/Asterisk serves wav,
 * not the mp3 the pre-Asterisk Exotel integration used to deliver). */
function extensionForContentType(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('wav')) return 'wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('ogg')) return 'ogg';
  return 'audio';
}

export interface RecordingSummary {
  id: string;
  callId: string;
  duration: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  retentionStatus: RecordingRetentionStatus;
  createdAt: Date;
  /** Short-lived signed URL for inline playback — see recording-url.util.ts. */
  playUrl: string;
}

export interface RecordingStreamResult {
  disposition: RecordingDisposition;
  contentType: string;
  body: Buffer;
  filename: string;
}

/**
 * Owns the `recordings` table and the signed-URL scheme that gates access
 * to it. The raw recordingUrl a telephony provider reports is never handed
 * to the frontend — only ids and signed /stream links leave this service
 * (see recordings.controller.ts for who is allowed to mint which).
 */
@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    // forwardRef: MockTelephonyProvider (behind TELEPHONY_PROVIDER) injects
    // CallsService, which injects this service — closing a cycle back to
    // TELEPHONY_PROVIDER. forwardRef defers resolution of this one param so
    // Nest can finish constructing everyone else first instead of deadlocking.
    @Inject(forwardRef(() => TELEPHONY_PROVIDER))
    private readonly provider: TelephonyProvider,
    @InjectQueue(RECORDINGS_QUEUE) private readonly queue: Queue,
  ) {}

  private get secret(): string {
    return (
      this.config.get<string>('RECORDING_URL_SECRET') ??
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  private get ttlSeconds(): number {
    const raw = this.config.get<string>('RECORDING_URL_TTL_SECONDS');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
  }

  /** Queues a fetch-and-store job for a call that just completed. Idempotent
   * per call (fixed jobId) — a duplicate terminal webhook won't double-queue
   * it. Failures retry with backoff since the provider may not have
   * finished processing the recording yet — see fetchAndStore. */
  async enqueueFetch(callId: string): Promise<void> {
    await this.queue.add(
      FETCH_RECORDING_JOB,
      { callId },
      {
        jobId: `${FETCH_RECORDING_JOB}-${callId}`,
        delay: FETCH_DELAY_MS,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }

  /** Worker entry point (see RecordingsProcessor). Throws when the provider
   * doesn't have a recording yet so BullMQ retries the job on backoff. */
  async fetchAndStore(callId: string): Promise<void> {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call || !call.providerCallId) {
      this.logger.warn(
        `Skipping recording fetch for ${callId}: call or providerCallId missing`,
      );
      return;
    }

    const result = await this.provider.getRecording(call.providerCallId);
    if (!result.url) {
      throw new Error(
        `Provider has no recording yet for call ${callId} — will retry`,
      );
    }

    await this.prisma.recording.upsert({
      where: { callId },
      create: {
        callId,
        recordingUrl: result.url,
        duration: call.duration,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        storageProvider: call.provider,
      },
      update: {
        recordingUrl: result.url,
        duration: call.duration,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        storageProvider: call.provider,
        retentionStatus: RecordingRetentionStatus.ACTIVE,
      },
    });
  }

  private async getActiveOrThrow(id: string): Promise<Recording> {
    const recording = await this.prisma.recording.findUnique({
      where: { id },
    });
    if (!recording) {
      throw new NotFoundException('Recording not found');
    }
    if (recording.retentionStatus !== RecordingRetentionStatus.ACTIVE) {
      throw new GoneException('Recording is no longer available');
    }
    return recording;
  }

  private signedPath(
    recordingId: string,
    disposition: RecordingDisposition,
  ): string {
    const expiresAt = Date.now() + this.ttlSeconds * 1000;
    return buildSignedRecordingPath(
      { recordingId, disposition, expiresAt },
      this.secret,
    );
  }

  private toSummary(recording: Recording): RecordingSummary {
    return {
      id: recording.id,
      callId: recording.callId,
      duration: recording.duration,
      startedAt: recording.startedAt,
      endedAt: recording.endedAt,
      retentionStatus: recording.retentionStatus,
      createdAt: recording.createdAt,
      playUrl: this.signedPath(recording.id, 'inline'),
    };
  }

  /** Null (not an error) when the call simply has no recording yet/at all —
   * the frontend treats that as "no recording", not a failure. */
  async getForCall(callId: string): Promise<RecordingSummary | null> {
    const recording = await this.prisma.recording.findUnique({
      where: { callId },
    });
    if (
      !recording ||
      recording.retentionStatus !== RecordingRetentionStatus.ACTIVE
    ) {
      return null;
    }
    return this.toSummary(recording);
  }

  async getById(id: string): Promise<RecordingSummary> {
    const recording = await this.getActiveOrThrow(id);
    return this.toSummary(recording);
  }

  /** Restricted at the controller to roles allowed to download (see
   * RecordingsController) — the attachment disposition itself is then
   * baked into the signature, so the resulting link can't be replayed as a
   * play-only stream and vice versa. */
  async getDownloadUrl(id: string): Promise<{ url: string }> {
    await this.getActiveOrThrow(id);
    return { url: this.signedPath(id, 'attachment') };
  }

  /**
   * Validates a stream request's signed query params and fetches the audio
   * bytes to serve. Buffers the whole file in memory — acceptable for the
   * short recordings this app deals with; a production deployment fronting
   * large files would pipe the provider response through instead.
   */
  async resolveStream(
    id: string,
    query: RecordingStreamQuery,
  ): Promise<RecordingStreamResult> {
    const disposition = verifyRecordingToken(id, query, this.secret);
    if (!disposition) {
      throw new UnauthorizedException('Invalid or expired recording link');
    }

    const recording = await this.getActiveOrThrow(id);
    const { body, contentType } = await this.fetchAudio(recording);

    return {
      disposition,
      contentType,
      body,
      filename: `recording-${recording.callId}.${extensionForContentType(contentType)}`,
    };
  }

  private async fetchAudio(
    recording: Recording,
  ): Promise<{ body: Buffer; contentType: string }> {
    // The mock telephony provider has no real audio anywhere — its
    // recordingUrl (https://mock-recordings.local/...) is a placeholder
    // that was never meant to be fetched over the network. Synthesize a
    // short tone instead so play/download/seek all work end-to-end in
    // local dev without a real Asterisk deployment.
    if (recording.storageProvider === 'mock') {
      return {
        body: generateMockAudioWav(recording.duration),
        contentType: MOCK_AUDIO_CONTENT_TYPE,
      };
    }

    const response = await fetch(recording.recordingUrl);
    if (!response.ok) {
      throw new BadGatewayException(
        `Failed to fetch recording from storage (${response.status})`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') ?? 'audio/mpeg',
    };
  }
}
