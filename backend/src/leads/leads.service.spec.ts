import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ActivityService } from '../activity/activity.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: {
    lead: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    leadNote: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let usersService: { findById: jest.Mock };
  let activityService: { listForLead: jest.Mock };

  const executive: AuthenticatedUser = {
    id: 'exec-1',
    email: 'exec@example.com',
    role: Role.SALES_EXECUTIVE,
  };
  const manager: AuthenticatedUser = {
    id: 'mgr-1',
    email: 'mgr@example.com',
    role: Role.SALES_MANAGER,
  };

  function leadFixture(
    overrides: Partial<{
      id: string;
      assignedToId: string | null;
      tags: string[];
    }> = {},
  ) {
    return {
      id: 'lead-1',
      assignedToId: null,
      tags: [] as string[],
      ...overrides,
    };
  }

  function whereOf(mock: jest.Mock): { assignedToId?: string } {
    const [[arg]] = mock.mock.calls as [{ where: { assignedToId?: string } }][];
    return arg.where;
  }

  function dataOf(mock: jest.Mock): { assignedToId?: string } {
    const [[arg]] = mock.mock.calls as [{ data: { assignedToId?: string } }][];
    return arg.data;
  }

  beforeEach(async () => {
    prisma = {
      lead: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      leadNote: { create: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    usersService = { findById: jest.fn() };
    activityService = { listForLead: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: ActivityService, useValue: activityService },
      ],
    }).compile();

    service = moduleRef.get(LeadsService);
  });

  describe('findAll', () => {
    it('scopes the query to the executive when they are a sales executive', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(executive, {});

      expect(whereOf(prisma.lead.findMany).assignedToId).toBe(executive.id);
    });

    it('does not scope the query for managers', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(manager, {});

      expect(whereOf(prisma.lead.findMany).assignedToId).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the lead does not exist', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(service.findOne(manager, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when a sales executive is not the assignee', async () => {
      prisma.lead.findFirst.mockResolvedValue(
        leadFixture({ assignedToId: 'someone-else' }),
      );

      await expect(service.findOne(executive, 'lead-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns the lead when a sales executive owns it', async () => {
      const lead = leadFixture({ assignedToId: executive.id });
      prisma.lead.findFirst.mockResolvedValue(lead);

      await expect(service.findOne(executive, 'lead-1')).resolves.toEqual(lead);
    });
  });

  describe('getActivity', () => {
    it('throws ForbiddenException when a sales executive is not the assignee', async () => {
      prisma.lead.findFirst.mockResolvedValue(
        leadFixture({ assignedToId: 'someone-else' }),
      );

      await expect(service.getActivity(executive, 'lead-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(activityService.listForLead).not.toHaveBeenCalled();
    });

    it('delegates to ActivityService once access is confirmed', async () => {
      prisma.lead.findFirst.mockResolvedValue(
        leadFixture({ assignedToId: manager.id }),
      );
      activityService.listForLead.mockResolvedValue([{ id: 'activity-1' }]);

      await expect(service.getActivity(manager, 'lead-1')).resolves.toEqual([
        { id: 'activity-1' },
      ]);
      expect(activityService.listForLead).toHaveBeenCalledWith('lead-1');
    });
  });

  describe('create', () => {
    it('forces the assignee to the creator when a sales executive creates a lead', async () => {
      prisma.lead.create.mockResolvedValue(leadFixture());

      await service.create(executive, {
        name: 'Jane',
        phone: '123',
        assignedToId: 'someone-else',
      });

      expect(dataOf(prisma.lead.create).assignedToId).toBe(executive.id);
    });

    it('respects an explicit assignee for managers', async () => {
      usersService.findById.mockResolvedValue({ id: 'exec-2' });
      prisma.lead.create.mockResolvedValue(leadFixture());

      await service.create(manager, {
        name: 'Jane',
        phone: '123',
        assignedToId: 'exec-2',
      });

      expect(dataOf(prisma.lead.create).assignedToId).toBe('exec-2');
    });
  });

  describe('update', () => {
    it('forbids a sales executive from reassigning a lead', async () => {
      prisma.lead.findFirst.mockResolvedValue(
        leadFixture({ assignedToId: executive.id }),
      );

      await expect(
        service.update(executive, 'lead-1', { assignedToId: 'someone-else' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a manager to reassign a lead to an existing user', async () => {
      prisma.lead.findFirst.mockResolvedValue(leadFixture());
      usersService.findById.mockResolvedValue({ id: 'exec-2' });
      prisma.lead.update.mockResolvedValue(leadFixture());

      await service.update(manager, 'lead-1', { assignedToId: 'exec-2' });

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lead-1' } }),
      );
    });
  });

  describe('bulkAssign', () => {
    it('throws NotFoundException when the assignee does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.bulkAssign({ leadIds: ['lead-1'], assignedToId: 'ghost' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    });

    it('updates every lead when the assignee exists', async () => {
      usersService.findById.mockResolvedValue({ id: 'exec-2' });
      prisma.lead.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkAssign({
        leadIds: ['lead-1', 'lead-2'],
        assignedToId: 'exec-2',
      });

      expect(result).toEqual({ updated: 2 });
    });
  });

  describe('export', () => {
    it('produces a CSV with a header row and one row per lead', async () => {
      prisma.lead.findMany.mockResolvedValue([
        {
          name: 'Jane Doe',
          phone: '9990001111',
          alternatePhone: null,
          email: 'jane@example.com',
          companyName: 'Acme',
          designation: null,
          industry: null,
          city: 'Pune',
          state: 'MH',
          source: null,
          status: 'NEW',
          priority: 'HIGH',
          leadScore: 10,
          requirement: null,
          budget: null,
          timeline: null,
          tags: ['vip', 'hot'],
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          assignedTo: { name: 'Jane Exec' },
        },
      ]);

      const csv = await service.export(manager, {});

      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('Name,Phone');
      expect(lines[1]).toContain('Jane Doe,9990001111');
      expect(lines[1]).toContain('vip;hot');
      expect(lines[1]).toContain('Jane Exec');
    });

    it('scopes the export to the executive when they are a sales executive', async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await service.export(executive, {});

      expect(whereOf(prisma.lead.findMany).assignedToId).toBe(executive.id);
    });
  });

  describe('addTag', () => {
    it('does not call update when the tag already exists', async () => {
      prisma.lead.findFirst.mockResolvedValue(
        leadFixture({ assignedToId: manager.id, tags: ['vip'] }),
      );

      const result = await service.addTag(manager, 'lead-1', { tag: 'vip' });

      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(result.tags).toEqual(['vip']);
    });

    it('pushes a new tag', async () => {
      prisma.lead.findFirst.mockResolvedValue(leadFixture({ tags: [] }));
      prisma.lead.update.mockResolvedValue(leadFixture({ tags: ['vip'] }));

      await service.addTag(manager, 'lead-1', { tag: 'vip' });

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tags: { push: 'vip' } },
        }),
      );
    });
  });
});
