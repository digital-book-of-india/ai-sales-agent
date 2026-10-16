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
import { ObjectionsService } from './objections.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { CreateObjectionDto } from './dto/create-objection.dto';
import { UpdateObjectionDto } from './dto/update-objection.dto';

@Controller()
export class ObjectionsController {
  constructor(private readonly objectionsService: ObjectionsService) {}

  @Get('knowledge-bases/:knowledgeBaseId/objections')
  findAll(@Param('knowledgeBaseId', ParseUUIDPipe) knowledgeBaseId: string) {
    return this.objectionsService.findAll(knowledgeBaseId);
  }

  @Post('knowledge-bases/:knowledgeBaseId/objections')
  @Roles(Role.ADMIN)
  create(
    @Param('knowledgeBaseId', ParseUUIDPipe) knowledgeBaseId: string,
    @Body() dto: CreateObjectionDto,
  ) {
    return this.objectionsService.create(knowledgeBaseId, dto);
  }

  @Patch('objections/:id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObjectionDto,
  ) {
    return this.objectionsService.update(id, dto);
  }

  @Delete('objections/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectionsService.remove(id);
  }
}
