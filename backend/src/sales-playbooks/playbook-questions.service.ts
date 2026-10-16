import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { SalesPlaybooksService } from './sales-playbooks.service';
import { CreatePlaybookQuestionDto } from './dto/create-playbook-question.dto';
import { UpdatePlaybookQuestionDto } from './dto/update-playbook-question.dto';

@Injectable()
export class PlaybookQuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesPlaybooksService: SalesPlaybooksService,
  ) {}

  private async getQuestionOrThrow(id: string) {
    const question = await this.prisma.playbookQuestion.findUnique({
      where: { id },
    });
    if (!question) {
      throw new NotFoundException('Playbook question not found');
    }
    return question;
  }

  findAll(playbookId: string) {
    return this.prisma.playbookQuestion.findMany({
      where: { playbookId },
      orderBy: { order: 'asc' },
    });
  }

  async create(playbookId: string, dto: CreatePlaybookQuestionDto) {
    await this.salesPlaybooksService.findOneOrThrow(playbookId);

    return this.prisma.playbookQuestion.create({
      data: {
        playbookId,
        question: dto.question,
        purpose: dto.purpose,
        expectedInfo: dto.expectedInfo,
        possibleAnswers: dto.possibleAnswers ?? [],
        order: dto.order,
      },
    });
  }

  async update(id: string, dto: UpdatePlaybookQuestionDto) {
    await this.getQuestionOrThrow(id);

    return this.prisma.playbookQuestion.update({
      where: { id },
      data: {
        question: dto.question,
        purpose: dto.purpose,
        expectedInfo: dto.expectedInfo,
        possibleAnswers: dto.possibleAnswers
          ? ((dto.possibleAnswers ?? []) as unknown as Prisma.InputJsonValue)
          : undefined,
        order: dto.order,
      },
    });
  }

  async remove(id: string) {
    await this.getQuestionOrThrow(id);
    await this.prisma.playbookQuestion.delete({ where: { id } });
  }
}
