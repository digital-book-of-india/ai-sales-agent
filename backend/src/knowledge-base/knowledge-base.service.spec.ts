import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let prisma: {
    knowledgeBase: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  function kbFixture(overrides: Partial<{ agentId: string }> = {}) {
    return {
      id: 'kb-1',
      agentId: 'agent-1',
      companyInfo: {},
      products: [],
      services: [],
      faqs: [],
      objections: [],
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      knowledgeBase: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(KnowledgeBaseService);
  });

  describe('findByAgent', () => {
    it('throws NotFoundException when no knowledge base exists for the agent', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(null);

      await expect(service.findByAgent('agent-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the knowledge base with faqs and objections included', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(kbFixture());

      const result = await service.findByAgent('agent-1');

      expect(prisma.knowledgeBase.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { agentId: 'agent-1' } }),
      );
      expect(result).toEqual(kbFixture());
    });
  });

  describe('upsertForAgent', () => {
    it('creates a knowledge base for the agent when none exists yet', async () => {
      prisma.knowledgeBase.upsert.mockResolvedValue(kbFixture());
      prisma.knowledgeBase.findUnique.mockResolvedValue(kbFixture());

      await service.upsertForAgent('agent-1', {
        companyInfo: { name: 'Acme' },
        products: [{ name: 'Widget' }],
      });

      expect(prisma.knowledgeBase.upsert).toHaveBeenCalledWith({
        where: { agentId: 'agent-1' },
        create: {
          agentId: 'agent-1',
          companyInfo: { name: 'Acme' },
          products: [{ name: 'Widget' }],
          services: [],
        },
        update: {
          companyInfo: { name: 'Acme' },
          products: [{ name: 'Widget' }],
          services: undefined,
        },
      });
    });
  });
});
