import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    lead: {
      count: jest.Mock;
      aggregate: jest.Mock;
      groupBy: jest.Mock;
    };
    followUp: { count: jest.Mock };
    campaign: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const manager: AuthenticatedUser = {
    id: 'mgr-1',
    email: 'mgr@example.com',
    role: Role.SALES_MANAGER,
  };

  const executive: AuthenticatedUser = {
    id: 'exec-1',
    email: 'exec@example.com',
    role: Role.SALES_EXECUTIVE,
  };

  beforeEach(async () => {
    prisma = {
      lead: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { budget: null } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      followUp: { count: jest.fn().mockResolvedValue(0) },
      campaign: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  describe('stats', () => {
    it('scopes queries to the current user for a sales executive', async () => {
      await service.stats(executive, { range: 'today' });

      const where = prisma.lead.count.mock.calls[0][0].where as {
        assignedToId?: string;
      };
      expect(where.assignedToId).toBe('exec-1');
    });

    it('does not scope queries for a manager', async () => {
      await service.stats(manager, { range: 'today' });

      const where = prisma.lead.count.mock.calls[0][0].where as {
        assignedToId?: string;
      };
      expect(where.assignedToId).toBeUndefined();
    });

    it('zeroes call-related metrics pending the Dialer/Calls modules', async () => {
      const stats = await service.stats(manager, { range: 'today' });

      expect(stats.callsToday).toBe(0);
      expect(stats.connectedCalls).toBe(0);
      expect(stats.failedCalls).toBe(0);
      expect(stats.meetings).toBe(0);
      expect(stats.avgCallDuration).toBe(0);
      expect(stats.aiCallSuccessRate).toBe(0);
    });

    it('computes revenue from the sum of won-lead budgets in range', async () => {
      prisma.lead.aggregate.mockResolvedValue({ _sum: { budget: 50000 } });

      const stats = await service.stats(manager, { range: 'month' });

      expect(stats.revenue).toBe(50000);
    });

    it('computes conversionRate as won deals over new leads', async () => {
      prisma.lead.count
        .mockResolvedValueOnce(100) // totalLeads
        .mockResolvedValueOnce(20) // newLeads
        .mockResolvedValueOnce(0) // interestedLeads
        .mockResolvedValueOnce(0) // hotLeads
        .mockResolvedValueOnce(0) // warmLeads
        // followUpsDue is now prisma.followUp.count, not part of this chain
        .mockResolvedValueOnce(0) // openDeals
        .mockResolvedValueOnce(5) // wonDeals
        .mockResolvedValueOnce(1); // lostDeals

      const stats = await service.stats(manager, { range: 'month' });

      expect(stats.wonDeals).toBe(5);
      expect(stats.conversionRate).toBe(25);
    });

    it('counts followUpsDue from the follow_ups table, scoped to the lead relation', async () => {
      prisma.followUp.count.mockResolvedValue(7);

      const stats = await service.stats(executive, { range: 'today' });

      expect(stats.followUpsDue).toBe(7);
      const [[{ where }]] = prisma.followUp.count.mock.calls as [
        [
          {
            where: {
              status: string;
              lead: { assignedToId?: string };
            };
          },
        ],
      ];
      expect(where.status).toBe('PENDING');
      expect(where.lead.assignedToId).toBe('exec-1');
    });

    it('rejects a custom range missing from/to', async () => {
      await expect(service.stats(manager, { range: 'custom' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('charts', () => {
    it('returns a zero-filled funnel and status distribution when there are no leads', async () => {
      const charts = await service.charts(manager, { range: 'today' });

      expect(charts.leadFunnel.every((stage) => stage.count === 0)).toBe(true);
      expect(
        charts.statusDistribution.every((entry) => entry.count === 0),
      ).toBe(true);
    });

    it('maps groupBy counts onto the funnel stages', async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { status: 'NEW', _count: { _all: 4 } },
        { status: 'WON', _count: { _all: 2 } },
      ]);

      const charts = await service.charts(manager, { range: 'today' });

      expect(charts.leadFunnel.find((s) => s.status === 'NEW')?.count).toBe(4);
      expect(charts.leadFunnel.find((s) => s.status === 'WON')?.count).toBe(2);
    });

    it('builds one calls-over-time bucket per day in the range', async () => {
      const charts = await service.charts(manager, {
        range: 'custom',
        from: '2026-08-01',
        to: '2026-08-03',
      });

      expect(charts.callsOverTime).toEqual([
        { date: '2026-08-01', calls: 0, connected: 0, failed: 0 },
        { date: '2026-08-02', calls: 0, connected: 0, failed: 0 },
        { date: '2026-08-03', calls: 0, connected: 0, failed: 0 },
      ]);
    });

    it('includes campaigns with real lead counts and zeroed call metrics', async () => {
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'campaign-1',
          name: 'Diwali Outreach',
          status: 'RUNNING',
          _count: { campaignLeads: 12 },
        },
      ]);

      const charts = await service.charts(manager, { range: 'today' });

      expect(charts.campaignPerformance).toEqual([
        {
          campaignId: 'campaign-1',
          campaignName: 'Diwali Outreach',
          status: 'RUNNING',
          totalLeads: 12,
          connected: 0,
          interested: 0,
          converted: 0,
          conversionRate: 0,
        },
      ]);
    });
  });
});
