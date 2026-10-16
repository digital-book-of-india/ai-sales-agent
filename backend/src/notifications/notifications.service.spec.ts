import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsGateway } from './notifications.gateway';

describe('NotificationsService', () => {
  let findMany: jest.Mock;
  let count: jest.Mock;
  let create: jest.Mock;
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let updateMany: jest.Mock;
  let userFindFirst: jest.Mock;
  let userFindMany: jest.Mock;
  let gatewayEmit: jest.Mock;
  let prisma: PrismaService;
  let gateway: NotificationsGateway;
  let service: NotificationsService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    count = jest.fn().mockResolvedValue(0);
    create = jest.fn().mockResolvedValue({ id: 'notif-1' });
    findUnique = jest.fn().mockResolvedValue(null);
    update = jest.fn().mockResolvedValue({ id: 'notif-1', readAt: new Date() });
    updateMany = jest.fn().mockResolvedValue({ count: 2 });
    userFindFirst = jest.fn().mockResolvedValue(null);
    userFindMany = jest.fn().mockResolvedValue([]);
    gatewayEmit = jest.fn();

    prisma = {
      notification: { findMany, count, create, findUnique, update, updateMany },
      user: { findFirst: userFindFirst, findMany: userFindMany },
    } as unknown as PrismaService;
    gateway = { emit: gatewayEmit } as unknown as NotificationsGateway;

    service = new NotificationsService(prisma, gateway);
  });

  it('creates a notification with the given fields, defaulting an empty payload', async () => {
    await service.create({
      userId: 'user-1',
      type: 'HUMAN_TRANSFER',
      title: 'Live call transfer',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'HUMAN_TRANSFER',
        title: 'Live call transfer',
        body: undefined,
        leadId: undefined,
        callId: undefined,
        payload: {},
      },
      select: expect.any(Object) as object,
    });
  });

  it('pushes the created row over the notifications websocket, addressed to its recipient', async () => {
    create.mockResolvedValue({ id: 'notif-1', type: 'HOT_LEAD' });

    await service.create({
      userId: 'user-1',
      type: 'HOT_LEAD',
      title: 'Hot lead',
    });

    expect(gatewayEmit).toHaveBeenCalledWith('user-1', {
      id: 'notif-1',
      type: 'HOT_LEAD',
    });
  });

  it('lists notifications for a user, newest first, scoped by userId', async () => {
    await service.listForUser('user-1', { limit: 10 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    );
  });

  it('filters to unread-only when asked', async () => {
    await service.listForUser('user-1', { unreadOnly: true, limit: 5 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', readAt: null },
      }),
    );
  });

  it('counts unread notifications for a user', async () => {
    count.mockResolvedValue(3);
    await expect(service.unreadCount('user-1')).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    });
  });

  it('marks a notification read', async () => {
    findUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      readAt: null,
    });

    await service.markRead('user-1', 'notif-1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-1' },
        data: { readAt: expect.any(Date) as Date },
      }),
    );
  });

  it('is a no-op when the notification is already read', async () => {
    const readAt = new Date('2026-01-01T00:00:00.000Z');
    findUnique.mockResolvedValue({ id: 'notif-1', userId: 'user-1', readAt });

    await service.markRead('user-1', 'notif-1');

    expect(update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a notification belonging to another user', async () => {
    findUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'someone-else',
      readAt: null,
    });

    await expect(service.markRead('user-1', 'notif-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for a notification that does not exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.markRead('user-1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks every unread notification for a user as read', async () => {
    await service.markAllRead('user-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) as Date },
    });
  });

  describe('resolveLeadRecipient', () => {
    it('returns the assigned rep when the lead has one, without querying for a manager', async () => {
      await expect(service.resolveLeadRecipient('rep-1')).resolves.toBe(
        'rep-1',
      );
      expect(userFindFirst).not.toHaveBeenCalled();
    });

    it('falls back to a sales manager, ordered by name, when the lead is unassigned', async () => {
      userFindFirst.mockResolvedValue({ id: 'manager-1' });

      await expect(service.resolveLeadRecipient(null)).resolves.toBe(
        'manager-1',
      );
      expect(userFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'SALES_MANAGER' },
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('returns null when there is neither a rep nor a manager', async () => {
      await expect(service.resolveLeadRecipient(null)).resolves.toBeNull();
    });
  });

  describe('notifyManagers', () => {
    it('creates one notification per manager/admin', async () => {
      userFindMany.mockResolvedValue([{ id: 'manager-1' }, { id: 'admin-1' }]);

      await service.notifyManagers({
        type: 'CAMPAIGN_COMPLETED',
        title: 'Campaign completed',
      });

      expect(userFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: { in: ['SALES_MANAGER', 'ADMIN'] } },
        }),
      );
      expect(create).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'manager-1',
            type: 'CAMPAIGN_COMPLETED',
          }) as object,
        }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'admin-1',
            type: 'CAMPAIGN_COMPLETED',
          }) as object,
        }),
      );
    });

    it('is a no-op when there are no managers or admins', async () => {
      await service.notifyManagers({ type: 'AI_ERROR', title: 'AI error' });

      expect(create).not.toHaveBeenCalled();
    });
  });
});
