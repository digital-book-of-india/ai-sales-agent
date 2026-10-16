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
  Query,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() query: QueryCampaignsDto) {
    return this.campaignsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Get(':id/stats')
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.stats(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  create(@Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.remove(id);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.duplicate(id);
  }

  @Post(':id/start')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.start(id);
  }

  @Post(':id/pause')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  pause(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.pause(id);
  }

  @Post(':id/resume')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  resume(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.resume(id);
  }

  @Post(':id/stop')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  stop(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.stop(id);
  }
}
