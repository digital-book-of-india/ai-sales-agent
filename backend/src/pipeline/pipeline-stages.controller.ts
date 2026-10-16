import { Controller, Get } from '@nestjs/common';
import { PipelineStagesService } from './pipeline-stages.service';

// Feeds the Pipeline Kanban board its columns (see PipelinePage.tsx).
@Controller('pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly pipelineStagesService: PipelineStagesService) {}

  @Get()
  findAll() {
    return this.pipelineStagesService.findAll();
  }
}
