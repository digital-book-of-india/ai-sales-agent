import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SalesPlaybooksService } from './sales-playbooks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SalesPlaybooksService', () => {
  let service: SalesPlaybooksService;
  let prisma: {
    salesPlaybook: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  function playbookFixture(overrides: Partial<{ agentId: string }> = {}) {
    return {
      id: 'playbook-1',
      agentId: 'agent-1',
      opening: null,
      discoveryQuestions: [],
      qualificationRules: {},
      objectionHandling: {},
      closingRules: {},
      questions: [],
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      salesPlaybook: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesPlaybooksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(SalesPlaybooksService);
  });

  describe('findByAgent', () => {
    it('throws NotFoundException when no playbook exists for the agent', async () => {
      prisma.salesPlaybook.findUnique.mockResolvedValue(null);

      await expect(service.findByAgent('agent-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the playbook with its questions included', async () => {
      prisma.salesPlaybook.findUnique.mockResolvedValue(playbookFixture());

      const result = await service.findByAgent('agent-1');

      expect(prisma.salesPlaybook.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { agentId: 'agent-1' } }),
      );
      expect(result).toEqual(playbookFixture());
    });
  });

  describe('upsertForAgent', () => {
    it('creates a playbook for the agent when none exists yet', async () => {
      prisma.salesPlaybook.upsert.mockResolvedValue(playbookFixture());
      prisma.salesPlaybook.findUnique.mockResolvedValue(playbookFixture());

      await service.upsertForAgent('agent-1', {
        opening: 'Hi, this is Riya from Acme.',
        discoveryQuestions: ['What are you looking for?'],
      });

      expect(prisma.salesPlaybook.upsert).toHaveBeenCalledWith({
        where: { agentId: 'agent-1' },
        create: {
          agentId: 'agent-1',
          opening: 'Hi, this is Riya from Acme.',
          discoveryQuestions: ['What are you looking for?'],
          qualificationRules: {},
          objectionHandling: {},
          closingRules: {},
        },
        update: {
          opening: 'Hi, this is Riya from Acme.',
          discoveryQuestions: ['What are you looking for?'],
          qualificationRules: undefined,
          objectionHandling: undefined,
          closingRules: undefined,
        },
      });
    });
  });
});
