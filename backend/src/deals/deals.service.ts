import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, Role } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { MoveDealDto } from './dto/move-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';

const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  companyName: true,
  assignedToId: true,
} satisfies Prisma.LeadSelect;

const DEAL_SELECT = {
  id: true,
  leadId: true,
  ownerId: true,
  value: true,
  probability: true,
  stageId: true,
  expectedCloseDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  lead: { select: LEAD_SELECT },
  owner: { select: { id: true, name: true } },
  stage: { select: { id: true, name: true, order: true } },
} satisfies Prisma.DealSelect;

/**
 * Owns the `deals` table (Prompt 15): CRUD plus the stage-move endpoint that
 * backs the Pipeline Kanban board's drag-and-drop.
 */
@Injectable()
export class DealsService {
  // The pipeline stage that means a deal is closed-won — matches the seeded
  // PipelineStage row of the same name (see prisma/seed.ts's PIPELINE_STAGES),
  // not a dedicated enum: stage names are admin-editable free text, so this
  // is the one name moveStage treats as significant rather than just another
  // column.
  private static readonly WON_STAGE_NAME = 'WON';

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private scopeWhere(user: AuthenticatedUser): Prisma.DealWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { ownerId: user.id };
    }
    return {};
  }

  private canAccess(user: AuthenticatedUser, ownerId: string) {
    return user.role !== Role.SALES_EXECUTIVE || ownerId === user.id;
  }

  private async getAccessible(user: AuthenticatedUser, id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      select: DEAL_SELECT,
    });
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    if (!this.canAccess(user, deal.ownerId)) {
      throw new ForbiddenException('You do not have access to this deal');
    }
    return deal;
  }

  private async assertLeadAccessible(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { assignedToId: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (
      user.role === Role.SALES_EXECUTIVE &&
      lead.assignedToId !== user.id
    ) {
      throw new ForbiddenException('You do not have access to this lead');
    }
  }

  private async firstStageId(): Promise<string> {
    const stage = await this.prisma.pipelineStage.findFirst({
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    if (!stage) {
      throw new BadRequestException(
        'No pipeline stages configured — run the seed script first',
      );
    }
    return stage.id;
  }

  async findAll(user: AuthenticatedUser, query: QueryDealsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    const where: Prisma.DealWhereInput = {
      ...this.scopeWhere(user),
      leadId: query.leadId,
      stageId: query.stageId,
    };
    if (
      query.ownerId &&
      user.role !== Role.SALES_EXECUTIVE
    ) {
      where.ownerId = query.ownerId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where,
        select: DEAL_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deal.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Every stage with its deals nested, ordered for the Kanban board — a
   * `stage.deals` array is never empty->undefined, so the frontend can
   * render every column (including empty ones) without extra branching. */
  async board(user: AuthenticatedUser) {
    const stages = await this.prisma.pipelineStage.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        order: true,
        deals: {
          where: this.scopeWhere(user),
          select: DEAL_SELECT,
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    return stages;
  }

  findOne(user: AuthenticatedUser, id: string) {
    return this.getAccessible(user, id);
  }

  async create(user: AuthenticatedUser, dto: CreateDealDto) {
    await this.assertLeadAccessible(user, dto.leadId);

    const ownerId =
      user.role === Role.SALES_EXECUTIVE ? user.id : (dto.ownerId ?? user.id);
    const stageId = dto.stageId ?? (await this.firstStageId());

    const deal = await this.prisma.deal.create({
      data: {
        leadId: dto.leadId,
        ownerId,
        value: dto.value,
        probability: dto.probability ?? 0,
        stageId,
        expectedCloseDate: dto.expectedCloseDate
          ? new Date(dto.expectedCloseDate)
          : undefined,
        notes: dto.notes,
      },
      select: DEAL_SELECT,
    });

    await this.activity.record({
      leadId: dto.leadId,
      type: 'DEAL_CREATED',
      payload: { dealId: deal.id, value: deal.value, stage: deal.stage.name },
      actorUserId: user.id,
    });

    return deal;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateDealDto) {
    const existing = await this.getAccessible(user, id);

    if (
      dto.ownerId &&
      dto.ownerId !== existing.ownerId &&
      user.role === Role.SALES_EXECUTIVE
    ) {
      throw new ForbiddenException(
        'Only managers or admins can reassign a deal',
      );
    }

    return this.prisma.deal.update({
      where: { id },
      data: {
        ownerId: dto.ownerId,
        value: dto.value,
        probability: dto.probability,
        expectedCloseDate: dto.expectedCloseDate
          ? new Date(dto.expectedCloseDate)
          : undefined,
        notes: dto.notes,
      },
      select: DEAL_SELECT,
    });
  }

  /** Kanban drag-and-drop: move a deal to a different stage. Validates the
   * target stage exists (a stale/forged id from the client shouldn't 500 on
   * the FK constraint) and logs a DEAL_STAGE_CHANGED activity entry. */
  async moveStage(user: AuthenticatedUser, id: string, dto: MoveDealDto) {
    const existing = await this.getAccessible(user, id);

    const targetStage = await this.prisma.pipelineStage.findUnique({
      where: { id: dto.stageId },
      select: { id: true, name: true },
    });
    if (!targetStage) {
      throw new NotFoundException('Pipeline stage not found');
    }

    const deal = await this.prisma.deal.update({
      where: { id },
      data: { stageId: dto.stageId },
      select: DEAL_SELECT,
    });

    await this.activity.record({
      leadId: existing.leadId,
      type: 'DEAL_STAGE_CHANGED',
      payload: {
        dealId: deal.id,
        fromStage: existing.stage.name,
        toStage: targetStage.name,
      },
      actorUserId: user.id,
    });

    if (
      targetStage.name === DealsService.WON_STAGE_NAME &&
      existing.stage.name !== DealsService.WON_STAGE_NAME
    ) {
      await this.notifications.create({
        userId: deal.ownerId,
        type: NotificationType.DEAL_WON,
        leadId: existing.leadId,
        title: `Deal won: ${existing.lead.name}`,
        body: `₹${deal.value.toLocaleString('en-IN')} deal moved to Won.`,
        payload: { dealId: deal.id, value: deal.value },
      });
    }

    return deal;
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getAccessible(user, id);
    await this.prisma.deal.delete({ where: { id } });
  }
}
