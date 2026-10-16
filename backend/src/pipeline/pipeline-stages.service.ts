import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Owns the `pipeline_stages` table — a fixed, admin-seeded lookup of Kanban
 * columns (see prisma/seed.ts). Read-only from the API in this prompt: deals
 * move between existing stages (see DealsService.moveStage), but stages
 * themselves aren't created/edited/deleted here.
 */
@Injectable()
export class PipelineStagesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.pipelineStage.findMany({
      orderBy: { order: 'asc' },
    });
  }
}
