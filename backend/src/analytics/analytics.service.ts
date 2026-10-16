import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Prisma } from '../../generated/prisma/client';
import {
  CallStatus,
  LeadPriority,
  LeadStatus,
  Role,
} from '../../generated/prisma/enums';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import {
  buildDayBuckets,
  resolveDateRange,
} from '../dashboard/dashboard-date-range';
import { FUNNEL_STAGES, STATUS_LABEL } from '../dashboard/dashboard.service';

const FAILED_CALL_STATUSES: CallStatus[] = [
  CallStatus.FAILED,
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.CANCELLED,
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface CallSummaryRow {
  total: bigint | number;
  connected: bigint | number;
  failed: bigint | number;
  avg_duration: number | null;
  distinct_queue: bigint | number;
}

interface CallTrendRow {
  date: string;
  total: bigint | number;
  connected: bigint | number;
  failed: bigint | number;
}

interface RevenueRow {
  date: string;
  revenue: bigint | number | null;
}

interface QualityRow {
  avg_quality: number | null;
}

interface TextCountRow {
  text: string;
  count: bigint | number;
}

/**
 * Owns the four Analytics page aggregation endpoints (Prompt 17). Every
 * figure is computed with a DB-side aggregate (Prisma count/aggregate/
 * groupBy, or a raw SQL GROUP BY for the shapes Prisma can't express — day
 * bucketing and JSON-array fan-out) — never by pulling rows and reducing
 * them in Node. Date-range handling and role scoping mirror DashboardService
 * exactly, down to reusing its DTO, range resolver, and funnel constants, so
 * the two pages never disagree on what a given figure means.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** SALES_EXECUTIVE only sees their own leads' calls/leads; everyone else
   * (manager/admin) sees everything. Same posture as DashboardService. */
  private leadScopeWhere(user: AuthenticatedUser): Prisma.LeadWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { assignedToId: user.id };
    }
    return {};
  }

  /** The equivalent scope as a raw-SQL fragment, joined against a `leads l`
   * alias — `Prisma.empty` for anyone who isn't scoped. */
  private leadScopeSql(user: AuthenticatedUser): Prisma.Sql {
    return user.role === Role.SALES_EXECUTIVE
      ? Prisma.sql`AND l."assignedToId" = ${user.id}::uuid`
      : Prisma.empty;
  }

  private dealScopeWhere(user: AuthenticatedUser): Prisma.DealWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { ownerId: user.id };
    }
    return {};
  }

  // ---------------------------------------------------------------------
  // 1. Call Analytics
  // ---------------------------------------------------------------------
  async calls(user: AuthenticatedUser, query: QueryDashboardDto) {
    const { from, to } = resolveDateRange(query.range, query.from, query.to);
    const scopeSql = this.leadScopeSql(user);

    const [summaryRows, trendRows] = await Promise.all([
      this.prisma.$queryRaw<CallSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE c.status = 'COMPLETED')::int AS connected,
          COUNT(*) FILTER (WHERE c.status IN ('FAILED','NO_ANSWER','BUSY','CANCELLED'))::int AS failed,
          AVG(c.duration) FILTER (WHERE c.duration IS NOT NULL) AS avg_duration,
          COUNT(DISTINCT c."queueItemId")::int AS distinct_queue
        FROM calls c
        JOIN leads l ON l.id = c."leadId"
        WHERE c."createdAt" BETWEEN ${from} AND ${to}
          AND l."deletedAt" IS NULL
          ${scopeSql}
      `),
      this.prisma.$queryRaw<CallTrendRow[]>(Prisma.sql`
        SELECT
          to_char(date_trunc('day', c."createdAt"), 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE c.status = 'COMPLETED')::int AS connected,
          COUNT(*) FILTER (WHERE c.status IN ('FAILED','NO_ANSWER','BUSY','CANCELLED'))::int AS failed
        FROM calls c
        JOIN leads l ON l.id = c."leadId"
        WHERE c."createdAt" BETWEEN ${from} AND ${to}
          AND l."deletedAt" IS NULL
          ${scopeSql}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    const summary = summaryRows[0];
    const totalCalls = Number(summary?.total ?? 0);
    const connectedCalls = Number(summary?.connected ?? 0);
    const failedCalls = Number(summary?.failed ?? 0);
    const distinctQueueItems = Number(summary?.distinct_queue ?? 0);

    const byDate = new Map(
      trendRows.map((row) => [
        row.date,
        {
          totalCalls: Number(row.total),
          connectedCalls: Number(row.connected),
          failedCalls: Number(row.failed),
        },
      ]),
    );
    const trend = buildDayBuckets(from, to).map((date) => ({
      date,
      ...(byDate.get(date) ?? {
        totalCalls: 0,
        connectedCalls: 0,
        failedCalls: 0,
      }),
    }));

    return {
      totalCalls,
      connectedCalls,
      failedCalls,
      answerRate:
        totalCalls > 0 ? round1((connectedCalls / totalCalls) * 100) : 0,
      avgDuration: Math.round(summary?.avg_duration ?? 0),
      retryRate:
        totalCalls > 0
          ? round1(((totalCalls - distinctQueueItems) / totalCalls) * 100)
          : 0,
      trend,
    };
  }

  // ---------------------------------------------------------------------
  // 2. Lead Analytics
  // ---------------------------------------------------------------------
  async leads(user: AuthenticatedUser, query: QueryDashboardDto) {
    const { from, to } = resolveDateRange(query.range, query.from, query.to);
    const baseWhere: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...this.leadScopeWhere(user),
    };
    const rangeWhere: Prisma.LeadWhereInput = {
      ...baseWhere,
      createdAt: { gte: from, lte: to },
    };

    const [statusCounts, hotLeads] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['status'],
        where: rangeWhere,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: { ...baseWhere, priority: LeadPriority.HIGH },
      }),
    ]);

    const countByStatus = new Map(
      statusCounts.map((row) => [row.status, row._count._all]),
    );
    const countFor = (status: LeadStatus) => countByStatus.get(status) ?? 0;

    const funnel = FUNNEL_STAGES.map((status) => ({
      status,
      label: STATUS_LABEL[status],
      count: countFor(status),
    }));

    return {
      newLeads: countFor(LeadStatus.NEW),
      contactedLeads: countFor(LeadStatus.CONTACTED),
      interestedLeads: countFor(LeadStatus.INTERESTED),
      qualifiedLeads: countFor(LeadStatus.QUALIFIED),
      hotLeads,
      funnel,
    };
  }

  // ---------------------------------------------------------------------
  // 3. Sales Analytics
  // ---------------------------------------------------------------------
  async sales(user: AuthenticatedUser, query: QueryDashboardDto) {
    const { from, to } = resolveDateRange(query.range, query.from, query.to);
    const leadBaseWhere: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...this.leadScopeWhere(user),
    };
    const wonInRange: Prisma.LeadWhereInput = {
      ...leadBaseWhere,
      status: LeadStatus.WON,
      updatedAt: { gte: from, lte: to },
    };
    const lostInRange: Prisma.LeadWhereInput = {
      ...leadBaseWhere,
      status: LeadStatus.LOST,
      updatedAt: { gte: from, lte: to },
    };
    const newInRange: Prisma.LeadWhereInput = {
      ...leadBaseWhere,
      createdAt: { gte: from, lte: to },
    };
    const dealWhere = this.dealScopeWhere(user);
    const scopeSql = this.leadScopeSql(user);

    const [stages, dealTotals, wonDeals, lostDeals, newLeads, revenueRows] =
      await Promise.all([
        this.prisma.pipelineStage.findMany({
          orderBy: { order: 'asc' },
          select: { id: true, name: true, order: true },
        }),
        this.prisma.deal.groupBy({
          by: ['stageId'],
          where: dealWhere,
          _sum: { value: true },
          _count: { _all: true },
        }),
        this.prisma.lead.count({ where: wonInRange }),
        this.prisma.lead.count({ where: lostInRange }),
        this.prisma.lead.count({ where: newInRange }),
        this.prisma.$queryRaw<RevenueRow[]>(Prisma.sql`
          SELECT
            to_char(date_trunc('day', l."updatedAt"), 'YYYY-MM-DD') AS date,
            COALESCE(SUM(l.budget), 0)::int AS revenue
          FROM leads l
          WHERE l.status = 'WON'
            AND l."deletedAt" IS NULL
            AND l."updatedAt" BETWEEN ${from} AND ${to}
            ${scopeSql}
          GROUP BY 1
          ORDER BY 1
        `),
      ]);

    const dealTotalsByStage = new Map(
      dealTotals.map((row) => [
        row.stageId,
        { value: row._sum.value ?? 0, dealCount: row._count._all },
      ]),
    );
    const pipelineByStage = stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      order: stage.order,
      value: dealTotalsByStage.get(stage.id)?.value ?? 0,
      dealCount: dealTotalsByStage.get(stage.id)?.dealCount ?? 0,
    }));
    const totalPipelineValue = pipelineByStage.reduce(
      (sum, stage) => sum + stage.value,
      0,
    );

    const revenueByDate = new Map(
      revenueRows.map((row) => [row.date, Number(row.revenue ?? 0)]),
    );
    const revenueOverTime = buildDayBuckets(from, to).map((date) => ({
      date,
      revenue: revenueByDate.get(date) ?? 0,
    }));
    const revenue = revenueOverTime.reduce(
      (sum, point) => sum + point.revenue,
      0,
    );

    return {
      pipelineByStage,
      totalPipelineValue,
      wonDeals,
      lostDeals,
      revenue,
      conversionRate: newLeads > 0 ? round1((wonDeals / newLeads) * 100) : 0,
      revenueOverTime,
    };
  }

  // ---------------------------------------------------------------------
  // 4. AI Analytics
  // ---------------------------------------------------------------------
  async ai(user: AuthenticatedUser, query: QueryDashboardDto) {
    const { from, to } = resolveDateRange(query.range, query.from, query.to);
    const leadWhere: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...this.leadScopeWhere(user),
    };
    const aiCallWhere: Prisma.CallWhereInput = {
      callMode: 'AI',
      createdAt: { gte: from, lte: to },
      lead: leadWhere,
    };
    const scopeSql = this.leadScopeSql(user);

    const [
      aiCalls,
      successfulCalls,
      humanTransfers,
      failedAiCalls,
      qualityRows,
      objectionRows,
      questionRows,
    ] = await Promise.all([
      this.prisma.call.count({ where: aiCallWhere }),
      this.prisma.call.count({
        where: { ...aiCallWhere, status: CallStatus.COMPLETED },
      }),
      this.prisma.call.count({
        where: { ...aiCallWhere, transferredToHuman: true },
      }),
      this.prisma.call.count({
        where: { ...aiCallWhere, status: { in: FAILED_CALL_STATUSES } },
      }),
      this.prisma.$queryRaw<QualityRow[]>(Prisma.sql`
        SELECT AVG((ca."qualityScore"->>'total')::numeric) AS avg_quality
        FROM call_analyses ca
        JOIN calls c ON c.id = ca."callId"
        JOIN leads l ON l.id = c."leadId"
        WHERE c."callMode" = 'AI'
          AND c."createdAt" BETWEEN ${from} AND ${to}
          AND l."deletedAt" IS NULL
          ${scopeSql}
      `),
      this.prisma.$queryRaw<TextCountRow[]>(Prisma.sql`
        SELECT obj->>'objection' AS text, COUNT(*)::int AS count
        FROM calls c
        JOIN call_analyses ca ON ca."callId" = c.id
        JOIN leads l ON l.id = c."leadId"
        CROSS JOIN LATERAL jsonb_array_elements(ca.objections) AS obj
        WHERE c."callMode" = 'AI'
          AND c."createdAt" BETWEEN ${from} AND ${to}
          AND l."deletedAt" IS NULL
          ${scopeSql}
        GROUP BY 1
        ORDER BY count DESC, text ASC
        LIMIT 10
      `),
      this.prisma.$queryRaw<TextCountRow[]>(Prisma.sql`
        SELECT q AS text, COUNT(*)::int AS count
        FROM calls c
        JOIN call_analyses ca ON ca."callId" = c.id
        JOIN leads l ON l.id = c."leadId"
        CROSS JOIN LATERAL jsonb_array_elements_text(ca."customerQuestions") AS q
        WHERE c."callMode" = 'AI'
          AND c."createdAt" BETWEEN ${from} AND ${to}
          AND l."deletedAt" IS NULL
          ${scopeSql}
        GROUP BY 1
        ORDER BY count DESC, text ASC
        LIMIT 10
      `),
    ]);

    return {
      aiCalls,
      successfulCalls,
      humanTransfers,
      failedAiCalls,
      avgQualityScore: round1(Number(qualityRows[0]?.avg_quality ?? 0)),
      topObjections: objectionRows.map((row) => ({
        objection: row.text,
        count: Number(row.count),
      })),
      topCustomerQuestions: questionRows.map((row) => ({
        question: row.text,
        count: Number(row.count),
      })),
    };
  }
}
