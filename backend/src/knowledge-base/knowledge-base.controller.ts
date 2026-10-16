import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

@Controller('ai-agents/:agentId/knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get()
  findByAgent(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.knowledgeBaseService.findByAgent(agentId);
  }

  @Put()
  @Roles(Role.ADMIN)
  upsert(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.upsertForAgent(agentId, dto);
  }
}
