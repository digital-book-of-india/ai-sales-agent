import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  FOLLOW_UPS_QUEUE,
  FOLLOW_UP_CAMPAIGN_NAME,
  FollowUpsService,
} from './follow-ups.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallingQueueService } from '../calling/calling-queue.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FollowUpStatus, Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('FollowUpsService', () => {
  let service: FollowUpsService;
  let prisma: {
    followUp: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    lead: { findFirst: jest.Mock };
    campaign: { findFirst: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let callingQueue: { requeueForFollowUp: jest.Mock };
  let activity: { record: jest.Mock };
  let notifications: { resolveLeadRecipient: jest.Mock; create: jest.Mock };
  let queue: { upsertJobScheduler: jest.Mock };

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

  const followUpRow = {
    id: 'fu-1',
    leadId: 'lead-1',
    dueAt: new Date('2026-08-28T10:00:00.000Z'),
    reason: 'Wants to review pricing',
    status: FollowUpStatus.PENDING,
    createdBy: 'mgr-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    lead: {
      id: 'lead-1',
      name: 'Priya Sharma',
      phone: '9990001111',
      companyName: null,
      assignedToId: 'exec-1',
    },
    creator: { id: 'mgr-1', name: 'Manager' },
  };

  beforeEach(async () => {
    prisma = {
      followUp: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lead: { findFirst: jest.fn() },
      campaign: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    callingQueue = { requeueForFollowUp: jest.fn() };
    activity = { record: jest.fn() };
    notifications = {
      resolveLeadRecipient: jest.fn().mockResolvedValue('exec-1'),
      create: jest.fn(),
    };
    queue = { upsertJobScheduler: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FollowUpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallingQueueService, useValue: callingQueue },
        { provide: ActivityService, useValue: activity },
        { provide: NotificationsService, useValue: notifications },
        { provide: getQueueToken(FOLLOW_UPS_QUEUE), useValue: queue },
      ],
    }).compile();

    service = moduleRef.get(FollowUpsService);
  });

  describe('onModuleInit', () => {
    it('registers the recurring due-check job scheduler', async () => {
      await service.onModuleInit();

      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        'follow-ups-tick',
        expect.objectContaining({ every: expect.any(Number) as number }),
        expect.objectContaining({ name: 'check-due-follow-ups' }),
      );
    });
  });

  describe('findAll', () => {
    it('scopes a SALES_EXECUTIVE to leads assigned to them', async () => {
      await service.findAll(exec, {});

      const [[{ where }]] = prisma.followUp.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where).toMatchObject({ lead: { assignedToId: 'exec-1' } });
    });

    it('does not scope a manager', async () => {
      await service.findAll(manager, {});

      const [[{ where }]] = prisma.followUp.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where).not.toHaveProperty('lead');
    });
  });

  describe('create', () => {
    it('creates a follow-up and logs activity when the lead is accessible', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'exec-1' });
      prisma.followUp.create.mockResolvedValue(followUpRow);

      const result = await service.create(exec, {
        leadId: 'lead-1',
        dueAt: '2026-08-28T10:00:00.000Z',
        reason: 'Wants to review pricing',
      });

      expect(prisma.followUp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            reason: 'Wants to review pricing',
            createdBy: 'exec-1',
          }) as Record<string, unknown>,
        }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-1',
          type: 'FOLLOW_UP_SCHEDULED',
        }),
      );
      expect(result).toEqual(followUpRow);
    });

    it('rejects a SALES_EXECUTIVE creating a follow-up for a lead not assigned to them', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'someone-else' });

      await expect(
        service.create(exec, {
          leadId: 'lead-1',
          dueAt: '2026-08-28T10:00:00.000Z',
          reason: 'Wants to review pricing',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.followUp.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing lead', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.create(manager, {
          leadId: 'missing',
          dueAt: '2026-08-28T10:00:00.000Z',
          reason: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne / update / complete / remove', () => {
    it("throws ForbiddenException when a SALES_EXECUTIVE accesses another rep's follow-up", async () => {
      prisma.followUp.findUnique.mockResolvedValue({
        ...followUpRow,
        lead: { ...followUpRow.lead, assignedToId: 'someone-else' },
      });

      await expect(service.findOne(exec, 'fu-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('marks a follow-up DONE via complete()', async () => {
      prisma.followUp.findUnique.mockResolvedValue(followUpRow);
      prisma.followUp.update.mockResolvedValue({
        ...followUpRow,
        status: FollowUpStatus.DONE,
      });

      const result = await service.complete(manager, 'fu-1');

      expect(prisma.followUp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fu-1' },
          data: { status: FollowUpStatus.DONE },
        }),
      );
      expect(result.status).toBe(FollowUpStatus.DONE);
    });

    it('deletes a follow-up via remove()', async () => {
      prisma.followUp.findUnique.mockResolvedValue(followUpRow);

      await service.remove(manager, 'fu-1');

      expect(prisma.followUp.delete).toHaveBeenCalledWith({
        where: { id: 'fu-1' },
      });
    });
  });

  describe('processDue', () => {
    it('is a no-op when nothing is due', async () => {
      prisma.followUp.findMany.mockResolvedValue([]);

      await service.processDue();

      expect(prisma.campaign.findFirst).not.toHaveBeenCalled();
      expect(callingQueue.requeueForFollowUp).not.toHaveBeenCalled();
    });

    it('requeues each due lead under the Follow-ups campaign and marks it DONE', async () => {
      prisma.followUp.findMany.mockResolvedValue([
        {
          id: 'fu-1',
          leadId: 'lead-1',
          reason: 'Call back',
          lead: { name: 'Priya Sharma', assignedToId: 'exec-1' },
        },
        {
          id: 'fu-2',
          leadId: 'lead-2',
          reason: 'Call back',
          lead: { name: 'Rahul Verma', assignedToId: null },
        },
      ]);
      prisma.campaign.findFirst.mockResolvedValue(null);
      prisma.campaign.create.mockResolvedValue({ id: 'campaign-followups' });
      callingQueue.requeueForFollowUp.mockResolvedValue({ id: 'queue-1' });

      await service.processDue();

      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: FOLLOW_UP_CAMPAIGN_NAME,
            status: 'RUNNING',
          }) as Record<string, unknown>,
        }),
      );
      expect(callingQueue.requeueForFollowUp).toHaveBeenCalledWith(
        'campaign-followups',
        'lead-1',
      );
      expect(callingQueue.requeueForFollowUp).toHaveBeenCalledWith(
        'campaign-followups',
        'lead-2',
      );
      expect(prisma.followUp.update).toHaveBeenCalledWith({
        where: { id: 'fu-1' },
        data: { status: FollowUpStatus.DONE },
      });
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: 'lead-1', type: 'FOLLOW_UP_DUE' }),
      );
      expect(notifications.resolveLeadRecipient).toHaveBeenCalledWith('exec-1');
      expect(notifications.resolveLeadRecipient).toHaveBeenCalledWith(null);
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'exec-1',
        type: 'FOLLOW_UP_DUE',
        leadId: 'lead-1',
        title: 'Follow-up due: Priya Sharma',
        body: 'Call back',
        payload: { followUpId: 'fu-1' },
      });
    });

    it('skips the notification (but still requeues) when there is no rep or fallback manager', async () => {
      prisma.followUp.findMany.mockResolvedValue([
        {
          id: 'fu-1',
          leadId: 'lead-1',
          reason: 'Call back',
          lead: { name: 'Priya Sharma', assignedToId: null },
        },
      ]);
      notifications.resolveLeadRecipient.mockResolvedValue(null);
      prisma.campaign.findFirst.mockResolvedValue({ id: 'campaign-followups' });

      await service.processDue();

      expect(callingQueue.requeueForFollowUp).toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('reuses an existing Follow-ups campaign instead of creating another', async () => {
      prisma.followUp.findMany.mockResolvedValue([
        {
          id: 'fu-1',
          leadId: 'lead-1',
          reason: 'Call back',
          lead: { name: 'Priya Sharma', assignedToId: 'exec-1' },
        },
      ]);
      prisma.campaign.findFirst.mockResolvedValue({ id: 'existing-campaign' });

      await service.processDue();

      expect(prisma.campaign.create).not.toHaveBeenCalled();
      expect(callingQueue.requeueForFollowUp).toHaveBeenCalledWith(
        'existing-campaign',
        'lead-1',
      );
    });
  });
});
