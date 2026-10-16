import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AiAgentsService } from './ai-agents.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AiAgentsService', () => {
  let service: AiAgentsService;
  let prisma: {
    aiAgent: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  function agentFixture(overrides: Partial<{ id: string; name: string }> = {}) {
    return {
      id: 'agent-1',
      name: 'Riya',
      description: null,
      voice: null,
      language: null,
      personality: null,
      openingMessage: null,
      objective: null,
      workingHours: {},
      active: true,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      aiAgent: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiAgentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AiAgentsService);
  });

  describe('findOne', () => {
    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the agent when found', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(agentFixture());

      await expect(service.findOne('agent-1')).resolves.toEqual(agentFixture());
    });
  });

  describe('create', () => {
    it('creates an agent with the given name and defaults workingHours to {}', async () => {
      prisma.aiAgent.create.mockResolvedValue(agentFixture());

      await service.create({ name: 'Riya' });

      expect(prisma.aiAgent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Riya',
          workingHours: {},
        }) as unknown,
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.aiAgent.update).not.toHaveBeenCalled();
    });

    it('updates an existing agent', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(agentFixture());
      prisma.aiAgent.update.mockResolvedValue(
        agentFixture({ name: 'Riya v2' }),
      );

      const result = await service.update('agent-1', { name: 'Riya v2' });

      expect(prisma.aiAgent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: expect.objectContaining({ name: 'Riya v2' }) as unknown,
      });
      expect(result.name).toBe('Riya v2');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the agent does not exist', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.aiAgent.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing agent', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue(agentFixture());

      await service.remove('agent-1');

      expect(prisma.aiAgent.delete).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
      });
    });
  });
});
