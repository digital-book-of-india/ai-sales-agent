import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { LeadFiltersDto } from './dto/lead-filters.dto';
import { CallingQueueService } from '../calling/calling-queue.service';

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  objective: true,
  aiAgentId: true,
  leadFilters: true,
  callingHours: true,
  maxAttempts: true,
  retryInterval: true,
  concurrentCalls: true,
  callsPerMinute: true,
  startDate: true,
  endDate: true,
  recordingConsent: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { campaignLeads: true } },
} satisfies Prisma.CampaignSelect;

const START_ALLOWED: CampaignStatus[] = [
  CampaignStatus.DRAFT,
  CampaignStatus.SCHEDULED,
  CampaignStatus.PAUSED,
  CampaignStatus.STOPPED,
];
const PAUSE_ALLOWED: CampaignStatus[] = [CampaignStatus.RUNNING];
const RESUME_ALLOWED: CampaignStatus[] = [CampaignStatus.PAUSED];
const STOP_ALLOWED: CampaignStatus[] = [
  CampaignStatus.SCHEDULED,
  CampaignStatus.RUNNING,
  CampaignStatus.PAUSED,
];

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly callingQueueService: CallingQueueService,
  ) {}

  private async getCampaignOrThrow(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: LIST_SELECT,
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private buildWhere(query: QueryCampaignsDto): Prisma.CampaignWhereInput {
    const where: Prisma.CampaignWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    return where;
  }

  private buildLeadFilterWhere(filters: LeadFiltersDto): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = { deletedAt: null };

    if (filters.statuses?.length) {
      where.status = { in: filters.statuses };
    }
    if (filters.sources?.length) {
      where.source = { in: filters.sources };
    }
    if (filters.tags?.length) {
      where.tags = { hasSome: filters.tags };
    }

    return where;
  }

  private hasFilterCriteria(
    filters?: LeadFiltersDto,
  ): filters is LeadFiltersDto {
    return !!(
      filters &&
      (filters.statuses?.length ||
        filters.sources?.length ||
        filters.tags?.length)
    );
  }

  private async syncCampaignLeads(
    campaignId: string,
    filters?: LeadFiltersDto,
  ) {
    if (!this.hasFilterCriteria(filters)) {
      return;
    }

    const matches = await this.prisma.lead.findMany({
      where: this.buildLeadFilterWhere(filters),
      select: { id: true },
    });
    const leadIds = matches.map((lead) => lead.id);

    await this.prisma.campaignLead.deleteMany({
      where: { campaignId, leadId: { notIn: leadIds } },
    });

    if (leadIds.length) {
      await this.prisma.campaignLead.createMany({
        data: leadIds.map((leadId) => ({ campaignId, leadId })),
        skipDuplicates: true,
      });
    }
  }

  async findAll(query: QueryCampaignsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  findOne(id: string) {
    return this.getCampaignOrThrow(id);
  }

  async create(dto: CreateCampaignDto) {
    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name,
        description: dto.description,
        objective: dto.objective,
        aiAgentId: dto.aiAgentId,
        leadFilters: (dto.leadFilters ?? {}) as Prisma.InputJsonValue,
        callingHours: (dto.callingHours ?? {}) as Prisma.InputJsonValue,
        maxAttempts: dto.maxAttempts,
        retryInterval: dto.retryInterval,
        concurrentCalls: dto.concurrentCalls,
        callsPerMinute: dto.callsPerMinute,
        startDate: dto.startDate,
        endDate: dto.endDate,
        recordingConsent: dto.recordingConsent,
      },
      select: LIST_SELECT,
    });

    await this.syncCampaignLeads(campaign.id, dto.leadFilters);

    return this.getCampaignOrThrow(campaign.id);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    await this.getCampaignOrThrow(id);

    await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        objective: dto.objective,
        aiAgentId: dto.aiAgentId,
        leadFilters: dto.leadFilters
          ? (dto.leadFilters as Prisma.InputJsonValue)
          : undefined,
        callingHours: dto.callingHours
          ? (dto.callingHours as Prisma.InputJsonValue)
          : undefined,
        maxAttempts: dto.maxAttempts,
        retryInterval: dto.retryInterval,
        concurrentCalls: dto.concurrentCalls,
        callsPerMinute: dto.callsPerMinute,
        startDate: dto.startDate,
        endDate: dto.endDate,
        recordingConsent: dto.recordingConsent,
      },
    });

    if (dto.leadFilters) {
      await this.syncCampaignLeads(id, dto.leadFilters);
    }

    return this.getCampaignOrThrow(id);
  }

  async remove(id: string) {
    await this.getCampaignOrThrow(id);
    await this.prisma.campaign.delete({ where: { id } });
  }

  async duplicate(id: string) {
    const original = await this.getCampaignOrThrow(id);

    const copy = await this.prisma.campaign.create({
      data: {
        name: `${original.name} (Copy)`,
        description: original.description,
        objective: original.objective,
        aiAgentId: original.aiAgentId,
        leadFilters: original.leadFilters as Prisma.InputJsonValue,
        callingHours: original.callingHours as Prisma.InputJsonValue,
        maxAttempts: original.maxAttempts,
        retryInterval: original.retryInterval,
        concurrentCalls: original.concurrentCalls,
        callsPerMinute: original.callsPerMinute,
        startDate: original.startDate,
        endDate: original.endDate,
        recordingConsent: original.recordingConsent,
        status: CampaignStatus.DRAFT,
      },
      select: LIST_SELECT,
    });

    const leads = await this.prisma.campaignLead.findMany({
      where: { campaignId: id },
      select: { leadId: true },
    });

    if (leads.length) {
      await this.prisma.campaignLead.createMany({
        data: leads.map(({ leadId }) => ({ campaignId: copy.id, leadId })),
        skipDuplicates: true,
      });
    }

    return this.getCampaignOrThrow(copy.id);
  }

  private async transition(
    id: string,
    allowedFrom: CampaignStatus[],
    action: string,
    resolveStatus: (campaign: { startDate: Date | null }) => CampaignStatus,
  ) {
    const campaign = await this.getCampaignOrThrow(id);

    if (!allowedFrom.includes(campaign.status)) {
      throw new BadRequestException(
        `Cannot ${action} a campaign with status ${campaign.status}`,
      );
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: resolveStatus(campaign) },
    });

    return this.getCampaignOrThrow(id);
  }

  async start(id: string) {
    const campaign = await this.getCampaignOrThrow(id);

    if (!START_ALLOWED.includes(campaign.status)) {
      throw new BadRequestException(
        `Cannot start a campaign with status ${campaign.status}`,
      );
    }

    const targetStatus =
      campaign.startDate && campaign.startDate > new Date()
        ? CampaignStatus.SCHEDULED
        : CampaignStatus.RUNNING;

    await this.prisma.campaign.update({
      where: { id },
      data: { status: targetStatus },
    });

    if (targetStatus === CampaignStatus.RUNNING) {
      await this.callingQueueService.enqueueCampaign(id, campaign.maxAttempts);
    }

    return this.getCampaignOrThrow(id);
  }

  pause(id: string) {
    return this.transition(
      id,
      PAUSE_ALLOWED,
      'pause',
      () => CampaignStatus.PAUSED,
    );
  }

  resume(id: string) {
    return this.transition(
      id,
      RESUME_ALLOWED,
      'resume',
      () => CampaignStatus.RUNNING,
    );
  }

  stop(id: string) {
    return this.transition(
      id,
      STOP_ALLOWED,
      'stop',
      () => CampaignStatus.STOPPED,
    );
  }

  async stats(id: string) {
    await this.getCampaignOrThrow(id);

    const [leads, callStats] = await Promise.all([
      this.prisma.campaignLead.count({ where: { campaignId: id } }),
      this.callingQueueService.getCampaignStats(id),
    ]);

    const conversion =
      leads > 0 ? Math.round((callStats.connected / leads) * 100) : 0;

    return {
      leads,
      attempted: callStats.attempted,
      connected: callStats.connected,
      noAnswer: callStats.noAnswer,
      busy: callStats.busy,
      failed: callStats.failed,
      // Not derivable from the calling queue alone — these depend on
      // lead status/outcome tracking that hasn't been built yet.
      interested: 0,
      hotLeads: 0,
      meetings: 0,
      conversion,
      avgCallDuration: callStats.avgCallDuration,
    };
  }
}
