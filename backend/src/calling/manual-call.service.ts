import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallingQueueService } from './calling-queue.service';
import { CallLockService } from './call-lock.service';
import { CallingGateway, type CallEventPayload } from './calling.gateway';
import { CallsService } from './telephony/calls.service';
import { TELEPHONY_PROVIDER } from './telephony/telephony-provider.token';
import type { TelephonyProvider } from './telephony/telephony-provider.interface';
import { CampaignStatus } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

// Every click-to-call attempt is filed under this one always-DRAFT campaign
// rather than a real outbound campaign — DialerService.runTick only ever
// picks up campaigns with status RUNNING (see dialer.service.ts), so this
// row is never touched by the scheduler; it exists purely so Call/
// CallingQueue rows (both FK'd to a campaign — see schema.prisma) have
// somewhere to live for a call that isn't part of any campaign. Reusing
// CallsService/CallingQueueService as-is this way means a manual call's
// post-call flow (recording fetch, queue transitions, websocket events) is
// byte-for-byte the same code path an AI-dialed call goes through — see the
// module docstring on ManualCallService below.
export const MANUAL_CAMPAIGN_NAME = 'Manual Calls';

/**
 * Backs POST /leads/:id/call (click-to-call — see LeadsController). Mirrors
 * DialerService.processDial's shape (acquire the lead lock, create the Call
 * row, mark the queue item DIALING, hand off to the provider) but runs
 * synchronously from an HTTP request instead of a BullMQ job, and always
 * dials callMode 'MANUAL' with the requesting user as salesUserId — there
 * is no campaign/AI-agent lookup to decide callMode here, the rep clicking
 * "Call" *is* the decision.
 *
 * Everything downstream of initiateCall (status websocket events, recording
 * fetch, lead-lock release) flows through the exact same CallsService used
 * by the dialer — see CallsService.applyStatusUpdate — so a manual call's
 * post-call CRM automation is identical to an AI call's, as required.
 */
@Injectable()
export class ManualCallService {
  private readonly logger = new Logger(ManualCallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callingQueue: CallingQueueService,
    private readonly lock: CallLockService,
    @Inject(TELEPHONY_PROVIDER) private readonly provider: TelephonyProvider,
    private readonly callsService: CallsService,
    private readonly gateway: CallingGateway,
  ) {}

  async initiateCall(
    user: AuthenticatedUser,
    leadId: string,
  ): Promise<{ callId: string; queueItemId: string; campaignId: string }> {
    const [lead, caller] = await Promise.all([
      this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { sipExtension: true },
      }),
    ]);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (!caller?.sipExtension) {
      throw new ConflictException(
        'Register a SIP extension for your account before placing calls',
      );
    }

    const campaign = await this.getOrCreateManualCampaign();
    const queueItem = await this.callingQueue.getOrCreateItem(
      campaign.id,
      leadId,
    );

    const token = await this.lock.acquire(leadId);
    if (!token) {
      throw new ConflictException('This lead is already being called');
    }

    try {
      const call = await this.callsService.createCall({
        leadId,
        campaignId: campaign.id,
        queueItemId: queueItem.id,
        provider: this.provider.name,
        lockToken: token,
        callMode: 'MANUAL',
        salesUserId: user.id,
      });

      const dialing = await this.callingQueue.markDialing(
        queueItem.id,
        call.id,
      );
      const basePayload: CallEventPayload = {
        queueItemId: queueItem.id,
        leadId,
        leadName: dialing.lead.name,
        campaignId: campaign.id,
        campaignName: dialing.campaign.name,
        status: 'DIALING',
        attempts: dialing.attempts,
        callId: call.id,
      };
      this.gateway.emitEvent('call.created', basePayload);
      this.gateway.emitEvent('call.dialing', basePayload);

      try {
        const result = await this.provider.initiateCall(
          leadId,
          campaign.id,
          'MANUAL',
          user.id,
        );
        await this.callsService.attachProviderCallId(
          call.id,
          result.providerCallId,
        );
      } catch (error) {
        this.logger.error(
          `initiateCall failed for lead ${leadId}: ${(error as Error).message}`,
        );
        // Same as DialerService.processDial: the provider retried internally
        // and still failed, so there is no async webhook coming for a call
        // that never started — record it as a failed attempt now.
        await this.callsService.markInitiateFailure(call.id);
      }

      return {
        callId: call.id,
        queueItemId: queueItem.id,
        campaignId: campaign.id,
      };
    } catch (error) {
      // The attempt never got far enough to own the lock's release (no Call
      // row / queue transition committed) — release it directly so it
      // doesn't sit held until its TTL expires.
      this.logger.error(
        `Failed to start manual call for lead ${leadId}: ${(error as Error).message}`,
      );
      await this.lock.release(leadId, token);
      throw error;
    }
  }

  /**
   * Idempotent-ish: findFirst-or-create, ordered so every caller converges
   * on the earliest such row if more than one somehow exists. Campaign.name
   * has no unique constraint, so two reps clicking "Call" for the very
   * first time at the exact same instant could each create one — a
   * harmless, extremely unlikely race (worst case: two "Manual Calls" rows,
   * cosmetic only) not worth a schema change to prevent.
   */
  private async getOrCreateManualCampaign(): Promise<{ id: string }> {
    const existing = await this.prisma.campaign.findFirst({
      where: { name: MANUAL_CAMPAIGN_NAME },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) return existing;

    return this.prisma.campaign.create({
      data: {
        name: MANUAL_CAMPAIGN_NAME,
        objective:
          'System campaign — houses click-to-call attempts placed directly from a lead. Never dialed by the scheduler.',
        status: CampaignStatus.DRAFT,
        recordingConsent: true,
      },
      select: { id: true },
    });
  }
}
