import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CallingQueueService } from '../calling-queue.service';
import { CallLockService } from '../call-lock.service';
import { CallingGateway, type CallEventPayload } from '../calling.gateway';
import { RecordingsService } from '../recordings/recordings.service';
import { TranscriptsService } from '../transcripts/transcripts.service';
import { CallAnalysisService } from '../analysis/call-analysis.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import {
  CallStatus,
  CallingQueueStatus,
  NotificationType,
} from '../../../generated/prisma/enums';
import type {
  CallMode,
  TelephonyCallStatus,
} from './telephony-provider.interface';

export interface CreateCallInput {
  leadId: string;
  campaignId: string;
  queueItemId: string;
  provider: string;
  lockToken: string;
  // Same value DialerService is about to pass into provider.initiateCall —
  // recorded here so the Call row is the single source of truth for "who/what
  // handled this call", independent of any provider-specific bookkeeping.
  callMode: CallMode;
  salesUserId?: string;
}

export interface StatusUpdate {
  status: TelephonyCallStatus;
  duration?: number;
  recordingUrl?: string;
}

const CALL_INCLUDE = {
  lead: { select: { name: true } },
  campaign: {
    select: { name: true, retryInterval: true, recordingConsent: true },
  },
  queueItem: { select: { attempts: true } },
} satisfies Prisma.CallInclude;

type CallWithRelations = Prisma.CallGetPayload<{
  include: typeof CALL_INCLUDE;
}>;

// Deliberately omits the raw Call.recordingUrl column — that's the
// provider's own (possibly unsigned/guessable) reference, never handed to
// the frontend. Playback/download instead goes through RecordingsService's
// signed links, keyed off the `recording` relation below.
const CALL_SUMMARY_SELECT = {
  id: true,
  status: true,
  provider: true,
  duration: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  campaign: { select: { id: true, name: true } },
  queueItem: { select: { attempts: true, maxAttempts: true } },
  recording: { select: { id: true, retentionStatus: true } },
} satisfies Prisma.CallSelect;

const CALL_DETAIL_SELECT = {
  ...CALL_SUMMARY_SELECT,
  lead: { select: { id: true, name: true, phone: true, companyName: true } },
} satisfies Prisma.CallSelect;

const TERMINAL: TelephonyCallStatus[] = [
  'COMPLETED',
  'FAILED',
  'NO_ANSWER',
  'BUSY',
  'CANCELLED',
];

const TELEPHONY_TO_QUEUE_STATUS: Partial<
  Record<TelephonyCallStatus, CallingQueueStatus>
> = {
  RINGING: CallingQueueStatus.RINGING,
  IN_PROGRESS: CallingQueueStatus.CONNECTED,
};

const TELEPHONY_TO_CALL_STATUS: Record<TelephonyCallStatus, CallStatus> = {
  INITIATED: CallStatus.INITIATED,
  RINGING: CallStatus.RINGING,
  IN_PROGRESS: CallStatus.IN_PROGRESS,
  COMPLETED: CallStatus.COMPLETED,
  FAILED: CallStatus.FAILED,
  NO_ANSWER: CallStatus.NO_ANSWER,
  BUSY: CallStatus.BUSY,
  CANCELLED: CallStatus.CANCELLED,
};

