import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DealsService } from './deals.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('DealsService', () => {
  let service: DealsService;
  let prisma: {
    deal: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    lead: { findFirst: jest.Mock };
    pipelineStage: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let activity: { record: jest.Mock };
  let notifications: { create: jest.Mock };

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

  const dealRow = {
    id: 'deal-1',
    leadId: 'lead-1',
    ownerId: 'exec-1',
    value: 50000,
    probability: 40,
    stageId: 'stage-new',
    expectedCloseDate: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lead: {
      id: 'lead-1',
      name: 'Priya Sharma',
      phone: '9990001111',
      companyName: null,
      assignedToId: 'exec-1',
    },
    owner: { id: 'exec-1', name: 'Executive' },
    stage: { id: 'stage-new', name: 'NEW', order: 0 },
  };

  beforeEach(async () => {
    prisma = {
      deal: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lead: { findFirst: jest.fn() },
      pipelineStage: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    activity = { record: jest.fn() };
    notifications = { create: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityService, useValue: activity },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(DealsService);
  });

  describe('findAll', () => {
    it('scopes a SALES_EXECUTIVE to deals they own', async () => {
      await service.findAll(exec, {});

      const [[{ where }]] = prisma.deal.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where).toMatchObject({ ownerId: 'exec-1' });
    });

    it('does not scope a manager', async () => {
      await service.findAll(manager, {});

      const [[{ where }]] = prisma.deal.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where.ownerId).toBeUndefined();
    });
  });

  describe('board', () => {
    it('nests deals under each stage, scoped for the caller', async () => {
      await service.board(exec);

      expect(prisma.pipelineStage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            deals: expect.objectContaining({
              where: { ownerId: 'exec-1' },
            }) as Record<string, unknown>,
          }) as Record<string, unknown>,
        }),
      );
    });
  });

  describe('create', () => {
    it('creates a deal defaulting to the first stage and logs activity', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'exec-1' });
      prisma.pipelineStage.findFirst.mockResolvedValue({ id: 'stage-new' });
      prisma.deal.create.mockResolvedValue(dealRow);

      const result = await service.create(exec, {
        leadId: 'lead-1',
        value: 50000,
      });

      expect(prisma.deal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            ownerId: 'exec-1',
            value: 50000,
            stageId: 'stage-new',
          }) as Record<string, unknown>,
        }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: 'lead-1', type: 'DEAL_CREATED' }),
      );
      expect(result).toEqual(dealRow);
    });

    it('throws when no pipeline stage is configured and none was given', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'exec-1' });
      prisma.pipelineStage.findFirst.mockResolvedValue(null);

      await expect(
        service.create(exec, { leadId: 'lead-1', value: 50000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a SALES_EXECUTIVE creating a deal for a lead not assigned to them', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'someone-else' });

      await expect(
        service.create(exec, { leadId: 'lead-1', value: 50000 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('moveStage', () => {
    it('moves a deal to a valid stage and logs a DEAL_STAGE_CHANGED activity', async () => {
      prisma.deal.findUnique.mockResolvedValue(dealRow);
      prisma.pipelineStage.findUnique.mockResolvedValue({
        id: 'stage-won',
        name: 'WON',
      });
      prisma.deal.update.mockResolvedValue({
        ...dealRow,
        stageId: 'stage-won',
      });

      const result = await service.moveStage(manager, 'deal-1', {
        stageId: 'stage-won',
      });

      expect(prisma.deal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deal-1' },
          data: { stageId: 'stage-won' },
        }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DEAL_STAGE_CHANGED',
          payload: expect.objectContaining({
            fromStage: 'NEW',
            toStage: 'WON',
          }) as Record<string, unknown>,
        }),
      );
      expect(result.stageId).toBe('stage-won');
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'exec-1',
          type: 'DEAL_WON',
          leadId: 'lead-1',
          payload: { dealId: 'deal-1', value: 50000 },
        }),
      );
    });

    it('does not fire DEAL_WON when the target stage is not WON', async () => {
      prisma.deal.findUnique.mockResolvedValue(dealRow);
      prisma.pipelineStage.findUnique.mockResolvedValue({
        id: 'stage-qualified',
        name: 'QUALIFIED',
      });
      prisma.deal.update.mockResolvedValue({
        ...dealRow,
        stageId: 'stage-qualified',
      });

      await service.moveStage(manager, 'deal-1', {
        stageId: 'stage-qualified',
      });

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not re-fire DEAL_WON when the deal is already on the WON stage', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        ...dealRow,
        stageId: 'stage-won',
        stage: { id: 'stage-won', name: 'WON', order: 7 },
      });
      prisma.pipelineStage.findUnique.mockResolvedValue({
        id: 'stage-won',
        name: 'WON',
      });
      prisma.deal.update.mockResolvedValue({
        ...dealRow,
        stageId: 'stage-won',
      });

      await service.moveStage(manager, 'deal-1', { stageId: 'stage-won' });

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target stage does not exist', async () => {
      prisma.deal.findUnique.mockResolvedValue(dealRow);
      prisma.pipelineStage.findUnique.mockResolvedValue(null);

      await expect(
        service.moveStage(manager, 'deal-1', { stageId: 'missing-stage' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it("rejects a SALES_EXECUTIVE moving another rep's deal", async () => {
      prisma.deal.findUnique.mockResolvedValue({
        ...dealRow,
        ownerId: 'someone-else',
      });

      await expect(
        service.moveStage(exec, 'deal-1', { stageId: 'stage-won' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('deletes a deal via remove()', async () => {
      prisma.deal.findUnique.mockResolvedValue(dealRow);

      await service.remove(manager, 'deal-1');

      expect(prisma.deal.delete).toHaveBeenCalledWith({
        where: { id: 'deal-1' },
      });
    });
  });
});
