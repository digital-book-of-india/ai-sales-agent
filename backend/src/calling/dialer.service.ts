import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignStatus } from '../../generated/prisma/enums';
import { CallingQueueService } from './calling-queue.service';
import { CallLockService } from './call-lock.service';
import { CallRateLimiterService } from './call-rate-limiter.service';
import { CallingGateway, type CallEventPayload } from './calling.gateway';
import { CallsService } from './telephony/calls.service';
import { TELEPHONY_PROVIDER } from './telephony/telephony-provider.token';
import type {
  CallMode,
  TelephonyProvider,
} from './telephony/telephony-provider.interface';
import {
  computeAvailableSlots,
  computeRateBudget,
  isWithinCallingHours,
  selectDialCount,
  type CallingHoursConfig,
} from './dialer.util';

export const DIALER_QUEUE = 'dialer';
export const TICK_JOB = 'tick';
export const DIAL_JOB = 'dial';
// 20s, not 5s: this scheduler ticks 24x7 whether or not a campaign is
// running, and each tick burns several Redis commands (BullMQ job-scheduler
// bookkeeping + the dial job it enqueues) — on a request-quota-metered host
// (Upstash free/pay-as-you-go tiers) a 5s cadence exhausts the monthly quota
// fast. 20s keeps dial dispatch responsive while cutting request volume ~4x.
export const TICK_INTERVAL_MS = 20000;

@Injectable()
export class DialerService implements OnModuleInit {
  private readonly logger = new Logger(DialerService.name);

  constructor(
    @InjectQueue(DIALER_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly callingQueue: CallingQueueService,
    private readonly lock: CallLockService,
    private readonly rateLimiter: CallRateLimiterService,
    @Inject(TELEPHONY_PROVIDER) private readonly provider: TelephonyProvider,
    private readonly callsService: CallsService,
    private readonly gateway: CallingGateway,
  ) {}

  /** Registers the recurring scheduler tick job once, on boot. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'dialer-tick',
      { every: TICK_INTERVAL_MS },
      { name: TICK_JOB },
    );
  }

  /** Scheduler tick: for each running campaign, dispatch dial jobs up to
   * its concurrency and calls-per-minute limits. */
  async runTick(): Promise<void> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.RUNNING },
      select: {
        id: true,
        callingHours: true,
        concurrentCalls: true,
        callsPerMinute: true,
      },
    });

    for (const campaign of campaigns) {
      await this.dispatchForCampaign(campaign);
    }
  }

  private async dispatchForCampaign(campaign: {
    id: string;
    callingHours: unknown;
    concurrentCalls: number;
    callsPerMinute: number;
  }): Promise<void> {
    if (
      !isWithinCallingHours(
        campaign.callingHours as CallingHoursConfig,
        new Date(),
      )
    ) {
      return;
    }

    const activeCount = await this.callingQueue.countActive(campaign.id);
    const slots = computeAvailableSlots(campaign.concurrentCalls, activeCount);
    if (slots <= 0) return;

    const used = await this.rateLimiter.getUsage(campaign.id);
    const budget = computeRateBudget(campaign.callsPerMinute, used);
    if (budget <= 0) return;

    const due = await this.callingQueue.findDueForCampaign(
      campaign.id,
      Math.min(slots, budget),
    );
    const dialCount = selectDialCount(slots, budget, due.length);
    if (dialCount <= 0) return;

    const toDispatch = due.slice(0, dialCount);
    await this.rateLimiter.reserve(campaign.id, toDispatch.length);

    await Promise.all(
      toDispatch.map((item) =>
        this.queue.add(
          DIAL_JOB,
          { queueItemId: item.id },
          { jobId: `${DIAL_JOB}-${item.id}-${item.attempts + 1}` },
        ),
      ),
    );
  }

  /**
   * Starts a single calling_queue item's dial attempt and returns — it does
   * not wait for the call to ring, connect, or end. Real telephony reports
   * those transitions asynchronously (a provider webhook, or the mock
   * provider's simulated timeline), and CallsService applies them the same
   * way regardless of source. The lead lock acquired below is therefore
   * released there, on whichever terminal update eventually arrives, not
   * here — see CallsService.applyStatusUpdate / markInitiateFailure.
   */
  async processDial(queueItemId: string): Promise<void> {
    const item = await this.callingQueue.getItem(queueItemId);
    if (!item || (item.status !== 'QUEUED' && item.status !== 'RETRY')) {
      return;
    }

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: item.campaignId },
      select: { status: true, aiAgentId: true },
    });
    if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
      return;
    }

    // Decided once, here, and handed to both CallsService (so it lands on
    // the Call row) and the provider (so it knows what to bridge the
    // answered leg to) — neither of them infers it independently. A
    // campaign with no AI agent configured falls back to MANUAL, ringing
    // the lead's assigned sales rep instead of leaving the call AI-less.
    const callMode: CallMode = campaign.aiAgentId ? 'AI' : 'MANUAL';
    const salesUserId =
      callMode === 'MANUAL' ? (item.lead.assignedToId ?? undefined) : undefined;

    const token = await this.lock.acquire(item.leadId);
    if (!token) {
      this.logger.debug(
        `Lead ${item.leadId} is already being dialed elsewhere`,
      );
      return;
    }

    try {
      const call = await this.callsService.createCall({
        leadId: item.leadId,
        campaignId: item.campaignId,
        queueItemId: item.id,
        provider: this.provider.name,
        lockToken: token,
        callMode,
        salesUserId,
      });
      const dialing = await this.callingQueue.markDialing(item.id, call.id);
      const basePayload: CallEventPayload = {
        queueItemId: item.id,
        leadId: item.leadId,
        leadName: dialing.lead.name,
        campaignId: item.campaignId,
        campaignName: dialing.campaign.name,
        status: 'DIALING',
        attempts: dialing.attempts,
        callId: call.id,
      };
      this.gateway.emitEvent('call.created', basePayload);
      this.gateway.emitEvent('call.dialing', basePayload);

      try {
        const result = await this.provider.initiateCall(
          item.leadId,
          item.campaignId,
          callMode,
          salesUserId,
        );
        await this.callsService.attachProviderCallId(
          call.id,
          result.providerCallId,
        );
      } catch (error) {
        this.logger.error(
          `initiateCall failed for queue item ${item.id}: ${(error as Error).message}`,
        );
        // Provider retried internally and still failed — record this as a
        // failed attempt (retry/backoff or FAILED, same as a real dropped
        // call) and release the lead lock; there is no async webhook coming
        // for a call that never started.
        await this.callsService.markInitiateFailure(call.id);
      }
    } catch (error) {
      // The attempt never got far enough to own the lock's release (no
      // Call row / queue transition committed) — release it directly so it
      // doesn't sit held until its TTL expires.
      this.logger.error(
        `Failed to start dial for queue item ${item.id}: ${(error as Error).message}`,
      );
      await this.lock.release(item.leadId, token);
    }
  }
}
