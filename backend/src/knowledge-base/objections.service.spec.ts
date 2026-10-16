import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ObjectionsService } from './objections.service';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseService } from './knowledge-base.service';

describe('ObjectionsService', () => {
  let service: ObjectionsService;
  let prisma: {
    objection: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let knowledgeBaseService: { findOneOrThrow: jest.Mock };

  function objectionFixture(overrides: Partial<{ id: string }> = {}) {
    return {
      id: 'objection-1',
      knowledgeBaseId: 'kb-1',
      objection: 'Too expensive',
      recommendedResponse: 'Highlight the ROI and financing options.',
      followUpQuestion: 'What budget did you have in mind?',
      escalationRule: 'Escalate to manager if lead pushes back twice.',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      objection: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    knowledgeBaseService = { findOneOrThrow: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ObjectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
      ],
    }).compile();

    service = moduleRef.get(ObjectionsService);
  });

  describe('create', () => {
    it('throws NotFoundException when the knowledge base does not exist', async () => {
      knowledgeBaseService.findOneOrThrow.mockRejectedValue(
        new NotFoundException('Knowledge base not found'),
      );

      await expect(
        service.create('missing', {
          objection: 'Too expensive',
          recommendedResponse: 'Explain ROI',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.objection.create).not.toHaveBeenCalled();
    });

    it('creates an objection under the knowledge base', async () => {
      knowledgeBaseService.findOneOrThrow.mockResolvedValue({ id: 'kb-1' });
      prisma.objection.create.mockResolvedValue(objectionFixture());

      const result = await service.create('kb-1', {
        objection: 'Too expensive',
        recommendedResponse: 'Highlight the ROI and financing options.',
      });

      expect(prisma.objection.create).toHaveBeenCalledWith({
        data: {
          knowledgeBaseId: 'kb-1',
          objection: 'Too expensive',
          recommendedResponse: 'Highlight the ROI and financing options.',
          followUpQuestion: undefined,
          escalationRule: undefined,
        },
      });
      expect(result).toEqual(objectionFixture());
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the objection does not exist', async () => {
      prisma.objection.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes an existing objection', async () => {
      prisma.objection.findUnique.mockResolvedValue(objectionFixture());

      await service.remove('objection-1');

      expect(prisma.objection.delete).toHaveBeenCalledWith({
        where: { id: 'objection-1' },
      });
    });
  });
});
