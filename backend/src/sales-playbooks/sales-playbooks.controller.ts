import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { SalesPlaybooksService } from './sales-playbooks.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { UpdatePlaybookDto } from './dto/update-playbook.dto';

@Controller('ai-agents/:agentId/playbook')
export class SalesPlaybooksController {
  constructor(private readonly salesPlaybooksService: SalesPlaybooksService) {}

  @Get()
  findByAgent(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.salesPlaybooksService.findByAgent(agentId);
  }

  @Put()
  @Roles(Role.ADMIN)
  upsert(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: UpdatePlaybookDto,
  ) {
    return this.salesPlaybooksService.upsertForAgent(agentId, dto);
  }
}
