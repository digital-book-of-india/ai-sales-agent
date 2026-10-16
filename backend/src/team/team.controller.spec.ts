import { Test } from '@nestjs/testing';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';

describe('TeamController', () => {
  let controller: TeamController;
  let teamService: {
    list: jest.Mock;
    invite: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
    activate: jest.Mock;
  };

  const user: AuthenticatedUser = {
    id: 'manager-1',
    email: 'manager@example.com',
    role: Role.SALES_MANAGER,
  };

  beforeEach(async () => {
    teamService = {
      list: jest.fn(),
      invite: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      activate: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TeamController],
      providers: [{ provide: TeamService, useValue: teamService }],
    }).compile();

    controller = moduleRef.get(TeamController);
  });

  it('delegates list to the service with the current user and query', () => {
    const query: QueryDashboardDto = { range: 'month' };
    void controller.list(user, query);

    expect(teamService.list).toHaveBeenCalledWith(user, query);
  });

  it('delegates invite to the service with the current user and dto', () => {
    const dto = {
      name: 'New Hire',
      email: 'new@example.com',
      password: 'a-strong-password',
    };
    void controller.invite(user, dto);

    expect(teamService.invite).toHaveBeenCalledWith(user, dto);
  });

  it('delegates update to the service with the current user, id, and dto', () => {
    const dto = { name: 'Renamed' };
    void controller.update(user, 'exec-1', dto);

    expect(teamService.update).toHaveBeenCalledWith(user, 'exec-1', dto);
  });

  it('delegates deactivate to the service scoped to the current user', () => {
    void controller.deactivate(user, 'exec-1');

    expect(teamService.deactivate).toHaveBeenCalledWith(user, 'exec-1');
  });

  it('delegates activate to the service scoped to the current user', () => {
    void controller.activate(user, 'exec-1');

    expect(teamService.activate).toHaveBeenCalledWith(user, 'exec-1');
  });
});
