import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Role } from '../../generated/prisma/enums';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: { findByEmail: jest.Mock; findById: jest.Mock };
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock };
    user: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailService: { sendPasswordResetEmail: jest.Mock };

  const mockUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: '',
    role: Role.SALES_EXECUTIVE,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('correct-password', 4);

    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    prisma = {
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn() },
      user: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    mailService = { sendPasswordResetEmail: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const values: Record<string, string> = {
                JWT_ACCESS_TOKEN_TTL: '15m',
                JWT_REFRESH_TOKEN_TTL_DAYS: '30',
                PASSWORD_RESET_TOKEN_TTL_MINUTES: '60',
              };
              return values[key];
            },
            getOrThrow: () => 'test-secret',
          },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns an access token, refresh token, and user on valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login(
        'test@example.com',
        'correct-password',
      );

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('missing@example.com', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the password is wrong', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        authService.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a deactivated user even with the correct password', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(
        authService.login('test@example.com', 'correct-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(authService.refresh('bogus-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: mockUser,
      });

      await expect(authService.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotates a valid refresh token and issues a new access token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: mockUser,
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.refresh('valid-token');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await authService.logout('some-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no refresh token is provided', async () => {
      await authService.logout(undefined);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
