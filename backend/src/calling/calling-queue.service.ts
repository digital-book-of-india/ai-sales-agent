import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallingQueueStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { QueryCallingQueueDto } from './dto/query-calling-queue.dto';

const ACTIVE_STATUSES: CallingQueueStatus[] = [
  CallingQueueStatus.DIALING,
  CallingQueueStatus.RINGING,
  CallingQueueStatus.CONNECTED,
];

const TERMINAL_STATUSES: CallingQueueStatus[] = [
  CallingQueueStatus.COMPLETED,
  CallingQueueStatus.FAILED,
  CallingQueueStatus.CANCELLED,
  CallingQueueStatus.SKIPPED,
];

const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  companyName: true,
  // Read by DialerService to fill in salesUserId when it decides a dial
  // attempt is callMode MANUAL — see DialerService.processDial.
  assignedToId: true,
} satisfies Prisma.LeadSelect;

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.CampaignSelect;

const QUEUE_ITEM_SELECT = {
  id: true,
  leadId: true,
  campaignId: true,
  priority: true,
  status: true,
  attempts: true,
  maxAttempts: true,
  scheduledAt: true,
  nextRetryAt: true,
  lastAttemptAt: true,
  callId: true,
  createdAt: true,
  updatedAt: true,
  lead: { select: LEAD_SELECT },
  campaign: { select: CAMPAIGN_SELECT },
} satisfies Prisma.CallingQueueSelect;

export type QueueItemWithRelations = Prisma.CallingQueueGetPayload<{
  select: typeof QUEUE_ITEM_SELECT;
}>;

