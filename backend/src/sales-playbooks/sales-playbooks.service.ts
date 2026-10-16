import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { UpdatePlaybookDto } from './dto/update-playbook.dto';

const INCLUDE = {
  questions: { orderBy: { order: 'asc' } },
} satisfies Prisma.SalesPlaybookInclude;

@Injectable()
export class SalesPlaybooksService {
  constructor(private readonly prisma: PrismaService) {}

  async findByAgent(agentId: string) {
    const playbook = await this.prisma.salesPlaybook.findUnique({
      where: { agentId },
      include: INCLUDE,
    });
    if (!playbook) {
      throw new NotFoundException(
        'No sales playbook has been created for this agent yet',
      );
    }
    return playbook;
  }

  async findOneOrThrow(id: string) {
    const playbook = await this.prisma.salesPlaybook.findUnique({
      where: { id },
    });
    if (!playbook) {
      throw new NotFoundException('Sales playbook not found');
    }
    return playbook;
  }

  // Same upsert-on-save shape as the knowledge base editor — one call
  // covers both first save and subsequent edits.
  async upsertForAgent(agentId: string, dto: UpdatePlaybookDto) {
    const discoveryQuestions = (dto.discoveryQuestions ??
      []) as unknown as Prisma.InputJsonValue;
    const qualificationRules = (dto.qualificationRules ??
      {}) as Prisma.InputJsonValue;
    const objectionHandling = (dto.objectionHandling ??
      {}) as Prisma.InputJsonValue;
    const closingRules = (dto.closingRules ?? {}) as Prisma.InputJsonValue;

    await this.prisma.salesPlaybook.upsert({
      where: { agentId },
      create: {
        agentId,
        opening: dto.opening,
        discoveryQuestions,
        qualificationRules,
        objectionHandling,
        closingRules,
      },
      update: {
        opening: dto.opening,
        discoveryQuestions: dto.discoveryQuestions
          ? discoveryQuestions
          : undefined,
        qualificationRules: dto.qualificationRules
          ? qualificationRules
          : undefined,
        objectionHandling: dto.objectionHandling
          ? objectionHandling
          : undefined,
        closingRules: dto.closingRules ? closingRules : undefined,
      },
    });

    return this.findByAgent(agentId);
  }
}
