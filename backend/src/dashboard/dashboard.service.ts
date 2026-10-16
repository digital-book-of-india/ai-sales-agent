import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  FollowUpStatus,
  LeadPriority,
  LeadStatus,
  Role,
} from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { buildDayBuckets, resolveDateRange } from './dashboard-date-range';

const OPEN_DEAL_STATUSES: LeadStatus[] = [
  LeadStatus.QUALIFIED,
  LeadStatus.DEMO_SCHEDULED,
  LeadStatus.PROPOSAL_SENT,
  LeadStatus.NEGOTIATION,
];

// Exported for reuse by AnalyticsService's Lead Analytics conversion funnel
// (Prompt 17) — same stages/labels the Dashboard's own funnel chart uses, so
// the two pages never disagree on what "the funnel" means.
export const FUNNEL_STAGES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.INTERESTED,
  LeadStatus.QUALIFIED,
  LeadStatus.DEMO_SCHEDULED,
  LeadStatus.PROPOSAL_SENT,
  LeadStatus.NEGOTIATION,
  LeadStatus.WON,
];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  QUALIFIED: 'Qualified',
  DEMO_SCHEDULED: 'Demo scheduled',
  PROPOSAL_SENT: 'Proposal sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  NOT_INTERESTED: 'Not interested',
  CALL_LATER: 'Call later',
  INVALID: 'Invalid',
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private scopeWhere(user: AuthenticatedUser): Prisma.LeadWhereInput {
    if (user.role === Role.SALES_EXECUTIVE) {
      return { assignedToId: user.id };
    }
    return {};
  }

  async stats(user: AuthenticatedUser, query: QueryDashboardDto) {
    const { from, to } = resolveDateRange(query.range, query.from, query.to);
    const baseWhere: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...this.scopeWhere(user),
    };
    const createdInRange: Prisma.LeadWhereInput = {
      ...baseWhere,
      createdAt: { gte: from, lte: to },
    };
    const wonInRange: Prisma.LeadWhereInput = {
      ...baseWhere,
      status: LeadStatus.WON,
      updatedAt: { gte: from, lte: to },
    };
    const lostInRange: Prisma.LeadWhereInput = {
      ...baseWhere,
      status: LeadStatus.LOST,
      updatedAt: { gte: from, lte: to },
    };

    const [
      totalLeads,
      newLeads,
      interestedLeads,
      hotLeads,
      warmLeads,
      followUpsDue,
      openDeals,
      wonDeals,
      lostDeals,
      revenueAgg,
    ] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: baseWhere }),
      this.prisma.lead.count({ where: createdInRange }),
      this.prisma.lead.count({
        where: { ...baseWhere, status: LeadStatus.INTERESTED },
      }),
      this.prisma.lead.count({
        where: { ...baseWhere, priority: LeadPriority.HIGH },
      }),
      this.prisma.lead.count({
        where: { ...baseWhere, priority: LeadPriority.MEDIUM },
      }),
      // Prompt 14: counts the real follow_ups table rather than
      // Lead.nextFollowUpAt (a free-text-editable field predating the
      // follow-up engine, not driven by it) — every PENDING follow-up
      // already at/past its dueAt, scoped the same way as every other
      // figure on this page. See FollowUpsService.listDue for the identical
      // query backing the Dashboard's widget.
      this.prisma.followUp.count({
        where: {
          status: FollowUpStatus.PENDING,
          dueAt: { lte: new Date() },
          lead: baseWhere,
        },
      }),
      this.prisma.lead.count({
        where: { ...baseWhere, status: { in: OPEN_DEAL_STATUSES } },
      }),
      this.prisma.lead.count({ where: wonInRange }),
      this.prisma.lead.count({ where: lostInRange }),
      this.prisma.lead.aggregate({
        where: wonInRange,
        _sum: { budget: true },
      }),
    ]);

    const revenue = revenueAgg._sum.budget ?? 0;
    const conversionRate =
      newLeads > 0 ? Math.round((wonDeals / newLeads) * 1000) / 10 : 0;

    return {
      totalLeads,
      newLeads,
      // Call-related figures are zeroed until the Dialer/Calls modules land;
      // callers already read from `range`/`from`/`to` so the real queries can
      // slot in without changing this response shape.
      callsToday: 0,
      connectedCalls: 0,
      failedCalls: 0,
      interestedLeads,
      hotLeads,
      warmLeads,
      followUpsDue,
      meetings: 0,
      openDeals,
      wonDeals,
      lostDeals,
      revenue,
      conversionRate,
      avgCallDuration: 0,
      aiCallSuccessRate: 0,
    };
  }

  async charts(user: AuthenticatedUser, query: QueryDashboardDto) {
    const { from, to } = resolveDateRange(query.range, query.from, query.to);
    const baseWhere: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...this.scopeWhere(user),
    };
    const rangeWhere: Prisma.LeadWhereInput = {
      ...baseWhere,
      createdAt: { gte: from, lte: to },
    };

    const [statusCounts, campaigns] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['status'],
        where: rangeWhere,
        _count: { _all: true },
      }),
      this.prisma.campaign.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          _count: { select: { campaignLeads: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const countByStatus = new Map(
      statusCounts.map((row) => [row.status, row._count._all]),
    );

    const leadFunnel = FUNNEL_STAGES.map((status) => ({
      status,
      label: STATUS_LABEL[status],
      count: countByStatus.get(status) ?? 0,
    }));

    const statusDistribution = Object.values(LeadStatus).map((status) => ({
      status,
      label: STATUS_LABEL[status],
      count: countByStatus.get(status) ?? 0,
    }));

    const campaignPerformance = campaigns.map((campaign) => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      totalLeads: campaign._count.campaignLeads,
      // Zeroed until the Dialer/Calls modules can attribute attempts to a
      // campaign; totalLeads already reflects real data.
      connected: 0,
      interested: 0,
      converted: 0,
      conversionRate: 0,
    }));

    const callsOverTime = buildDayBuckets(from, to).map((date) => ({
      date,
      calls: 0,
      connected: 0,
      failed: 0,
    }));

    return {
      leadFunnel,
      statusDistribution,
      campaignPerformance,
      callsOverTime,
    };
  }
}
