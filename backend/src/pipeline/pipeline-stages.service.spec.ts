import { Test } from '@nestjs/testing';
import { PipelineStagesService } from './pipeline-stages.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PipelineStagesService', () => {
  let service: PipelineStagesService;
  let prisma: { pipelineStage: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { pipelineStage: { findMany: jest.fn().mockResolvedValue([]) } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PipelineStagesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PipelineStagesService);
  });

  it('lists stages ordered by `order`', async () => {
    await service.findAll();

    expect(prisma.pipelineStage.findMany).toHaveBeenCalledWith({
      orderBy: { order: 'asc' },
    });
  });
});
