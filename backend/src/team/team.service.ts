import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Prisma } from '../../generated/prisma/client';
import { LeadStatus, Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { resolveDateRange } from '../dashboard/dashboard-date-range';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

const BCRYPT_SALT_ROUNDS = 12;

const MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

interface CallCountRow {
  userId: string;
  calls: bigint | number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  performance: {
    callsMade: number;
    leadsConverted: number;
    revenue: number;
  };
}

/**
 * Owns team management (Prompt 20): the Team page's roster + per-user
 * performance, and inviting/editing/deactivating members. Every write here
 * (and the roster read) is restricted to ADMIN/SALES_MANAGER at the
 * controller (see team.controller.ts); this service additionally stops a
 * SALES_MANAGER from managing an ADMIN account or their own membership,
 * since the roles guard alone can't express that.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // There's no managerId/reporting-line field on User (schema.prisma) — a
  // SALES_MANAGER's "team" is every SALES_EXECUTIVE plus themselves; an
  // ADMIN's is everyone, including other admins/managers.
  private scopeWhere(actor: AuthenticatedUser): Prisma.UserWhereInput {
    if (actor.role === Role.SALES_MANAGER) {
      return { OR: [{ role: Role.SALES_EXECUTIVE }, { id: actor.id }] };
    }
    return {};
  }

  private async getMember(id: string) {
    const member = await this.prisma.user.findUnique({
      where: { id },
      select: MEMBER_SELECT,
    });
    if (!member) {
      throw new NotFoundException('Team member not found');
    }
    return member;
  }

  /** A SALES_MANAGER may not manage (edit/deactivate/reactivate) an ADMIN
   * account or their own — both fall outside what class-level @Roles can
   * express. ADMIN can manage anyone but themselves. */
  private assertCanManage(
    actor: AuthenticatedUser,
    target: { id: string; role: Role },
  ) {
    if (target.id === actor.id) {
      throw new ForbiddenException(
        'You cannot manage your own team membership',
      );
    }
    if (actor.role === Role.SALES_MANAGER && target.role === Role.ADMIN) {
      throw new ForbiddenException(
        'Sales managers cannot manage admin accounts',
      );
    }
  }

  /** Roster + performance for the Team page — calls made, leads converted,
   * and revenue are all scoped to leads assigned to that member (same
   * assignedToId convention AnalyticsService/DashboardService use for a
   * SALES_EXECUTIVE's own scope), within the requested date range. */
  async list(
    actor: AuthenticatedUser,
    query: QueryDashboardDto,
  ): Promise<TeamMember[]> {
    const { from, to } = resolveDateRange(query.range, query.from, query.to);

    const members = await this.prisma.user.findMany({
      where: this.scopeWhere(actor),
      select: MEMBER_SELECT,
      orderBy: { name: 'asc' },
    });
    if (members.length === 0) return [];

    const memberIds = members.map((m) => m.id);

    const [callCounts, leadStats] = await Promise.all([
      this.prisma.$queryRaw<CallCountRow[]>(Prisma.sql`
        SELECT l."assignedToId" AS "userId", COUNT(*)::int AS calls
        FROM calls c
        JOIN leads l ON l.id = c."leadId"
        WHERE l."assignedToId" = ANY(${memberIds}::uuid[])
          AND l."deletedAt" IS NULL
          AND c."createdAt" BETWEEN ${from} AND ${to}
        GROUP BY 1
      `),
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: memberIds },
          deletedAt: null,
          status: LeadStatus.WON,
          updatedAt: { gte: from, lte: to },
        },
        _count: { _all: true },
        _sum: { budget: true },
      }),
    ]);

    const callsByUser = new Map(
      callCounts.map((row) => [row.userId, Number(row.calls)]),
    );
    const leadsByUser = new Map(
      leadStats.map((row) => [
        row.assignedToId,
        { converted: row._count._all, revenue: row._sum.budget ?? 0 },
      ]),
    );

    return members.map((member) => ({
      ...member,
      performance: {
        callsMade: callsByUser.get(member.id) ?? 0,
        leadsConverted: leadsByUser.get(member.id)?.converted ?? 0,
        revenue: leadsByUser.get(member.id)?.revenue ?? 0,
      },
    }));
  }

  /** Creates the user with the password the inviting admin/manager set
   * directly on the invite form — they share it with the new hire out of
   * band, who can log in with it immediately (no set-password link/email
   * step, unlike AuthService.forgotPassword's flow). */
  async invite(actor: AuthenticatedUser, dto: InviteTeamMemberDto) {
    const role = dto.role ?? Role.SALES_EXECUTIVE;
    if (actor.role === Role.SALES_MANAGER && role === Role.ADMIN) {
      throw new ForbiddenException('Sales managers cannot invite admins');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A user with that email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const member = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role },
      select: MEMBER_SELECT,
    });

    await this.mail.sendTeamInviteEmail(member.email, member.name);

    return {
      ...member,
      performance: { callsMade: 0, leadsConverted: 0, revenue: 0 },
    };
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTeamMemberDto) {
    const target = await this.getMember(id);
    this.assertCanManage(actor, target);
    if (dto.role === Role.ADMIN && actor.role === Role.SALES_MANAGER) {
      throw new ForbiddenException(
        'Sales managers cannot promote a user to admin',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: { name: dto.name, role: dto.role },
      select: MEMBER_SELECT,
    });
  }

  /** Flips isActive off (see User.isActive in schema.prisma) and revokes
   * every live refresh token so an active session can't keep using the
   * account after deactivation — the next access-token expiry (or refresh
   * attempt) then hits AuthService.refresh's revokedAt check. */
  async deactivate(actor: AuthenticatedUser, id: string) {
    const target = await this.getMember(id);
    this.assertCanManage(actor, target);

    const [member] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false },
        select: MEMBER_SELECT,
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return member;
  }

  async activate(actor: AuthenticatedUser, id: string) {
    const target = await this.getMember(id);
    this.assertCanManage(actor, target);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: MEMBER_SELECT,
    });
  }
}
