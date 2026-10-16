import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignStatus } from '../../generated/prisma/enums';
import { CallingQueueService } from '../calling/calling-queue.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: {
    campaign: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    campaignLead: {
      count: jest.Mock;
      findMany: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    lead: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let callingQueueService: {
    enqueueCampaign: jest.Mock;
    getCampaignStats: jest.Mock;
  };

  function campaignFixture(
    overrides: Partial<{
      id: string;
      status: CampaignStatus;
      startDate: Date | null;
      leadFilters: unknown;
    }> = {},
  ) {
    return {
      id: 'campaign-1',
      name: 'Diwali Outreach',
      description: null,
      objective: null,
      aiAgentId: null,
      leadFilters: {},
      callingHours: {},
      maxAttempts: 3,
      retryInterval: 60,
      concurrentCalls: 1,
      startDate: null,
      endDate: null,
      status: CampaignStatus.DRAFT,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      _count: { campaignLeads: 0 },
      ...overrides,
    };
  }

  function dataOf(mock: jest.Mock): { name: string; status?: CampaignStatus } {
    const [[arg]] = mock.mock.calls as [
      { data: { name: string; status?: CampaignStatus } },
    ][];
    return arg.data;
  }

  beforeEach(async () => {
    prisma = {
      campaign: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      campaignLead: {
        count: jest.fn(),
        findMany: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      lead: { findMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    callingQueueService = {
      enqueueCampaign: jest.fn().mockResolvedValue(undefined),
      getCampaignStats: jest.fn().mockResolvedValue({
        attempted: 0,
        connected: 0,
        noAnswer: 0,
        busy: 0,
        failed: 0,
        avgCallDuration: 0,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallingQueueService, useValue: callingQueueService },
      ],
    }).compile();

    service = moduleRef.get(CampaignsService);
  });

  describe('findOne', () => {
    it('throws NotFoundException when the campaign does not exist', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates a campaign in DRAFT status', async () => {
      prisma.campaign.create.mockResolvedValue(campaignFixture());
      prisma.campaign.findUnique.mockResolvedValue(campaignFixture());

      await service.create({ name: 'Diwali Outreach' });

      expect(dataOf(prisma.campaign.create).name).toBe('Diwali Outreach');
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('syncs campaign leads to match the provided lead filters', async () => {
      prisma.campaign.create.mockResolvedValue(campaignFixture());
      prisma.campaign.findUnique.mockResolvedValue(campaignFixture());
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);

      await service.create({
        name: 'Diwali Outreach',
        leadFilters: { statuses: ['NEW'] },
      });

      expect(prisma.lead.findMany).toHaveBeenCalled();
      expect(prisma.campaignLead.createMany).toHaveBeenCalledWith({
        data: [
          { campaignId: 'campaign-1', leadId: 'lead-1' },
          { campaignId: 'campaign-1', leadId: 'lead-2' },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('status transitions', () => {
    it('starts a DRAFT campaign without a start date directly into RUNNING', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignFixture());
      prisma.campaign.update.mockResolvedValue(undefined);

      await service.start('campaign-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: { status: CampaignStatus.RUNNING },
      });
      expect(callingQueueService.enqueueCampaign).toHaveBeenCalledWith(
        'campaign-1',
        3,
      );
    });

    it('starting a campaign with a future start date marks it SCHEDULED and does not enqueue calls yet', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      prisma.campaign.findUnique.mockResolvedValue(
        campaignFixture({ startDate: future }),
      );
      prisma.campaign.update.mockResolvedValue(undefined);

      await service.start('campaign-1');

      expect(callingQueueService.enqueueCampaign).not.toHaveBeenCalled();

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: { status: CampaignStatus.SCHEDULED },
      });
    });

    it('rejects starting an already RUNNING campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignFixture({ status: CampaignStatus.RUNNING }),
      );

      await expect(service.start('campaign-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('pauses a RUNNING campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignFixture({ status: CampaignStatus.RUNNING }),
      );
      prisma.campaign.update.mockResolvedValue(undefined);

      await service.pause('campaign-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: { status: CampaignStatus.PAUSED },
      });
    });

    it('rejects pausing a DRAFT campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignFixture());

      await expect(service.pause('campaign-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('resumes a PAUSED campaign back to RUNNING', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignFixture({ status: CampaignStatus.PAUSED }),
      );
      prisma.campaign.update.mockResolvedValue(undefined);

      await service.resume('campaign-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: { status: CampaignStatus.RUNNING },
      });
    });

    it('stops a RUNNING campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignFixture({ status: CampaignStatus.RUNNING }),
      );
      prisma.campaign.update.mockResolvedValue(undefined);

      await service.stop('campaign-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'campaign-1' },
        data: { status: CampaignStatus.STOPPED },
      });
    });

    it('rejects stopping a DRAFT campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignFixture());

      await expect(service.stop('campaign-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('duplicate', () => {
    it('copies campaign settings and attached leads into a new DRAFT campaign', async () => {
      prisma.campaign.findUnique
        .mockResolvedValueOnce(campaignFixture())
        .mockResolvedValueOnce(campaignFixture({ id: 'campaign-2' }));
      prisma.campaign.create.mockResolvedValue(
        campaignFixture({ id: 'campaign-2' }),
      );
      prisma.campaignLead.findMany.mockResolvedValue([{ leadId: 'lead-1' }]);

      await service.duplicate('campaign-1');

      const created = dataOf(prisma.campaign.create);
      expect(created.name).toBe('Diwali Outreach (Copy)');
      expect(created.status).toBe(CampaignStatus.DRAFT);
      expect(prisma.campaignLead.createMany).toHaveBeenCalledWith({
        data: [{ campaignId: 'campaign-2', leadId: 'lead-1' }],
        skipDuplicates: true,
      });
    });
  });

  describe('stats', () => {
    it('returns the real lead count with zeroed call metrics when nothing has been dialed', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignFixture());
      prisma.campaignLead.count.mockResolvedValue(12);

      const stats = await service.stats('campaign-1');

      expect(callingQueueService.getCampaignStats).toHaveBeenCalledWith(
        'campaign-1',
      );
      expect(stats).toEqual({
        leads: 12,
        attempted: 0,
        connected: 0,
        noAnswer: 0,
        busy: 0,
        failed: 0,
        interested: 0,
        hotLeads: 0,
        meetings: 0,
        conversion: 0,
        avgCallDuration: 0,
      });
    });

    it('derives conversion from connected calls against total leads', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignFixture());
      prisma.campaignLead.count.mockResolvedValue(10);
      callingQueueService.getCampaignStats.mockResolvedValue({
        attempted: 8,
        connected: 3,
        noAnswer: 3,
        busy: 2,
        failed: 0,
        avgCallDuration: 42,
      });

      const stats = await service.stats('campaign-1');

      expect(stats.conversion).toBe(30);
      expect(stats.avgCallDuration).toBe(42);
    });
  });
});
