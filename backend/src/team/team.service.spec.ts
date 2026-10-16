import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('TeamService', () => {
  let service: TeamService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $queryRaw: jest.Mock;
    lead: { groupBy: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendTeamInviteEmail: jest.Mock };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: Role.ADMIN,
  };
  const manager: AuthenticatedUser = {
    id: 'manager-1',
    email: 'manager@example.com',
    role: Role.SALES_MANAGER,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      lead: { groupBy: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    mail = { sendTeamInviteEmail: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = moduleRef.get(TeamService);
  });

  describe('list', () => {
    it('scopes a SALES_MANAGER to their executives plus themselves', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.list(manager, { range: 'month' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ role: Role.SALES_EXECUTIVE }, { id: manager.id }],
          },
        }),
      );
    });

    it('does not scope an ADMIN — sees everyone', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.list(admin, { range: 'month' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('attaches per-member call/conversion/revenue performance', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'exec-1',
          name: 'Exec One',
          email: 'exec1@example.com',
          role: Role.SALES_EXECUTIVE,
          isActive: true,
          createdAt: new Date(),
        },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ userId: 'exec-1', calls: 12 }]);
      prisma.lead.groupBy.mockResolvedValue([
        {
          assignedToId: 'exec-1',
          _count: { _all: 3 },
          _sum: { budget: 50000 },
        },
      ]);

      const result = await service.list(admin, {
        range: 'month',
      });

      expect(result).toEqual([
        expect.objectContaining({
          id: 'exec-1',
          performance: { callsMade: 12, leadsConverted: 3, revenue: 50000 },
        }),
      ]);
    });

    it('short-circuits without querying calls/leads when there are no members', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.list(admin, {
        range: 'month',
      });

      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.lead.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('invite', () => {
    const dto = {
      name: 'New Hire',
      email: 'new@example.com',
      password: 'a-strong-password',
    };

    it('creates the user with the admin-set password and emails the invite', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-1',
        name: 'New Hire',
        email: 'new@example.com',
        role: Role.SALES_EXECUTIVE,
        isActive: true,
        createdAt: new Date(),
      });

      const result = await service.invite(admin, dto);

      expect(result.performance).toEqual({
        callsMade: 0,
        leadsConverted: 0,
        revenue: 0,
      });
      const [[createArg]] = prisma.user.create.mock.calls as [
        [{ data: { passwordHash: string } }],
      ];
      expect(createArg.data.passwordHash).not.toBe(dto.password);
      expect(mail.sendTeamInviteEmail).toHaveBeenCalledWith(
        'new@example.com',
        'New Hire',
      );
    });

    it('defaults role to SALES_EXECUTIVE when omitted', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-1',
        name: 'New Hire',
        email: 'new@example.com',
        role: Role.SALES_EXECUTIVE,
        isActive: true,
        createdAt: new Date(),
      });

      await service.invite(admin, dto);

      const [[createArg]] = prisma.user.create.mock.calls as [
        [{ data: { role: Role } }],
      ];
      expect(createArg.data.role).toBe(Role.SALES_EXECUTIVE);
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-1' });

      await expect(service.invite(admin, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('forbids a SALES_MANAGER from inviting an admin', async () => {
      await expect(
        service.invite(manager, { ...dto, role: Role.ADMIN }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException for an unknown member', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update(admin, 'missing-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('forbids managing your own membership', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: admin.id,
        role: Role.ADMIN,
      });

      await expect(
        service.update(admin, admin.id, { name: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids a SALES_MANAGER from editing an admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        role: Role.ADMIN,
      });

      await expect(
        service.update(manager, 'admin-2', { name: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids a SALES_MANAGER from promoting a user to admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'exec-1',
        role: Role.SALES_EXECUTIVE,
      });

      await expect(
        service.update(manager, 'exec-1', { role: Role.ADMIN }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates name/role for an allowed target', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'exec-1',
        role: Role.SALES_EXECUTIVE,
      });
      prisma.user.update.mockResolvedValue({
        id: 'exec-1',
        role: Role.SALES_MANAGER,
      });

      await service.update(admin, 'exec-1', { role: Role.SALES_MANAGER });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exec-1' },
          data: { name: undefined, role: Role.SALES_MANAGER },
        }),
      );
    });
  });

  describe('deactivate', () => {
    it('flips isActive off and revokes live refresh tokens in one transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'exec-1',
        role: Role.SALES_EXECUTIVE,
      });
      prisma.$transaction.mockResolvedValue([
        { id: 'exec-1', isActive: false },
        { count: 1 },
      ]);

      const result = await service.deactivate(admin, 'exec-1');

      expect(result).toEqual({ id: 'exec-1', isActive: false });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('forbids deactivating yourself', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: admin.id,
        role: Role.ADMIN,
      });

      await expect(service.deactivate(admin, admin.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('activate', () => {
    it('flips isActive back on', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'exec-1',
        role: Role.SALES_EXECUTIVE,
      });
      prisma.user.update.mockResolvedValue({ id: 'exec-1', isActive: true });

      const result = await service.activate(admin, 'exec-1');

      expect(result).toEqual({ id: 'exec-1', isActive: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
    });
  });
});
