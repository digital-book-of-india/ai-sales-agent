import { Test } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    $queryRaw: jest.Mock;
    lead: { groupBy: jest.Mock; count: jest.Mock };
    deal: { groupBy: jest.Mock };
    pipelineStage: { findMany: jest.Mock };
    call: { count: jest.Mock };
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
      $queryRaw: jest.fn().mockResolvedValue([]),
      lead: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      deal: { groupBy: jest.fn().mockResolvedValue([]) },
      pipelineStage: { findMany: jest.fn().mockResolvedValue([]) },
      call: { count: jest.fn().mockResolvedValue(0) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AnalyticsService);
  });

  describe('calls', () => {
    it('derives answerRate, avgDuration and retryRate from the raw summary row', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            total: 20,
            connected: 15,
            failed: 5,
            avg_duration: 125,
            distinct_queue: 16,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.calls(manager, { range: 'today' });

      expect(result.totalCalls).toBe(20);
      expect(result.connectedCalls).toBe(15);
      expect(result.failedCalls).toBe(5);
      expect(result.answerRate).toBe(75);
      expect(result.avgDuration).toBe(125);
      // 20 calls, 16 distinct queue items -> 4 retries -> 20%
      expect(result.retryRate).toBe(20);
    });

    it('returns all-zero figures when there are no calls in range, without dividing by zero', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.calls(manager, { range: 'today' });

      expect(result.totalCalls).toBe(0);
      expect(result.answerRate).toBe(0);
      expect(result.retryRate).toBe(0);
      expect(result.avgDuration).toBe(0);
    });

    it('fills one trend bucket per day in the range, zeroing days with no rows', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            total: 0,
            connected: 0,
            failed: 0,
            avg_duration: null,
            distinct_queue: 0,
          },
        ])
        .mockResolvedValueOnce([
          { date: '2026-08-02', total: 3, connected: 2, failed: 1 },
        ]);

      const result = await service.calls(manager, {
        range: 'custom',
        from: '2026-08-01',
        to: '2026-08-03',
      });

      expect(result.trend).toEqual([
        {
          date: '2026-08-01',
          totalCalls: 0,
          connectedCalls: 0,
          failedCalls: 0,
        },
        {
          date: '2026-08-02',
          totalCalls: 3,
          connectedCalls: 2,
          failedCalls: 1,
        },
        {
          date: '2026-08-03',
          totalCalls: 0,
          connectedCalls: 0,
          failedCalls: 0,
        },
      ]);
    });

    it('scopes the raw queries to the current user for a sales executive', async () => {
      await service.calls(executive, { range: 'today' });

      const [sql] = prisma.$queryRaw.mock.calls[0] as [{ values: unknown[] }];
      expect(sql.values).toContain('exec-1');
    });

    it('does not scope the raw queries for a manager', async () => {
      await service.calls(manager, { range: 'today' });

      const [sql] = prisma.$queryRaw.mock.calls[0] as [{ values: unknown[] }];
      expect(sql.values).not.toContain('mgr-1');
    });
  });

  describe('leads', () => {
    it('maps groupBy counts onto the named categories and funnel', async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { status: 'NEW', _count: { _all: 10 } },
        { status: 'QUALIFIED', _count: { _all: 4 } },
      ]);
      prisma.lead.count.mockResolvedValue(6);

      const result = await service.leads(manager, { range: 'today' });

      expect(result.newLeads).toBe(10);
      expect(result.qualifiedLeads).toBe(4);
      expect(result.contactedLeads).toBe(0);
      expect(result.hotLeads).toBe(6);
      expect(result.funnel.find((s) => s.status === 'NEW')?.count).toBe(10);
    });

    it('scopes the groupBy and hot-lead count to the current user for a sales executive', async () => {
      await service.leads(executive, { range: 'today' });

      const groupByWhere = prisma.lead.groupBy.mock.calls[0][0].where as {
        assignedToId?: string;
      };
      const countWhere = prisma.lead.count.mock.calls[0][0].where as {
        assignedToId?: string;
      };
      expect(groupByWhere.assignedToId).toBe('exec-1');
      expect(countWhere.assignedToId).toBe('exec-1');
    });
  });

  describe('sales', () => {
    it('joins pipeline stages with deal totals, defaulting stages with no deals to zero', async () => {
      prisma.pipelineStage.findMany.mockResolvedValue([
        { id: 'stage-1', name: 'New', order: 0 },
        { id: 'stage-2', name: 'Negotiation', order: 1 },
      ]);
      prisma.deal.groupBy.mockResolvedValue([
        { stageId: 'stage-1', _sum: { value: 50000 }, _count: { _all: 3 } },
      ]);

      const result = await service.sales(manager, { range: 'today' });

      expect(result.pipelineByStage).toEqual([
        {
          stageId: 'stage-1',
          stageName: 'New',
          order: 0,
          value: 50000,
          dealCount: 3,
        },
        {
          stageId: 'stage-2',
          stageName: 'Negotiation',
          order: 1,
          value: 0,
          dealCount: 0,
        },
      ]);
      expect(result.totalPipelineValue).toBe(50000);
    });

    it('computes conversionRate as won deals over new leads in range', async () => {
      prisma.lead.count
        .mockResolvedValueOnce(5) // wonDeals
        .mockResolvedValueOnce(1) // lostDeals
        .mockResolvedValueOnce(20); // newLeads

      const result = await service.sales(manager, { range: 'month' });

      expect(result.wonDeals).toBe(5);
      expect(result.lostDeals).toBe(1);
      expect(result.conversionRate).toBe(25);
    });

    it('sums revenueOverTime day buckets into the top-level revenue figure', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { date: '2026-08-01', revenue: 10000 },
        { date: '2026-08-02', revenue: 5000 },
      ]);

      const result = await service.sales(manager, {
        range: 'custom',
        from: '2026-08-01',
        to: '2026-08-02',
      });

      expect(result.revenueOverTime).toEqual([
        { date: '2026-08-01', revenue: 10000 },
        { date: '2026-08-02', revenue: 5000 },
      ]);
      expect(result.revenue).toBe(15000);
    });

    it('scopes deal totals by ownerId for a sales executive', async () => {
      await service.sales(executive, { range: 'today' });

      const dealWhere = prisma.deal.groupBy.mock.calls[0][0].where as {
        ownerId?: string;
      };
      expect(dealWhere.ownerId).toBe('exec-1');
    });
  });

  describe('ai', () => {
    it('reads AI call counts scoped to callMode AI', async () => {
      prisma.call.count
        .mockResolvedValueOnce(40) // aiCalls
        .mockResolvedValueOnce(30) // successfulCalls
        .mockResolvedValueOnce(4) // humanTransfers
        .mockResolvedValueOnce(6); // failedAiCalls

      const result = await service.ai(manager, { range: 'today' });

      expect(result.aiCalls).toBe(40);
      expect(result.successfulCalls).toBe(30);
      expect(result.humanTransfers).toBe(4);
      expect(result.failedAiCalls).toBe(6);

      const [[aiCallsArg]] = prisma.call.count.mock.calls as [
        [{ where: { callMode: string } }],
      ];
      expect(aiCallsArg.where.callMode).toBe('AI');
    });

    it('rounds the average quality score to one decimal', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ avg_quality: 82.456 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.ai(manager, { range: 'today' });

      expect(result.avgQualityScore).toBe(82.5);
    });

    it('returns the top objections and customer questions with their counts', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ avg_quality: null }])
        .mockResolvedValueOnce([{ text: 'Price too high', count: 7 }])
        .mockResolvedValueOnce([{ text: 'Contract length', count: 5 }]);

      const result = await service.ai(manager, { range: 'today' });

      expect(result.topObjections).toEqual([
        { objection: 'Price too high', count: 7 },
      ]);
      expect(result.topCustomerQuestions).toEqual([
        { question: 'Contract length', count: 5 },
      ]);
    });
  });
});
