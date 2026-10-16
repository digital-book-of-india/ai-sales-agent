import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { Role, TaskStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';

const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  companyName: true,
} satisfies Prisma.LeadSelect;

const DEAL_SELECT = {
  id: true,
  leadId: true,
  value: true,
} satisfies Prisma.DealSelect;

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  assignedToId: true,
  dueDate: true,
  priority: true,
  status: true,
  relatedLeadId: true,
  relatedDealId: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true } },
  relatedLead: { select: LEAD_SELECT },
  relatedDeal: { select: DEAL_SELECT },
} satisfies Prisma.TaskSelect;

/**
 * Owns the `tasks` table (Prompt 16): CRUD, a quick status-move endpoint for
 * the Task Board's drag-and-drop, and the "My Tasks" listing the Dashboard
 * widget and the List/Board pages both read from.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private scopeWhere(user: AuthenticatedUser): Prisma.TaskWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { assignedToId: user.id };
    }
    return {};
  }

  private canAccess(user: AuthenticatedUser, assignedToId: string) {
    return user.role !== Role.SALES_EXECUTIVE || assignedToId === user.id;
  }

  private async getAccessible(user: AuthenticatedUser, id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: TASK_SELECT,
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (!this.canAccess(user, task.assignedToId)) {
      throw new ForbiddenException('You do not have access to this task');
    }
    return task;
  }

  /** A task can be created/edited from a Lead detail page — a
   * SALES_EXECUTIVE may only attach it to a lead assigned to them. */
  private async assertLeadAccessible(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { assignedToId: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    if (user.role === Role.SALES_EXECUTIVE && lead.assignedToId !== user.id) {
      throw new ForbiddenException('You do not have access to this lead');
    }
  }

  /** Same idea, for a task created/edited from a Deal detail page. */
  private async assertDealAccessible(user: AuthenticatedUser, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: { ownerId: true },
    });
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    if (user.role === Role.SALES_EXECUTIVE && deal.ownerId !== user.id) {
      throw new ForbiddenException('You do not have access to this deal');
    }
  }

  async findAll(user: AuthenticatedUser, query: QueryTasksDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    const where: Prisma.TaskWhereInput = {
      ...this.scopeWhere(user),
      status: query.status,
      relatedLeadId: query.leadId,
      relatedDealId: query.dealId,
    };
    // A SALES_EXECUTIVE is already pinned to their own tasks above — an
    // assignedToId filter from them would be redundant at best, and a
    // forged one for someone else would leak nothing since scopeWhere still
    // wins (Prisma ANDs both), so only let a manager/admin narrow by it.
    if (query.assignedToId && user.role !== Role.SALES_EXECUTIVE) {
      where.assignedToId = query.assignedToId;
    }
    if (query.dueDate) {
      const day = new Date(query.dueDate);
      const start = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
      );
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      where.dueDate = { gte: start, lt: end };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        select: TASK_SELECT,
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** "My Tasks" widget/list — every open (not DONE) task assigned to the
   * caller specifically, regardless of role; unlike everything else here,
   * a manager/admin gets their own tasks only, not everyone's. */
  listMine(user: AuthenticatedUser, limit = 10) {
    return this.prisma.task.findMany({
      where: { assignedToId: user.id, status: { not: TaskStatus.DONE } },
      select: TASK_SELECT,
      orderBy: { dueDate: 'asc' },
      take: limit,
    });
  }

  findOne(user: AuthenticatedUser, id: string) {
    return this.getAccessible(user, id);
  }

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    if (dto.relatedLeadId) {
      await this.assertLeadAccessible(user, dto.relatedLeadId);
    }
    if (dto.relatedDealId) {
      await this.assertDealAccessible(user, dto.relatedDealId);
    }

    const assignedToId =
      user.role === Role.SALES_EXECUTIVE
        ? user.id
        : (dto.assignedToId ?? user.id);

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        assignedToId,
        dueDate: new Date(dto.dueDate),
        priority: dto.priority,
        status: dto.status,
        relatedLeadId: dto.relatedLeadId,
        relatedDealId: dto.relatedDealId,
      },
      select: TASK_SELECT,
    });

    if (task.relatedLeadId) {
      await this.activity.record({
        leadId: task.relatedLeadId,
        type: 'TASK_CREATED',
        payload: { taskId: task.id, title: task.title, taskType: task.type },
        actorUserId: user.id,
      });
    }

    return task;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTaskDto) {
    const existing = await this.getAccessible(user, id);

    if (
      dto.assignedToId &&
      dto.assignedToId !== existing.assignedToId &&
      user.role === Role.SALES_EXECUTIVE
    ) {
      throw new ForbiddenException(
        'Only managers or admins can reassign a task',
      );
    }
    if (dto.relatedLeadId && dto.relatedLeadId !== existing.relatedLeadId) {
      await this.assertLeadAccessible(user, dto.relatedLeadId);
    }
    if (dto.relatedDealId && dto.relatedDealId !== existing.relatedDealId) {
      await this.assertDealAccessible(user, dto.relatedDealId);
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        assignedToId: dto.assignedToId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
        status: dto.status,
        relatedLeadId: dto.relatedLeadId,
        relatedDealId: dto.relatedDealId,
      },
      select: TASK_SELECT,
    });
  }

  /** Task Board drag-and-drop: move a task to a different status column. */
  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateTaskStatusDto,
  ) {
    await this.getAccessible(user, id);

    return this.prisma.task.update({
      where: { id },
      data: { status: dto.status },
      select: TASK_SELECT,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getAccessible(user, id);
    await this.prisma.task.delete({ where: { id } });
  }
}
