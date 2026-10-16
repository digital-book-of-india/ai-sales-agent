import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: { findAllBasic: jest.Mock; getSipCredentials: jest.Mock };

  const user: AuthenticatedUser = {
    id: 'exec-1',
    email: 'exec@example.com',
    role: Role.SALES_EXECUTIVE,
  };

  beforeEach(async () => {
    usersService = {
      findAllBasic: jest.fn(),
      getSipCredentials: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = moduleRef.get(UsersController);
  });

  it('delegates findAll to the service', () => {
    void controller.findAll();

    expect(usersService.findAllBasic).toHaveBeenCalled();
  });

  it('delegates getMySipCredentials to the service scoped to the current user', () => {
    void controller.getMySipCredentials(user);

    expect(usersService.getSipCredentials).toHaveBeenCalledWith('exec-1');
  });
});
