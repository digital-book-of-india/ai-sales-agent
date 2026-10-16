import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CallingQueueService } from '../calling/calling-queue.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CampaignStatus,
  FollowUpStatus,
  NotificationType,
  Role,
} from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { QueryFollowUpsDto } from './dto/query-follow-ups.dto';

export const FOLLOW_UPS_QUEUE = 'follow-ups';
export const FOLLOW_UPS_TICK_JOB = 'check-due-follow-ups';
// A due callback landing up to 5 minutes late is harmless (unlike the
// dialer's TICK_INTERVAL_MS, nothing here is racing a live call), so this
// stays coarse to keep Redis command volume low on a request-quota-metered
// host — see dialer.service.ts's TICK_INTERVAL_MS comment for the same
// reasoning applied to a tighter budget.
export const FOLLOW_UPS_TICK_INTERVAL_MS = 5 * 60 * 1000;

// Every auto-requeued follow-up is filed under this one always-RUNNING
// system campaign rather than whatever campaign the original call came
// from — a follow-up can fire long after that campaign finished/was
// stopped, and calling_queue rows are FK'd to a campaign (see
// schema.prisma), so this gives them somewhere stable to live. RUNNING
// (unlike ManualCallService's DRAFT "Manual Calls" campaign) so
// DialerService.runTick actually picks these up and dials them — see
// dialer.service.ts.
export const FOLLOW_UP_CAMPAIGN_NAME = 'Follow-ups';

const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  companyName: true,
  assignedToId: true,
} satisfies Prisma.LeadSelect;

const FOLLOW_UP_SELECT = {
  id: true,
  leadId: true,
  dueAt: true,
  reason: true,
  status: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  lead: { select: LEAD_SELECT },
  creator: { select: { id: true, name: true } },
} satisfies Prisma.FollowUpSelect;

/**
 * Owns the `follow_ups` table (Prompt 14): manual CRUD (this service),
 * automatic creation from a callback request detected in a call transcript
 * (see CallAnalysisService.createFollowUpIfRequested, which writes directly
 * via PrismaService rather than through here — see follow-up-extractor.util.ts
 * for why that stays a one-way dependency), and the scheduled job that
 * re-enters a lead into the calling_queue once its follow-up comes due.
 */