@Injectable()
export class CallingQueueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enqueue every lead currently attached to the campaign. Leads already
   * in a terminal state from a prior run are reset so a restart re-dials
   * them; leads that were never enqueued are created fresh. Both groups
   * land on PENDING first, then flip to QUEUED — mirroring the campaign
   * start state machine.
   */
  async enqueueCampaign(campaignId: string, maxAttempts: number) {
    await this.prisma.callingQueue.updateMany({
      where: { campaignId, status: { in: TERMINAL_STATUSES } },
      data: {
        status: CallingQueueStatus.PENDING,
        attempts: 0,
        nextRetryAt: null,
        lastAttemptAt: null,
        callId: null,
        scheduledAt: new Date(),
      },
    });

    const campaignLeads = await this.prisma.campaignLead.findMany({
      where: { campaignId },
      select: { leadId: true },
    });

    if (campaignLeads.length) {
      await this.prisma.callingQueue.createMany({
        data: campaignLeads.map(({ leadId }) => ({
          campaignId,
          leadId,
          maxAttempts,
          status: CallingQueueStatus.PENDING,
        })),
        skipDuplicates: true,
      });
    }

    await this.prisma.callingQueue.updateMany({
      where: { campaignId, status: CallingQueueStatus.PENDING },
      data: { status: CallingQueueStatus.QUEUED },
    });
  }

  async listQueue(query: QueryCallingQueueDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.CallingQueueWhereInput = {
      campaignId: query.campaignId,
      status: query.status,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.callingQueue.findMany({
        where,
        select: QUEUE_ITEM_SELECT,
        orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.callingQueue.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  getLiveCalls(campaignId?: string) {
    return this.prisma.callingQueue.findMany({
      where: { campaignId, status: { in: ACTIVE_STATUSES } },
      select: QUEUE_ITEM_SELECT,
      orderBy: { lastAttemptAt: 'desc' },
    });
  }

  findDueForCampaign(campaignId: string, limit: number) {
    return this.prisma.callingQueue.findMany({
      where: {
        campaignId,
        OR: [
          { status: CallingQueueStatus.QUEUED },
          {
            status: CallingQueueStatus.RETRY,
            nextRetryAt: { lte: new Date() },
          },
        ],
      },
      orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
      take: limit,
    });
  }

  countActive(campaignId: string) {
    return this.prisma.callingQueue.count({
      where: { campaignId, status: { in: ACTIVE_STATUSES } },
    });
  }

  getItem(id: string) {
    return this.prisma.callingQueue.findUnique({
      where: { id },
      select: QUEUE_ITEM_SELECT,
    });
  }

  /**
   * Used by click-to-call (see ManualCallService), not the dialer tick.
   * @@unique([campaignId, leadId]) means there is at most one row per
   * lead within a campaign, so a rep calling the same lead a second time
   * reuses that row rather than colliding on the constraint — markDialing
   * doesn't check its prior status (unlike processDial's QUEUED/RETRY
   * guard), so reusing a COMPLETED/FAILED row here is safe.
   */
  getOrCreateItem(campaignId: string, leadId: string) {
    return this.prisma.callingQueue.upsert({
      where: { campaignId_leadId: { campaignId, leadId } },
      update: {},
      create: { campaignId, leadId, maxAttempts: 1 },
      select: QUEUE_ITEM_SELECT,
    });
  }

  /**
   * Used by the follow-up scheduler (see FollowUpsService.processDue) to put
   * a lead back in front of the dialer once its callback comes due. Unlike
   * getOrCreateItem (click-to-call — a single deliberate attempt),
   * this resets the row to QUEUED even if it's sitting in a terminal state
   * from an earlier cycle: the same lead can rack up many follow-ups over
   * time, all funneled through the one calling_queue row this campaign/lead
   * pair owns (@@unique([campaignId, leadId])), so each due follow-up must
   * be able to re-arm it for another attempt.
   */
  requeueForFollowUp(campaignId: string, leadId: string) {
    return this.prisma.callingQueue.upsert({
      where: { campaignId_leadId: { campaignId, leadId } },
      create: {
        campaignId,
        leadId,
        maxAttempts: 1,
        status: CallingQueueStatus.QUEUED,
      },
      update: {
        status: CallingQueueStatus.QUEUED,
        attempts: 0,
        nextRetryAt: null,
        lastAttemptAt: null,
        callId: null,
        scheduledAt: new Date(),
      },
      select: QUEUE_ITEM_SELECT,
    });
  }

  markDialing(id: string, callId: string) {
    return this.prisma.callingQueue.update({
      where: { id },
      data: {
        status: CallingQueueStatus.DIALING,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        callId,
      },
      select: QUEUE_ITEM_SELECT,
    });
  }

  setStatus(id: string, status: CallingQueueStatus) {
    return this.prisma.callingQueue.update({
      where: { id },
      data: { status },
      select: QUEUE_ITEM_SELECT,
    });
  }

  /** Outcome was CONNECTED and the call has now ended normally. */
  completeCall(id: string) {
    return this.prisma.callingQueue.update({
      where: { id },
      data: { status: CallingQueueStatus.COMPLETED },
      select: QUEUE_ITEM_SELECT,
    });
  }

  /**
   * A dial attempt came back NO_ANSWER or BUSY. Records that outcome on
   * the row, then either schedules a retry per `retryInterval` (minutes)
   * or, once `maxAttempts` is reached, marks the item FAILED.
   */
  async recordFailedAttempt(
    id: string,
    outcome:
      | typeof CallingQueueStatus.NO_ANSWER
      | typeof CallingQueueStatus.BUSY
      | typeof CallingQueueStatus.FAILED,
    retryIntervalMinutes: number,
  ) {
    const item = await this.prisma.callingQueue.update({
      where: { id },
      data: { status: outcome },
      select: { attempts: true, maxAttempts: true },
    });

    if (item.attempts >= item.maxAttempts) {
      return this.prisma.callingQueue.update({
        where: { id },
        data: { status: CallingQueueStatus.FAILED },
        select: QUEUE_ITEM_SELECT,
      });
    }

    return this.prisma.callingQueue.update({
      where: { id },
      data: {
        status: CallingQueueStatus.RETRY,
        nextRetryAt: new Date(Date.now() + retryIntervalMinutes * 60_000),
      },
      select: QUEUE_ITEM_SELECT,
    });
  }

  /** True once every item in the campaign has reached a terminal state
   * (see TERMINAL_STATUSES) — nothing left PENDING/QUEUED/RETRY or
   * currently in flight. Checked by CallsService.finish right after it
   * finalizes a call, so it only ever flips to true on the one attempt
   * that empties the campaign out, firing CAMPAIGN_COMPLETED exactly
   * once rather than needing separate dedup state. */
  isCampaignExhausted(campaignId: string): Promise<boolean> {
    return this.prisma.callingQueue
      .count({ where: { campaignId, status: { notIn: TERMINAL_STATUSES } } })
      .then((count) => count === 0);
  }

  /** Total FAILED items for a campaign — read by CallsService.finish right
   * after a fresh failure to decide whether the campaign just crossed
   * NotificationsConfig.failedCallsThreshold. */
  countFailed(campaignId: string): Promise<number> {
    return this.prisma.callingQueue.count({
      where: { campaignId, status: CallingQueueStatus.FAILED },
    });
  }

  /** Real call-outcome counts for a campaign's "Stats" panel. */
  async getCampaignStats(campaignId: string) {
    const [statusCounts, completed] = await Promise.all([
      this.prisma.callingQueue.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { _all: true },
      }),
      this.prisma.callingQueue.findMany({
        where: {
          campaignId,
          status: CallingQueueStatus.COMPLETED,
          lastAttemptAt: { not: null },
        },
        select: { lastAttemptAt: true, updatedAt: true },
      }),
    ]);

    const countOf = (status: CallingQueueStatus) =>
      statusCounts.find((s) => s.status === status)?._count._all ?? 0;

    const total = statusCounts.reduce((sum, s) => sum + s._count._all, 0);
    const notYetAttempted =
      countOf(CallingQueueStatus.PENDING) + countOf(CallingQueueStatus.QUEUED);

    // Duration approximated from the final attempt's start (lastAttemptAt)
    // to when the row was marked COMPLETED (updatedAt); the queue table
    // has no dedicated duration column.
    const durationsSec = completed
      .filter((c) => c.lastAttemptAt)
      .map((c) => (c.updatedAt.getTime() - c.lastAttemptAt!.getTime()) / 1000)
      .filter((seconds) => seconds >= 0);
    const avgCallDuration = durationsSec.length
      ? Math.round(
          durationsSec.reduce((a, b) => a + b, 0) / durationsSec.length,
        )
      : 0;

    return {
      attempted: total - notYetAttempted,
      connected:
        countOf(CallingQueueStatus.CONNECTED) +
        countOf(CallingQueueStatus.COMPLETED),
      noAnswer: countOf(CallingQueueStatus.NO_ANSWER),
      busy: countOf(CallingQueueStatus.BUSY),
      failed: countOf(CallingQueueStatus.FAILED),
      avgCallDuration,
    };
  }
}
