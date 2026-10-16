import { Test } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardService: { stats: jest.Mock; charts: jest.Mock };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: Role.SALES_MANAGER,
  };

  beforeEach(async () => {
    dashboardService = {
      stats: jest.fn(),
      charts: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboardService }],
    }).compile();

    controller = moduleRef.get(DashboardController);
  });

  it('delegates stats to the service with the current user and query', () => {
    const query = { range: 'week' as const };

    void controller.stats(user, query);

    expect(dashboardService.stats).toHaveBeenCalledWith(user, query);
  });

  it('delegates charts to the service with the current user and query', () => {
    const query = { range: 'month' as const };

    void controller.charts(user, query);

    expect(dashboardService.charts).toHaveBeenCalledWith(user, query);
  });
});
