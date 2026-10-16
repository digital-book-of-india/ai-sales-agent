import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MeetingsService } from './meetings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MeetingStatus, Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('MeetingsService', () => {
  let service: MeetingsService;
  let prisma: {
    meeting: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    lead: { findFirst: jest.Mock };
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

  const meetingRow = {
    id: 'mtg-1',
    leadId: 'lead-1',
    date: new Date('2026-08-29T00:00:00.000Z'),
    time: '15:00',
    salespersonId: 'exec-1',
    meetingType: 'Demo',
    meetingLink: null,
    notes: null,
    status: MeetingStatus.SCHEDULED,
    createdAt: new Date(),
    updatedAt: new Date(),
    lead: {
      id: 'lead-1',
      name: 'Priya Sharma',
      phone: '9990001111',
      companyName: null,
      assignedToId: 'exec-1',
    },
    salesperson: { id: 'exec-1', name: 'Executive' },
  };

  beforeEach(async () => {
    prisma = {
      meeting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lead: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    activity = { record: jest.fn() };
    notifications = { create: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MeetingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityService, useValue: activity },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(MeetingsService);
  });

  describe('findAll', () => {
    it('scopes a SALES_EXECUTIVE to their own meetings', async () => {
      await service.findAll(exec, {});

      const [[{ where }]] = prisma.meeting.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where).toMatchObject({ salespersonId: 'exec-1' });
    });

    it('does not scope a manager', async () => {
      await service.findAll(manager, {});

      const [[{ where }]] = prisma.meeting.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(where.salespersonId).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates a meeting and logs activity when the lead is accessible', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'exec-1' });
      prisma.meeting.create.mockResolvedValue(meetingRow);

      const result = await service.create(exec, {
        leadId: 'lead-1',
        date: '2026-08-29',
        time: '15:00',
        meetingType: 'Demo',
      });

      expect(prisma.meeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            time: '15:00',
            salespersonId: 'exec-1',
            meetingType: 'Demo',
          }) as Record<string, unknown>,
        }),
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: 'lead-1',
          type: 'MEETING_SCHEDULED',
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'exec-1',
          type: 'MEETING_SCHEDULED',
          leadId: 'lead-1',
        }),
      );
      expect(result).toEqual(meetingRow);
    });

    it('forces salespersonId to the caller for a SALES_EXECUTIVE', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'exec-1' });
      prisma.meeting.create.mockResolvedValue(meetingRow);

      await service.create(exec, {
        leadId: 'lead-1',
        date: '2026-08-29',
        time: '15:00',
        meetingType: 'Demo',
        salespersonId: 'someone-else',
      });

      expect(prisma.meeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ salespersonId: 'exec-1' }),
        }),
      );
    });

    it('rejects a SALES_EXECUTIVE scheduling a meeting for a lead not assigned to them', async () => {
      prisma.lead.findFirst.mockResolvedValue({ assignedToId: 'someone-else' });

      await expect(
        service.create(exec, {
          leadId: 'lead-1',
          date: '2026-08-29',
          time: '15:00',
          meetingType: 'Demo',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.meeting.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing lead', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.create(manager, {
          leadId: 'missing',
          date: '2026-08-29',
          time: '15:00',
          meetingType: 'Demo',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne / update / remove', () => {
    it("throws ForbiddenException when a SALES_EXECUTIVE accesses another rep's meeting", async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        ...meetingRow,
        salespersonId: 'someone-else',
      });

      await expect(service.findOne(exec, 'mtg-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('updates status via update()', async () => {
      prisma.meeting.findUnique.mockResolvedValue(meetingRow);
      prisma.meeting.update.mockResolvedValue({
        ...meetingRow,
        status: MeetingStatus.COMPLETED,
      });

      const result = await service.update(manager, 'mtg-1', {
        status: MeetingStatus.COMPLETED,
      });

      expect(prisma.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mtg-1' },
          data: expect.objectContaining({ status: MeetingStatus.COMPLETED }),
        }),
      );
      expect(result.status).toBe(MeetingStatus.COMPLETED);
    });

    it('rejects a SALES_EXECUTIVE reassigning a meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue(meetingRow);

      await expect(
        service.update(exec, 'mtg-1', { salespersonId: 'someone-else' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deletes a meeting via remove()', async () => {
      prisma.meeting.findUnique.mockResolvedValue(meetingRow);

      await service.remove(manager, 'mtg-1');

      expect(prisma.meeting.delete).toHaveBeenCalledWith({
        where: { id: 'mtg-1' },
      });
    });
  });
});
