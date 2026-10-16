import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateObjectionDto } from './dto/create-objection.dto';
import { UpdateObjectionDto } from './dto/update-objection.dto';

@Injectable()
export class ObjectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  private async getObjectionOrThrow(id: string) {
    const objection = await this.prisma.objection.findUnique({
      where: { id },
    });
    if (!objection) {
      throw new NotFoundException('Objection not found');
    }
    return objection;
  }

  findAll(knowledgeBaseId: string) {
    return this.prisma.objection.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(knowledgeBaseId: string, dto: CreateObjectionDto) {
    await this.knowledgeBaseService.findOneOrThrow(knowledgeBaseId);

    return this.prisma.objection.create({
      data: {
        knowledgeBaseId,
        objection: dto.objection,
        recommendedResponse: dto.recommendedResponse,
        followUpQuestion: dto.followUpQuestion,
        escalationRule: dto.escalationRule,
      },
    });
  }

  async update(id: string, dto: UpdateObjectionDto) {
    await this.getObjectionOrThrow(id);

    return this.prisma.objection.update({
      where: { id },
      data: {
        objection: dto.objection,
        recommendedResponse: dto.recommendedResponse,
        followUpQuestion: dto.followUpQuestion,
        escalationRule: dto.escalationRule,
      },
    });
  }

  async remove(id: string) {
    await this.getObjectionOrThrow(id);
    await this.prisma.objection.delete({ where: { id } });
  }
}
