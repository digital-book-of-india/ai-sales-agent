import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { Role, TaskStatus } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: {
    task: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    lead: { findFirst: jest.Mock };
    deal: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let activity: { record: jest.Mock };

  const manager: AuthenticatedUser = {
    id: 'mgr-1',
    email: 'mgr@example.com',
    role: Role.SALES_MANAGER,
  };
  const exec: AuthenticatedUser = {
    id: 'exec-1',
    email: 'exec@example.com',
    role: Role.SALES_EXECUTIVE,
  };

  const taskRow = {
    id: 'task-1',
    title: 'Send pricing sheet',
    description: null,
    type: 'SEND_QUOTATION',
    assignedToId: 'exec-1',
    dueDate: new Date('2026-08-28T10:00:00.000Z'),
    priority: 'MEDIUM',
    status: TaskStatus.TODO,
    relatedLeadId: 'lead-1',
    relatedDealId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignedTo: { id: 'exec-1', name: 'Executive' },
    relatedLead: {
      id: 'lead-1',
      name: 'Priya Sharma',
      phone: '9990001111',
      companyName: null,
    },
    relatedDeal: null,
  };

  beforeEach(async () => {
    prisma = {
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lead: { findFirst: jest.fn() },
      deal: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    activity = { record: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityService, useValue: activity },
      ],
    }).compile();

    service = moduleRef.get(TasksService);
  });

  describe('findAll', () => {
    it('scopes a SALES_EXECUTIVE to tasks assigned to them', async () => {
      await service.findAll(exec, {});

      const [[{ where }]] = prisma.task.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where).toMatchObject({ assignedToId: 'exec-1' });
    });

    it('does not scope a manager', async () => {
      await service.findAll(manager, {});

      const [[{ where }]] = prisma.task.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where.assignedToId).toBeUndefined();
    });

    it('ignores an assignedToId filter from a SALES_EXECUTIVE', async () => {
      await service.findAll(exec, { assignedToId: 'someone-else' });

      const [[{ where }]] = prisma.task.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where.assignedToId).toBe('exec-1');
    });

    it('lets a manager filter by assignedToId', async () => {
      await service.findAll(manager, { assignedToId: 'exec-1' });

      const [[{ where }]] = prisma.task.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where.assignedToId).toBe('exec-1');
    });
  });

  describe('listMine', () => {
    it("queries only the caller's own open tasks", async () => {
      await service.listMine(manager);

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            assignedToId: 'mgr-1',
            status: { not: TaskStatus.DONE },
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('creates a task, defaults assignee to self, and logs activity when linked to a lead', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'exec-1' });
      prisma.task.create.mockResolvedValue(taskRow);

      const result = await service.create(exec, {
        title: 'Send pricing sheet',
        type: 'SEND_QUOTATION',
        dueDate: '2026-08-28T10:00:00.000Z',
        relatedLeadId: 'lead-1',
      } as never);

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Send pricing sheet',
            assignedToId: 'exec-1',
            relatedLeadId: 'lead-1',
          }) as Record<string, unknown>,
        }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: 'lead-1', type: 'TASK_CREATED' }),
      );
      expect(result).toEqual(taskRow);
    });

    it('does not log activity when no lead is linked', async () => {
      prisma.task.create.mockResolvedValue({
        ...taskRow,
        relatedLeadId: null,
        relatedLead: null,
      });

      await service.create(manager, {
        title: 'Internal admin task',
        type: 'INTERNAL',
        dueDate: '2026-08-28T10:00:00.000Z',
      } as never);

      expect(activity.record).not.toHaveBeenCalled();
    });

    it('rejects a SALES_EXECUTIVE linking a task to a lead not assigned to them', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'someone-else' });

      await expect(
        service.create(exec, {
          title: 'Send pricing sheet',
          type: 'SEND_QUOTATION',
          dueDate: '2026-08-28T10:00:00.000Z',
          relatedLeadId: 'lead-1',
        } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('rejects a SALES_EXECUTIVE linking a task to a deal they do not own', async () => {
      prisma.deal.findUnique.mockResolvedValue({ ownerId: 'someone-else' });

      await expect(
        service.create(exec, {
          title: 'Send proposal',
          type: 'SEND_PROPOSAL',
          dueDate: '2026-08-28T10:00:00.000Z',
          relatedDealId: 'deal-1',
        } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne / updateStatus / remove', () => {
    it("throws ForbiddenException when a SALES_EXECUTIVE accesses another rep's task", async () => {
      prisma.task.findUnique.mockResolvedValue({
        ...taskRow,
        assignedToId: 'someone-else',
      });

      await expect(service.findOne(exec, 'task-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a missing task', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(service.findOne(manager, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('moves a task to a new status via updateStatus()', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow);
      prisma.task.update.mockResolvedValue({
        ...taskRow,
        status: TaskStatus.IN_PROGRESS,
      });

      const result = await service.updateStatus(exec, 'task-1', {
        status: TaskStatus.IN_PROGRESS,
      });

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: { status: TaskStatus.IN_PROGRESS },
        }),
      );
      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('deletes a task via remove()', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow);

      await service.remove(manager, 'task-1');

      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-1' },
      });
    });
  });

  describe('update', () => {
    it('rejects a SALES_EXECUTIVE reassigning a task to someone else', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow);

      await expect(
        service.update(exec, 'task-1', {
          assignedToId: 'someone-else',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });
});
