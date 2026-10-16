import { Test } from '@nestjs/testing';
import { CallingQueueService } from './calling-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallingQueueStatus } from '../../generated/prisma/enums';

describe('CallingQueueService', () => {
  let service: CallingQueueService;
  let prisma: {
    callingQueue: {
      updateMany: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
      groupBy: jest.Mock;
    };
    campaignLead: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      callingQueue: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        groupBy: jest.fn(),
      },
      campaignLead: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CallingQueueService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(CallingQueueService);
  });

  interface UpdateCallArg {
    data: { status: CallingQueueStatus; nextRetryAt?: Date };
  }

  function updateCallArg(callIndex: number): UpdateCallArg {
    const call = prisma.callingQueue.update.mock.calls[
      callIndex
    ] as unknown as [UpdateCallArg];
    return call[0];
  }

  describe('enqueueCampaign', () => {
    it('resets terminal rows, creates rows for new leads, then flips PENDING to QUEUED', async () => {
      prisma.campaignLead.findMany.mockResolvedValue([
        { leadId: 'lead-1' },
        { leadId: 'lead-2' },
      ]);

      await service.enqueueCampaign('campaign-1', 3);

      expect(prisma.callingQueue.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          campaignId: 'campaign-1',
          status: {
            in: [
              CallingQueueStatus.COMPLETED,
              CallingQueueStatus.FAILED,
              CallingQueueStatus.CANCELLED,
              CallingQueueStatus.SKIPPED,
            ],
          },
        },
        data: expect.objectContaining({
          status: CallingQueueStatus.PENDING,
        }) as { status: CallingQueueStatus },
      });

      expect(prisma.callingQueue.createMany).toHaveBeenCalledWith({
        data: [
          {
            campaignId: 'campaign-1',
            leadId: 'lead-1',
            maxAttempts: 3,
            status: CallingQueueStatus.PENDING,
          },
          {
            campaignId: 'campaign-1',
            leadId: 'lead-2',
            maxAttempts: 3,
            status: CallingQueueStatus.PENDING,
          },
        ],
        skipDuplicates: true,
      });

      expect(prisma.callingQueue.updateMany).toHaveBeenNthCalledWith(2, {
        where: { campaignId: 'campaign-1', status: CallingQueueStatus.PENDING },
        data: { status: CallingQueueStatus.QUEUED },
      });
    });

    it('skips the createMany call when the campaign has no leads', async () => {
      prisma.campaignLead.findMany.mockResolvedValue([]);

      await service.enqueueCampaign('campaign-1', 3);

      expect(prisma.callingQueue.createMany).not.toHaveBeenCalled();
    });
  });

  describe('countActive', () => {
    it('counts only DIALING/RINGING/CONNECTED rows', async () => {
      prisma.callingQueue.count.mockResolvedValue(2);

      const count = await service.countActive('campaign-1');

      expect(count).toBe(2);
      expect(prisma.callingQueue.count).toHaveBeenCalledWith({
        where: {
          campaignId: 'campaign-1',
          status: {
            in: [
              CallingQueueStatus.DIALING,
              CallingQueueStatus.RINGING,
              CallingQueueStatus.CONNECTED,
            ],
          },
        },
      });
    });
  });

  describe('recordFailedAttempt', () => {
    it('schedules a retry when attempts remain', async () => {
      prisma.callingQueue.update
        .mockResolvedValueOnce({ attempts: 1, maxAttempts: 3 })
        .mockResolvedValueOnce({
          id: 'item-1',
          status: CallingQueueStatus.RETRY,
        });

      const result = await service.recordFailedAttempt(
        'item-1',
        CallingQueueStatus.NO_ANSWER,
        30,
      );

      expect(prisma.callingQueue.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'item-1' },
        data: { status: CallingQueueStatus.NO_ANSWER },
        select: { attempts: true, maxAttempts: true },
      });
      const secondCall = updateCallArg(1);
      expect(secondCall.data.status).toBe(CallingQueueStatus.RETRY);
      expect(secondCall.data.nextRetryAt).toBeInstanceOf(Date);
      expect(result.status).toBe(CallingQueueStatus.RETRY);
    });

    it('marks FAILED once maxAttempts is reached', async () => {
      prisma.callingQueue.update
        .mockResolvedValueOnce({ attempts: 3, maxAttempts: 3 })
        .mockResolvedValueOnce({
          id: 'item-1',
          status: CallingQueueStatus.FAILED,
        });

      const result = await service.recordFailedAttempt(
        'item-1',
        CallingQueueStatus.BUSY,
        30,
      );

      const secondCall = updateCallArg(1);
      expect(secondCall.data).toEqual({ status: CallingQueueStatus.FAILED });
      expect(result.status).toBe(CallingQueueStatus.FAILED);
    });
  });

  describe('getOrCreateItem', () => {
    it('upserts on the (campaignId, leadId) compound key, creating with maxAttempts 1', async () => {
      prisma.callingQueue.upsert.mockResolvedValue({ id: 'queue-1' });

      const result = await service.getOrCreateItem('campaign-1', 'lead-1');

      expect(prisma.callingQueue.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            campaignId_leadId: { campaignId: 'campaign-1', leadId: 'lead-1' },
          },
          update: {},
          create: {
            campaignId: 'campaign-1',
            leadId: 'lead-1',
            maxAttempts: 1,
          },
        }),
      );
      expect(result).toEqual({ id: 'queue-1' });
    });
  });

  describe('requeueForFollowUp', () => {
    it('upserts on the (campaignId, leadId) key, resetting an existing row back to QUEUED', async () => {
      prisma.callingQueue.upsert.mockResolvedValue({ id: 'queue-1' });

      const result = await service.requeueForFollowUp('campaign-1', 'lead-1');

      expect(prisma.callingQueue.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            campaignId_leadId: { campaignId: 'campaign-1', leadId: 'lead-1' },
          },
          create: {
            campaignId: 'campaign-1',
            leadId: 'lead-1',
            maxAttempts: 1,
            status: CallingQueueStatus.QUEUED,
          },
          update: expect.objectContaining({
            status: CallingQueueStatus.QUEUED,
            attempts: 0,
            nextRetryAt: null,
            lastAttemptAt: null,
            callId: null,
          }) as Record<string, unknown>,
        }),
      );
      expect(result).toEqual({ id: 'queue-1' });
    });
  });

  describe('getCampaignStats', () => {
    it('aggregates status counts and average completed-call duration', async () => {
      prisma.callingQueue.groupBy.mockResolvedValue([
        { status: CallingQueueStatus.PENDING, _count: { _all: 2 } },
        { status: CallingQueueStatus.QUEUED, _count: { _all: 1 } },
        { status: CallingQueueStatus.CONNECTED, _count: { _all: 1 } },
        { status: CallingQueueStatus.COMPLETED, _count: { _all: 2 } },
        { status: CallingQueueStatus.NO_ANSWER, _count: { _all: 1 } },
        { status: CallingQueueStatus.BUSY, _count: { _all: 1 } },
        { status: CallingQueueStatus.FAILED, _count: { _all: 1 } },
      ]);
      prisma.callingQueue.findMany.mockResolvedValue([
        {
          lastAttemptAt: new Date('2026-08-21T10:00:00Z'),
          updatedAt: new Date('2026-08-21T10:00:20Z'),
        },
        {
          lastAttemptAt: new Date('2026-08-21T11:00:00Z'),
          updatedAt: new Date('2026-08-21T11:00:40Z'),
        },
      ]);

      const stats = await service.getCampaignStats('campaign-1');

      expect(stats).toEqual({
        attempted: 6, // total(9) - PENDING(2) - QUEUED(1)
        connected: 3, // CONNECTED(1) + COMPLETED(2)
        noAnswer: 1,
        busy: 1,
        failed: 1,
        avgCallDuration: 30, // average of 20s and 40s
      });
    });

    it('returns zeroed stats for a campaign with no queue activity', async () => {
      prisma.callingQueue.groupBy.mockResolvedValue([]);
      prisma.callingQueue.findMany.mockResolvedValue([]);

      const stats = await service.getCampaignStats('campaign-1');

      expect(stats).toEqual({
        attempted: 0,
        connected: 0,
        noAnswer: 0,
        busy: 0,
        failed: 0,
        avgCallDuration: 0,
      });
    });
  });

  describe('isCampaignExhausted', () => {
    it('is true when nothing non-terminal remains', async () => {
      prisma.callingQueue.count.mockResolvedValue(0);

      await expect(service.isCampaignExhausted('campaign-1')).resolves.toBe(
        true,
      );
      expect(prisma.callingQueue.count).toHaveBeenCalledWith({
        where: {
          campaignId: 'campaign-1',
          status: {
            notIn: ['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'],
          },
        },
      });
    });

    it('is false while queued/in-flight items remain', async () => {
      prisma.callingQueue.count.mockResolvedValue(2);

      await expect(service.isCampaignExhausted('campaign-1')).resolves.toBe(
        false,
      );
    });
  });

  describe('countFailed', () => {
    it('counts FAILED items for a campaign', async () => {
      prisma.callingQueue.count.mockResolvedValue(3);

      await expect(service.countFailed('campaign-1')).resolves.toBe(3);
      expect(prisma.callingQueue.count).toHaveBeenCalledWith({
        where: { campaignId: 'campaign-1', status: CallingQueueStatus.FAILED },
      });
    });
  });
});
