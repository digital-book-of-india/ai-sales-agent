import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ActivityService } from '../activity/activity.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Role } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { BulkAssignDto } from './dto/bulk-assign.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { AddTagDto } from './dto/add-tag.dto';
import { toCsv } from './import/lead-import.utils';

const EXPORT_SELECT = {
  name: true,
  phone: true,
  alternatePhone: true,
  email: true,
  companyName: true,
  designation: true,
  industry: true,
  city: true,
  state: true,
  source: true,
  status: true,
  priority: true,
  leadScore: true,
  requirement: true,
  budget: true,
  timeline: true,
  tags: true,
  createdAt: true,
  assignedTo: { select: { name: true } },
} satisfies Prisma.LeadSelect;

const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'alternatePhone', label: 'Alternate Phone' },
  { key: 'email', label: 'Email' },
  { key: 'companyName', label: 'Company' },
  { key: 'designation', label: 'Designation' },
  { key: 'industry', label: 'Industry' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'leadScore', label: 'Lead Score' },
  { key: 'requirement', label: 'Requirement' },
  { key: 'budget', label: 'Budget' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'tags', label: 'Tags' },
  { key: 'assignedTo', label: 'Owner' },
  { key: 'createdAt', label: 'Created At' },
];

const LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  companyName: true,
  city: true,
  state: true,
  status: true,
  priority: true,
  leadScore: true,
  tags: true,
  nextFollowUpAt: true,
  lastContactedAt: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true, email: true } },
} satisfies Prisma.LeadSelect;

const DETAIL_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  notes: {
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true } } },
  },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly activityService: ActivityService,
  ) {}

  private scopeWhere(user: AuthenticatedUser): Prisma.LeadWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { assignedToId: user.id };
    }
    return {};
  }

  private canAccess(user: AuthenticatedUser, assignedToId: string | null) {
    return user.role !== Role.SALES_EXECUTIVE || assignedToId === user.id;
  }

  private async assertAssigneeExists(assignedToId: string) {
    const assignee = await this.usersService.findById(assignedToId);
    if (!assignee) {
      throw new NotFoundException('Assignee not found');
    }
  }

  private async getAccessibleLead(user: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      include: DETAIL_INCLUDE,
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (!this.canAccess(user, lead.assignedToId)) {
      throw new ForbiddenException('You do not have access to this lead');
    }

    return lead;
  }

  private buildWhere(
    user: AuthenticatedUser,
    query: QueryLeadsDto,
  ): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...this.scopeWhere(user),
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.assignedTo && user.role !== Role.SALES_EXECUTIVE) {
      where.assignedToId = query.assignedTo;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async findAll(user: AuthenticatedUser, query: QueryLeadsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where = this.buildWhere(user, query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
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
    return this.getAccessibleLead(user, id);
  }

  async create(user: AuthenticatedUser, dto: CreateLeadDto) {
    const assignedToId =
      user.role === Role.SALES_EXECUTIVE ? user.id : dto.assignedToId;

    if (assignedToId && assignedToId !== user.id) {
      await this.assertAssigneeExists(assignedToId);
    }

    return this.prisma.lead.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        alternatePhone: dto.alternatePhone,
        email: dto.email,
        companyName: dto.companyName,
        designation: dto.designation,
        industry: dto.industry,
        city: dto.city,
        state: dto.state,
        source: dto.source,
        status: dto.status,
        priority: dto.priority,
        leadScore: dto.leadScore,
        assignedToId,
        requirement: dto.requirement,
        budget: dto.budget,
        timeline: dto.timeline,
        tags: dto.tags ?? [],
        lastContactedAt: dto.lastContactedAt,
        nextFollowUpAt: dto.nextFollowUpAt,
      },
      include: DETAIL_INCLUDE,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateLeadDto) {
    await this.getAccessibleLead(user, id);

    if (dto.assignedToId !== undefined) {
      if (user.role === Role.SALES_EXECUTIVE) {
        throw new ForbiddenException(
          'Only managers or admins can reassign leads',
        );
      }
      await this.assertAssigneeExists(dto.assignedToId);
    }

    return this.prisma.lead.update({
      where: { id },
      data: { ...dto },
      include: DETAIL_INCLUDE,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getAccessibleLead(user, id);
    await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async bulkAssign(dto: BulkAssignDto) {
    await this.assertAssigneeExists(dto.assignedToId);

    const result = await this.prisma.lead.updateMany({
      where: { id: { in: dto.leadIds }, deletedAt: null },
      data: { assignedToId: dto.assignedToId },
    });

    return { updated: result.count };
  }

  async addNote(user: AuthenticatedUser, id: string, dto: AddNoteDto) {
    await this.getAccessibleLead(user, id);

    await this.prisma.leadNote.create({
      data: { leadId: id, authorId: user.id, body: dto.body },
    });

    return this.getAccessibleLead(user, id);
  }

  async getActivity(user: AuthenticatedUser, id: string) {
    await this.getAccessibleLead(user, id);
    return this.activityService.listForLead(id);
  }

  async addTag(user: AuthenticatedUser, id: string, dto: AddTagDto) {
    const lead = await this.getAccessibleLead(user, id);

    if (lead.tags.includes(dto.tag)) {
      return lead;
    }

    return this.prisma.lead.update({
      where: { id },
      data: { tags: { push: dto.tag } },
      include: DETAIL_INCLUDE,
    });
  }

  async export(user: AuthenticatedUser, query: QueryLeadsDto): Promise<string> {
    const where = this.buildWhere(user, query);
    const leads = await this.prisma.lead.findMany({
      where,
      select: EXPORT_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    const rows = leads.map((lead) => ({
      ...lead,
      tags: lead.tags.join(';'),
      assignedTo: lead.assignedTo?.name ?? '',
      createdAt: lead.createdAt.toISOString(),
      budget: lead.budget ?? '',
    }));

    return toCsv(rows, EXPORT_COLUMNS);
  }
}
