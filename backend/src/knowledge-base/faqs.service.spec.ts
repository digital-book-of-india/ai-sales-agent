import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FaqsService } from './faqs.service';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseService } from './knowledge-base.service';

describe('FaqsService', () => {
  let service: FaqsService;
  let prisma: {
    faq: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let knowledgeBaseService: { findOneOrThrow: jest.Mock };

  function faqFixture(overrides: Partial<{ id: string }> = {}) {
    return {
      id: 'faq-1',
      knowledgeBaseId: 'kb-1',
      question: 'Do you offer EMI?',
      answer: 'Yes, up to 12 months.',
      category: 'pricing',
      priority: 0,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      faq: {
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
        FaqsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
      ],
    }).compile();

    service = moduleRef.get(FaqsService);
  });

  describe('create', () => {
    it('throws NotFoundException when the knowledge base does not exist', async () => {
      knowledgeBaseService.findOneOrThrow.mockRejectedValue(
        new NotFoundException('Knowledge base not found'),
      );

      await expect(
        service.create('missing', { question: 'Q?', answer: 'A.' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.faq.create).not.toHaveBeenCalled();
    });

    it('creates a FAQ under the knowledge base', async () => {
      knowledgeBaseService.findOneOrThrow.mockResolvedValue({ id: 'kb-1' });
      prisma.faq.create.mockResolvedValue(faqFixture());

      const result = await service.create('kb-1', {
        question: 'Do you offer EMI?',
        answer: 'Yes, up to 12 months.',
        category: 'pricing',
      });

      expect(prisma.faq.create).toHaveBeenCalledWith({
        data: {
          knowledgeBaseId: 'kb-1',
          question: 'Do you offer EMI?',
          answer: 'Yes, up to 12 months.',
          category: 'pricing',
          priority: undefined,
        },
      });
      expect(result).toEqual(faqFixture());
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the FAQ does not exist', async () => {
      prisma.faq.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { answer: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes an existing FAQ', async () => {
      prisma.faq.findUnique.mockResolvedValue(faqFixture());

      await service.remove('faq-1');

      expect(prisma.faq.delete).toHaveBeenCalledWith({
        where: { id: 'faq-1' },
      });
    });
  });
});
