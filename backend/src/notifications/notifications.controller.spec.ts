import { Test } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'rep@example.com',
  role: 'SALES_EXECUTIVE',
};

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: {
    listForUser: jest.Mock;
    unreadCount: jest.Mock;
    markRead: jest.Mock;
    markAllRead: jest.Mock;
  };

  beforeEach(async () => {
    notificationsService = {
      listForUser: jest.fn(),
      unreadCount: jest.fn().mockResolvedValue(2),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    controller = moduleRef.get(NotificationsController);
  });

  it('delegates findAll to the service, scoped to the current user', () => {
    void controller.findAll(user, { unreadOnly: true, limit: 10 });

    expect(notificationsService.listForUser).toHaveBeenCalledWith('user-1', {
      unreadOnly: true,
      limit: 10,
    });
  });

  it('wraps the unread count in an object', async () => {
    await expect(controller.unreadCount(user)).resolves.toEqual({ count: 2 });
  });

  it('delegates markRead to the service with the current user and id', () => {
    void controller.markRead(user, 'notif-1');

    expect(notificationsService.markRead).toHaveBeenCalledWith(
      'user-1',
      'notif-1',
    );
  });

  it('delegates markAllRead to the service', async () => {
    await controller.markAllRead(user);

    expect(notificationsService.markAllRead).toHaveBeenCalledWith('user-1');
  });
});
