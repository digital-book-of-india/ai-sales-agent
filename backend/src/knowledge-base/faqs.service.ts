import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  private async getFaqOrThrow(id: string) {
    const faq = await this.prisma.faq.findUnique({ where: { id } });
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }
    return faq;
  }

  findAll(knowledgeBaseId: string) {
    return this.prisma.faq.findMany({
      where: { knowledgeBaseId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(knowledgeBaseId: string, dto: CreateFaqDto) {
    await this.knowledgeBaseService.findOneOrThrow(knowledgeBaseId);

    return this.prisma.faq.create({
      data: {
        knowledgeBaseId,
        question: dto.question,
        answer: dto.answer,
        category: dto.category,
        priority: dto.priority,
      },
    });
  }

  async update(id: string, dto: UpdateFaqDto) {
    await this.getFaqOrThrow(id);

    return this.prisma.faq.update({
      where: { id },
      data: {
        question: dto.question,
        answer: dto.answer,
        category: dto.category,
        priority: dto.priority,
      },
    });
  }

  async remove(id: string) {
    await this.getFaqOrThrow(id);
    await this.prisma.faq.delete({ where: { id } });
  }
}
