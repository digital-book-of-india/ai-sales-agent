import { Test } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: {
    calls: jest.Mock;
    leads: jest.Mock;
    sales: jest.Mock;
    ai: jest.Mock;
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: Role.SALES_MANAGER,
  };

  beforeEach(async () => {
    analyticsService = {
      calls: jest.fn(),
      leads: jest.fn(),
      sales: jest.fn(),
      ai: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: analyticsService }],
    }).compile();

    controller = moduleRef.get(AnalyticsController);
  });

  it('delegates calls to the service with the current user and query', () => {
    const query = { range: 'week' as const };

    void controller.calls(user, query);

    expect(analyticsService.calls).toHaveBeenCalledWith(user, query);
  });

  it('delegates leads to the service with the current user and query', () => {
    const query = { range: 'month' as const };

    void controller.leads(user, query);

    expect(analyticsService.leads).toHaveBeenCalledWith(user, query);
  });

  it('delegates sales to the service with the current user and query', () => {
    const query = { range: 'today' as const };

    void controller.sales(user, query);

    expect(analyticsService.sales).toHaveBeenCalledWith(user, query);
  });

  it('delegates ai to the service with the current user and query', () => {
    const query = { range: 'yesterday' as const };

    void controller.ai(user, query);

    expect(analyticsService.ai).toHaveBeenCalledWith(user, query);
  });
});
