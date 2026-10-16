import {
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
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { QueryMeetingsDto } from './dto/query-meetings.dto';

const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  companyName: true,
  assignedToId: true,
} satisfies Prisma.LeadSelect;

const MEETING_SELECT = {
  id: true,
  leadId: true,
  date: true,
  time: true,
  salespersonId: true,
  meetingType: true,
  meetingLink: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lead: { select: LEAD_SELECT },
  salesperson: { select: { id: true, name: true } },
} satisfies Prisma.MeetingSelect;

/**
 * Owns the `meetings` table (Prompt 15): manual CRUD (this service) plus
 * automatic creation from a meeting request detected in a call transcript
 * (see CallAnalysisService.createMeetingIfRequested, which writes directly
 * via PrismaService rather than through here — same one-way-dependency
 * posture as FollowUpsService/follow-up-extractor.util.ts).
 */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private scopeWhere(user: AuthenticatedUser): Prisma.MeetingWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { salespersonId: user.id };
    }
    return {};
  }

  private canAccess(user: AuthenticatedUser, salespersonId: string) {
    return user.role !== Role.SALES_EXECUTIVE || salespersonId === user.id;
  }

  private async getAccessible(user: AuthenticatedUser, id: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      select: MEETING_SELECT,
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (!this.canAccess(user, meeting.salespersonId)) {
      throw new ForbiddenException('You do not have access to this meeting');
    }
    return meeting;
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

  async findAll(user: AuthenticatedUser, query: QueryMeetingsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const where: Prisma.MeetingWhereInput = {
      ...this.scopeWhere(user),
      leadId: query.leadId,
      status: query.status,
    };
    if (!query.leadId && query.salespersonId && user.role !== Role.SALES_EXECUTIVE) {
      where.salespersonId = query.salespersonId;
    }
    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.meeting.findMany({
        where,
        select: MEETING_SELECT,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.meeting.count({ where }),
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

  async create(user: AuthenticatedUser, dto: CreateMeetingDto) {
    await this.assertLeadAccessible(user, dto.leadId);

    const salespersonId =
      user.role === Role.SALES_EXECUTIVE
        ? user.id
        : (dto.salespersonId ?? user.id);

    const meeting = await this.prisma.meeting.create({
      data: {
        leadId: dto.leadId,
        date: new Date(dto.date),
        time: dto.time,
        salespersonId,
        meetingType: dto.meetingType,
        meetingLink: dto.meetingLink,
        notes: dto.notes,
      },
      select: MEETING_SELECT,
    });

    await this.activity.record({
      leadId: dto.leadId,
      type: 'MEETING_SCHEDULED',
      payload: { meetingId: meeting.id, meetingType: meeting.meetingType },
      actorUserId: user.id,
    });

    // Notifies the assigned salesperson directly — no manager fallback
    // needed here (unlike resolveLeadRecipient's use elsewhere), since
    // `create` above already resolved a concrete salespersonId for the
    // meeting itself.
    await this.notifications.create({
      userId: salespersonId,
      type: NotificationType.MEETING_SCHEDULED,
      leadId: dto.leadId,
      title: `Meeting scheduled: ${meeting.lead.name}`,
      body: `${meeting.meetingType} on ${meeting.date.toDateString()} at ${meeting.time}.`,
      payload: { meetingId: meeting.id, meetingType: meeting.meetingType },
    });

    return meeting;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateMeetingDto) {
    const existing = await this.getAccessible(user, id);

    if (
      dto.salespersonId &&
      dto.salespersonId !== existing.salespersonId &&
      user.role === Role.SALES_EXECUTIVE
    ) {
      throw new ForbiddenException(
        'Only managers or admins can reassign a meeting',
      );
    }

    return this.prisma.meeting.update({
      where: { id },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        time: dto.time,
        salespersonId: dto.salespersonId,
        meetingType: dto.meetingType,
        meetingLink: dto.meetingLink,
        notes: dto.notes,
        status: dto.status,
      },
      select: MEETING_SELECT,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getAccessible(user, id);
    await this.prisma.meeting.delete({ where: { id } });
  }
}
