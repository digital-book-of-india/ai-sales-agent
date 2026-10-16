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
import { FaqsService } from './faqs.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Controller()
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Get('knowledge-bases/:knowledgeBaseId/faqs')
  findAll(@Param('knowledgeBaseId', ParseUUIDPipe) knowledgeBaseId: string) {
    return this.faqsService.findAll(knowledgeBaseId);
  }

  @Post('knowledge-bases/:knowledgeBaseId/faqs')
  @Roles(Role.ADMIN)
  create(
    @Param('knowledgeBaseId', ParseUUIDPipe) knowledgeBaseId: string,
    @Body() dto: CreateFaqDto,
  ) {
    return this.faqsService.create(knowledgeBaseId, dto);
  }

  @Patch('faqs/:id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto) {
    return this.faqsService.update(id, dto);
  }

  @Delete('faqs/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.faqsService.remove(id);
  }
}
