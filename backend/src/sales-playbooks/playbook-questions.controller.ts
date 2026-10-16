import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PlaybookQuestionsService } from './playbook-questions.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { CreatePlaybookQuestionDto } from './dto/create-playbook-question.dto';
import { UpdatePlaybookQuestionDto } from './dto/update-playbook-question.dto';

@Controller()
export class PlaybookQuestionsController {
  constructor(
    private readonly playbookQuestionsService: PlaybookQuestionsService,
  ) {}

  @Get('playbooks/:playbookId/questions')
  findAll(@Param('playbookId', ParseUUIDPipe) playbookId: string) {
    return this.playbookQuestionsService.findAll(playbookId);
  }

  @Post('playbooks/:playbookId/questions')
  @Roles(Role.ADMIN)
  create(
    @Param('playbookId', ParseUUIDPipe) playbookId: string,
    @Body() dto: CreatePlaybookQuestionDto,
  ) {
    return this.playbookQuestionsService.create(playbookId, dto);
  }

  @Patch('playbook-questions/:id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlaybookQuestionDto,
  ) {
    return this.playbookQuestionsService.update(id, dto);
  }

  @Delete('playbook-questions/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.playbookQuestionsService.remove(id);
  }
}
