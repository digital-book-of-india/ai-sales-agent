import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

const INCLUDE = {
  faqs: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
  objections: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.KnowledgeBaseInclude;

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async findByAgent(agentId: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { agentId },
      include: INCLUDE,
    });
    if (!knowledgeBase) {
      throw new NotFoundException(
        'No knowledge base has been created for this agent yet',
      );
    }
    return knowledgeBase;
  }

  async findOneOrThrow(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
    });
    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found');
    }
    return knowledgeBase;
  }

  // Editors save the whole company info / products / services document at
  // once, so a single upsert covers both "first save" and later edits.
  async upsertForAgent(agentId: string, dto: UpdateKnowledgeBaseDto) {
    const companyInfo = (dto.companyInfo ?? {}) as Prisma.InputJsonValue;
    const products = (dto.products ?? []) as unknown as Prisma.InputJsonValue;
    const services = (dto.services ?? []) as unknown as Prisma.InputJsonValue;

    await this.prisma.knowledgeBase.upsert({
      where: { agentId },
      create: { agentId, companyInfo, products, services },
      update: {
        companyInfo: dto.companyInfo ? companyInfo : undefined,
        products: dto.products ? products : undefined,
        services: dto.services ? services : undefined,
      },
    });

    return this.findByAgent(agentId);
  }
}