/**
 * Owns the `calls` table and is the single place a provider-reported status
 * (real webhook or the mock provider's simulated timeline — see
 * MockTelephonyProvider) turns into calling_queue transitions, websocket
 * events, and lead-lock release. Neither the dialer nor any provider touches
 * calling_queue directly for an in-flight call — everything downstream of
 * "call started" flows through here.
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callingQueue: CallingQueueService,
    private readonly lock: CallLockService,
    private readonly gateway: CallingGateway,
    private readonly recordings: RecordingsService,
    private readonly transcripts: TranscriptsService,
    private readonly callAnalysis: CallAnalysisService,
    private readonly notifications: NotificationsService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  createCall(input: CreateCallInput) {
    return this.prisma.call.create({
      data: {
        leadId: input.leadId,
        campaignId: input.campaignId,
        queueItemId: input.queueItemId,
        provider: input.provider,
        status: CallStatus.INITIATED,
        lockToken: input.lockToken,
        callMode: input.callMode,
        salesUserId: input.salesUserId,
      },
    });
  }

  /** Fills in the provider's own call id once initiateCall returns it. */
  async attachProviderCallId(
    callId: string,
    providerCallId: string,
  ): Promise<void> {
    await this.prisma.call.update({
      where: { id: callId },
      data: { providerCallId },
    });
  }

  /** provider.initiateCall itself failed (after the provider's own retries
   * were exhausted) — there is no providerCallId and no webhook coming, so
   * this is the terminal update for that attempt. */
  async markInitiateFailure(callId: string): Promise<void> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: CALL_INCLUDE,
    });
    if (!call) {
      throw new NotFoundException(`No call found for id ${callId}`);
    }
    await this.finish(call, { status: 'FAILED' });
  }

  async applyStatusUpdate(
    providerCallId: string,
    update: StatusUpdate,
  ): Promise<void> {
    const call = await this.prisma.call.findUnique({
      where: { providerCallId },
      include: CALL_INCLUDE,
    });
    if (!call) {
      throw new NotFoundException(
        `No call found for providerCallId ${providerCallId}`,
      );
    }

    const isTerminal = TERMINAL.includes(update.status);
    await this.persist(call.id, update, isTerminal);

    if (update.status === 'RINGING' || update.status === 'IN_PROGRESS') {
      await this.progress(call, update.status);
      return;
    }

    if (isTerminal) {
      await this.finish(call, update);
    }
  }

  private async persist(
    callId: string,
    update: StatusUpdate,
    isTerminal: boolean,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: TELEPHONY_TO_CALL_STATUS[update.status],
        duration: update.duration,
        recordingUrl: update.recordingUrl,
        startedAt: update.status !== 'INITIATED' ? now : undefined,
        endedAt: isTerminal ? now : undefined,
      },
    });
  }

  private basePayload(
    call: CallWithRelations,
    status: string,
  ): CallEventPayload {
    return {
      queueItemId: call.queueItemId,
      leadId: call.leadId,
      leadName: call.lead.name,
      campaignId: call.campaignId,
      campaignName: call.campaign.name,
      status,
      attempts: call.queueItem.attempts,
      callId: call.id,
    };
  }

  private async progress(
    call: CallWithRelations,
    status: 'RINGING' | 'IN_PROGRESS',
  ): Promise<void> {
    const queueStatus = TELEPHONY_TO_QUEUE_STATUS[status]!;
    await this.callingQueue.setStatus(call.queueItemId, queueStatus);
    this.gateway.emitEvent(
      status === 'RINGING' ? 'call.ringing' : 'call.connected',
      this.basePayload(call, queueStatus),
    );
  }

  private async finish(
    call: CallWithRelations,
    update: StatusUpdate,
  ): Promise<void> {
    let resultingQueueStatus: CallingQueueStatus;
    if (update.status === 'COMPLETED') {
      const item = await this.callingQueue.completeCall(call.queueItemId);
      resultingQueueStatus = item.status;
      // Only fetch/store a recording when the campaign has recording
      // consent/disclosure enabled — see Campaign.recordingConsent.
      if (call.campaign.recordingConsent) {
        await this.recordings.enqueueFetch(call.id);
      }
      // Post-call analysis (Prompt 13) — a no-op for calls with no
      // transcript (see CallAnalysisService.analyze), so this is safe to
      // queue for every completed call regardless of callMode.
      await this.callAnalysis.enqueueAnalysis(call.id);
    } else if (
      update.status === 'NO_ANSWER' ||
      update.status === 'BUSY' ||
      update.status === 'FAILED'
    ) {
      const item = await this.callingQueue.recordFailedAttempt(
        call.queueItemId,
        CallingQueueStatus[update.status],
        call.campaign.retryInterval,
      );
      resultingQueueStatus = item.status;
    } else {
      const item = await this.callingQueue.setStatus(
        call.queueItemId,
        CallingQueueStatus.CANCELLED,
      );
      resultingQueueStatus = item.status;
    }

    const outcome: CallEventPayload['outcome'] =
      update.status === 'COMPLETED'
        ? 'CONNECTED'
        : update.status === 'NO_ANSWER' || update.status === 'BUSY'
          ? update.status
          : 'FAILED';

    this.gateway.emitEvent('call.ended', {
      ...this.basePayload(call, resultingQueueStatus),
      outcome,
      talkMs:
        update.status === 'COMPLETED' && update.duration !== undefined
          ? update.duration * 1000
          : undefined,
    });

    if (call.lockToken) {
      await this.lock.release(call.leadId, call.lockToken);
    } else {
      this.logger.warn(`Call ${call.id} had no lockToken to release`);
    }

    await this.transcripts.finalize(call.id);
    await this.checkCampaignSignals(call, resultingQueueStatus);
  }

  /**
   * Prompt 19 — the two campaign-level notification triggers, checked on
   * every call that finishes (cheap: at most two count() queries, only on
   * a terminal update, never on the RINGING/IN_PROGRESS path). Both are
   * naturally fire-once: CALL_FAILURES_THRESHOLD only notifies on the
   * exact attempt that makes the campaign's failed count equal the
   * configured threshold (not "at least", so later failures don't
   * re-notify), and CAMPAIGN_COMPLETED only notifies on the one call whose
   * finish empties the campaign's queue out — see
   * CallingQueueService.isCampaignExhausted/countFailed.
   */
  private async checkCampaignSignals(
    call: CallWithRelations,
    resultingQueueStatus: CallingQueueStatus,
  ): Promise<void> {
    if (resultingQueueStatus === CallingQueueStatus.FAILED) {
      const { failedCallsThreshold } =
        await this.systemSettings.getNotificationsConfig();
      const failedCount = await this.callingQueue.countFailed(call.campaignId);
      if (failedCount === failedCallsThreshold) {
        await this.notifications.notifyManagers({
          type: NotificationType.CALL_FAILURES_THRESHOLD,
          title: `Failed calls threshold reached: ${call.campaign.name}`,
          body: `${failedCount} calls have failed in this campaign.`,
          payload: { campaignId: call.campaignId, failedCount },
        });
      }
    }

    const exhausted = await this.callingQueue.isCampaignExhausted(
      call.campaignId,
    );
    if (exhausted) {
      await this.notifications.notifyManagers({
        type: NotificationType.CAMPAIGN_COMPLETED,
        title: `Campaign completed: ${call.campaign.name}`,
        body: 'Every queued call in this campaign has finished.',
        payload: { campaignId: call.campaignId },
      });
    }
  }

  /** Calls for one lead, most recent first — backs the Lead Detail page's
   * call history and recording players. */
  listForLead(leadId: string) {
    return this.prisma.call.findMany({
      where: { leadId },
      select: CALL_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDetail(id: string) {
    const call = await this.prisma.call.findUnique({
      where: { id },
      select: CALL_DETAIL_SELECT,
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    return call;
  }
}
