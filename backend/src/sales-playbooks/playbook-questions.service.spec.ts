import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlaybookQuestionsService } from './playbook-questions.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesPlaybooksService } from './sales-playbooks.service';

describe('PlaybookQuestionsService', () => {
  let service: PlaybookQuestionsService;
  let prisma: {
    playbookQuestion: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let salesPlaybooksService: { findOneOrThrow: jest.Mock };

  function questionFixture(overrides: Partial<{ id: string }> = {}) {
    return {
      id: 'question-1',
      playbookId: 'playbook-1',
      question: 'What is your current setup?',
      purpose: 'Understand baseline',
      expectedInfo: 'Current tools in use',
      possibleAnswers: ['Excel', 'Another CRM', 'Nothing yet'],
      order: 0,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      playbookQuestion: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    salesPlaybooksService = { findOneOrThrow: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlaybookQuestionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SalesPlaybooksService, useValue: salesPlaybooksService },
      ],
    }).compile();

    service = moduleRef.get(PlaybookQuestionsService);
  });

  describe('create', () => {
    it('throws NotFoundException when the playbook does not exist', async () => {
      salesPlaybooksService.findOneOrThrow.mockRejectedValue(
        new NotFoundException('Sales playbook not found'),
      );

      await expect(
        service.create('missing', { question: 'What is your budget?' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.playbookQuestion.create).not.toHaveBeenCalled();
    });

    it('creates a question under the playbook', async () => {
      salesPlaybooksService.findOneOrThrow.mockResolvedValue({
        id: 'playbook-1',
      });
      prisma.playbookQuestion.create.mockResolvedValue(questionFixture());

      const result = await service.create('playbook-1', {
        question: 'What is your current setup?',
        purpose: 'Understand baseline',
        possibleAnswers: ['Excel', 'Another CRM', 'Nothing yet'],
      });

      expect(prisma.playbookQuestion.create).toHaveBeenCalledWith({
        data: {
          playbookId: 'playbook-1',
          question: 'What is your current setup?',
          purpose: 'Understand baseline',
          expectedInfo: undefined,
          possibleAnswers: ['Excel', 'Another CRM', 'Nothing yet'],
          order: undefined,
        },
      });
      expect(result).toEqual(questionFixture());
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the question does not exist', async () => {
      prisma.playbookQuestion.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes an existing question', async () => {
      prisma.playbookQuestion.findUnique.mockResolvedValue(questionFixture());

      await service.remove('question-1');

      expect(prisma.playbookQuestion.delete).toHaveBeenCalledWith({
        where: { id: 'question-1' },
      });
    });
  });
});
