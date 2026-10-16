import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { QueryAgentsDto } from './dto/query-agents.dto';

@Injectable()
export class AiAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getAgentOrThrow(id: string) {
    const agent = await this.prisma.aiAgent.findUnique({ where: { id } });
    if (!agent) {
      throw new NotFoundException('AI agent not found');
    }
    return agent;
  }

  private buildWhere(query: QueryAgentsDto): Prisma.AiAgentWhereInput {
    const where: Prisma.AiAgentWhereInput = {};

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    if (query.active !== undefined) {
      where.active = query.active;
    }

    return where;
  }

  findAll(query: QueryAgentsDto) {
    return this.prisma.aiAgent.findMany({
      where: this.buildWhere(query),
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.getAgentOrThrow(id);
  }

  create(dto: CreateAgentDto) {
    return this.prisma.aiAgent.create({
      data: {
        name: dto.name,
        description: dto.description,
        voice: dto.voice,
        language: dto.language,
        personality: dto.personality,
        openingMessage: dto.openingMessage,
        objective: dto.objective,
        workingHours: (dto.workingHours ?? {}) as Prisma.InputJsonValue,
        active: dto.active,
      },
    });
  }

  async update(id: string, dto: UpdateAgentDto) {
    await this.getAgentOrThrow(id);

    return this.prisma.aiAgent.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        voice: dto.voice,
        language: dto.language,
        personality: dto.personality,
        openingMessage: dto.openingMessage,
        objective: dto.objective,
        workingHours: dto.workingHours
          ? (dto.workingHours as Prisma.InputJsonValue)
          : undefined,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    await this.getAgentOrThrow(id);
    await this.prisma.aiAgent.delete({ where: { id } });
  }
}
