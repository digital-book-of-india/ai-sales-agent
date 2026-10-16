import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    config = { get: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('getSipCredentials', () => {
    it('throws ConflictException when the user has no sipExtension/sipPassword set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        sipExtension: null,
        sipPassword: null,
      });

      await expect(service.getSipCredentials('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns an empty wsServers list when ASTERISK_WSS_URI is unconfigured', async () => {
      prisma.user.findUnique.mockResolvedValue({
        sipExtension: '1001',
        sipPassword: 'secret',
      });
      config.get.mockReturnValue(undefined);

      const result = await service.getSipCredentials('user-1');

      expect(result.wsServers).toEqual([]);
      expect(result.extension).toBe('1001');
      expect(result.password).toBe('secret');
    });

    it('builds the SIP URI and wsServers list from config when configured', async () => {
      prisma.user.findUnique.mockResolvedValue({
        sipExtension: '1001',
        sipPassword: 'secret',
      });
      config.get.mockImplementation((key: string) =>
        key === 'ASTERISK_SIP_DOMAIN'
          ? 'pbx.example.com'
          : key === 'ASTERISK_WSS_URI'
            ? 'wss://pbx.example.com:8089/ws'
            : undefined,
      );

      const result = await service.getSipCredentials('user-1');

      expect(result).toEqual({
        extension: '1001',
        password: 'secret',
        uri: 'sip:1001@pbx.example.com',
        wsServers: ['wss://pbx.example.com:8089/ws'],
      });
    });
  });

  describe('ensureSystemUser', () => {
    it('returns the existing system user without creating one', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'system-1' });

      const result = await service.ensureSystemUser();

      expect(result).toEqual({ id: 'system-1' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates the system user with a random, never-surfaced password when missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'system-new' });

      const result = await service.ensureSystemUser();

      expect(result).toEqual({ id: 'system-new' });
      const [[createArg]] = prisma.user.create.mock.calls as [
        [{ data: Record<string, unknown>; select: unknown }],
      ];
      expect(createArg.select).toEqual({ id: true });
      expect(createArg.data).toMatchObject({
        email: 'ai-analysis@system.internal',
        role: 'ADMIN',
      });
    });
  });
});
