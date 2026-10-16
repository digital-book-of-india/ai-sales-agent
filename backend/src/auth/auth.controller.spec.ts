import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Role } from '../../generated/prisma/enums';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    role: Role.SALES_EXECUTIVE,
  };

  function mockResponse() {
    return {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
  }

  function asResponse(res: ReturnType<typeof mockResponse>): Response {
    return res as unknown as Response;
  }

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('logs in and sets the refresh token cookie', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: mockUser,
    });
    const res = mockResponse();

    const result = await controller.login(
      { email: mockUser.email, password: 'correct-password' },
      asResponse(res),
    );

    expect(result).toEqual({ accessToken: 'access-token', user: mockUser });
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, path: '/auth' }),
    );
  });

  it('rejects refresh when no cookie is present', async () => {
    const res = mockResponse();

    await expect(
      controller.refresh({ cookies: {} } as never, asResponse(res)),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('clears the cookie on logout', async () => {
    const res = mockResponse();

    const result = await controller.logout(
      { cookies: { refreshToken: 'refresh-token' } } as never,
      asResponse(res),
    );

    expect(authService.logout).toHaveBeenCalledWith('refresh-token');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({ path: '/auth' }),
    );
    expect(result).toEqual({ success: true });
  });
});