@Injectable()
export class FollowUpsService implements OnModuleInit {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callingQueue: CallingQueueService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    @InjectQueue(FOLLOW_UPS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Registers the recurring due-check job once, on boot — mirrors
   * DialerService.onModuleInit. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'follow-ups-tick',
      { every: FOLLOW_UPS_TICK_INTERVAL_MS },
      { name: FOLLOW_UPS_TICK_JOB },
    );
  }

  private scopeWhere(user: AuthenticatedUser): Prisma.FollowUpWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { lead: { assignedToId: user.id } };
    }
    return {};
  }

  private canAccess(user: AuthenticatedUser, assignedToId: string | null) {
    return user.role !== Role.SALES_EXECUTIVE || assignedToId === user.id;
  }

  private async getAccessible(user: AuthenticatedUser, id: string) {
    const followUp = await this.prisma.followUp.findUnique({
      where: { id },
      select: FOLLOW_UP_SELECT,
    });
    if (!followUp) {
      throw new NotFoundException('Follow-up not found');
    }
    if (!this.canAccess(user, followUp.lead.assignedToId)) {
      throw new ForbiddenException('You do not have access to this follow-up');
    }
    return followUp;
  }

  async findAll(user: AuthenticatedUser, query: QueryFollowUpsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.FollowUpWhereInput = {
      ...this.scopeWhere(user),
      leadId: query.leadId,
      status: query.status,
    };
    if (query.from || query.to) {
      where.dueAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.followUp.findMany({
        where,
        select: FOLLOW_UP_SELECT,
        orderBy: { dueAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.followUp.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  findOne(user: AuthenticatedUser, id: string) {
    return this.getAccessible(user, id);
  }

  private async assertLeadAccessible(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { assignedToId: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (!this.canAccess(user, lead.assignedToId)) {
      throw new ForbiddenException('You do not have access to this lead');
    }
  }

  async create(user: AuthenticatedUser, dto: CreateFollowUpDto) {
    await this.assertLeadAccessible(user, dto.leadId);

    const followUp = await this.prisma.followUp.create({
      data: {
        leadId: dto.leadId,
        dueAt: new Date(dto.dueAt),
        reason: dto.reason,
        createdBy: user.id,
      },
      select: FOLLOW_UP_SELECT,
    });

    await this.activity.record({
      leadId: dto.leadId,
      type: 'FOLLOW_UP_SCHEDULED',
      payload: { followUpId: followUp.id, reason: followUp.reason },
      actorUserId: user.id,
    });

    return followUp;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateFollowUpDto) {
    await this.getAccessible(user, id);

    return this.prisma.followUp.update({
      where: { id },
      data: {
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        reason: dto.reason,
        status: dto.status,
      },
      select: FOLLOW_UP_SELECT,
    });
  }

  async complete(user: AuthenticatedUser, id: string) {
    await this.getAccessible(user, id);
    return this.prisma.followUp.update({
      where: { id },
      data: { status: FollowUpStatus.DONE },
      select: FOLLOW_UP_SELECT,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getAccessible(user, id);
    await this.prisma.followUp.delete({ where: { id } });
  }

  /** "Follow-ups due" widget on the Dashboard — every PENDING follow-up
   * already at/past its dueAt, scoped the same way as everything else. */
  listDue(user: AuthenticatedUser, limit = 10) {
    return this.prisma.followUp.findMany({
      where: {
        ...this.scopeWhere(user),
        status: FollowUpStatus.PENDING,
        dueAt: { lte: new Date() },
      },
      select: FOLLOW_UP_SELECT,
      orderBy: { dueAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Worker entry point (see FollowUpsProcessor): finds every PENDING
   * follow-up whose dueAt has passed, re-enters that lead into the
   * calling_queue under the system "Follow-ups" campaign, and marks the
   * follow-up DONE — DONE here means "acted on" (the lead is back in the
   * dialer's hands), not "the callback happened"; that outcome is tracked
   * by the resulting Call/CallingQueue rows, same separation of concerns as
   * everywhere else in this app.
   */
  async processDue(): Promise<void> {
    const due = await this.prisma.followUp.findMany({
      where: { status: FollowUpStatus.PENDING, dueAt: { lte: new Date() } },
      select: {
        id: true,
        leadId: true,
        reason: true,
        lead: { select: { name: true, assignedToId: true } },
      },
    });
    if (due.length === 0) return;

    const campaign = await this.getOrCreateFollowUpCampaign();

    for (const item of due) {
      try {
        await this.callingQueue.requeueForFollowUp(campaign.id, item.leadId);
        await this.prisma.followUp.update({
          where: { id: item.id },
          data: { status: FollowUpStatus.DONE },
        });
        await this.activity.record({
          leadId: item.leadId,
          type: 'FOLLOW_UP_DUE',
          payload: { followUpId: item.id, reason: item.reason },
        });

        const recipientId = await this.notifications.resolveLeadRecipient(
          item.lead.assignedToId,
        );
        if (recipientId) {
          await this.notifications.create({
            userId: recipientId,
            type: NotificationType.FOLLOW_UP_DUE,
            leadId: item.leadId,
            title: `Follow-up due: ${item.lead.name}`,
            body: item.reason,
            payload: { followUpId: item.id },
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to requeue follow-up ${item.id} for lead ${item.leadId}: ${(error as Error).message}`,
        );
      }
    }
  }

  /** Idempotent-ish findFirst-or-create, same posture as
   * ManualCallService.getOrCreateManualCampaign. */
  private async getOrCreateFollowUpCampaign(): Promise<{ id: string }> {
    const existing = await this.prisma.campaign.findFirst({
      where: { name: FOLLOW_UP_CAMPAIGN_NAME },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existing) return existing;

    return this.prisma.campaign.create({
      data: {
        name: FOLLOW_UP_CAMPAIGN_NAME,
        objective:
          'System campaign — houses leads re-queued once a scheduled follow-up comes due. Always RUNNING so the dialer picks them up.',
        status: CampaignStatus.RUNNING,
        recordingConsent: true,
      },
      select: { id: true },
    });
  }
}
