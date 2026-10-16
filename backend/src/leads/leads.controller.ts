import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { LeadsService } from './leads.service';
import { LeadImportService } from './import/lead-import.service';
import { ManualCallService } from '../calling/manual-call.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { BulkAssignDto } from './dto/bulk-assign.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { AddTagDto } from './dto/add-tag.dto';
import { ImportConfirmDto } from './dto/import-confirm.dto';

const IMPORT_FILE_FILTER = (
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!/\.(csv|xlsx)$/i.test(file.originalname)) {
    callback(
      new BadRequestException('Only CSV or XLSX files are supported'),
      false,
    );
    return;
  }
  callback(null, true);
};

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly leadImportService: LeadImportService,
    private readonly manualCallService: ManualCallService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryLeadsDto,
  ) {
    return this.leadsService.findAll(user, query);
  }

  @Get('export')
  async exportLeads(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryLeadsDto,
    @Res() res: Response,
  ) {
    const csv = await this.leadsService.export(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="leads-export-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  @Post('bulk-assign')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  bulkAssign(@Body() dto: BulkAssignDto) {
    return this.leadsService.bulkAssign(dto);
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: IMPORT_FILE_FILTER,
    }),
  )
  importFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.leadImportService.parseUpload(file);
  }

  @Post('import/confirm')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  importConfirm(@Body() dto: ImportConfirmDto) {
    return this.leadImportService.confirmImport(dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leadsService.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leadsService.remove(user, id);
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.leadsService.addNote(user, id, dto);
  }

  @Post(':id/tags')
  addTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTagDto,
  ) {
    return this.leadsService.addTag(user, id, dto);
  }

  // Activity timeline (Prompt 13) — CALL_COMPLETED entries today, more
  // types expected later (see Activity.type in schema.prisma). Scoped the
  // same way as every other per-lead route (a SALES_EXECUTIVE only sees
  // leads assigned to them) — see LeadsService.getActivity.
  @Get(':id/activity')
  getActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leadsService.getActivity(user, id);
  }

  // Click-to-call (see ManualCallService). The frontend follows up with the
  // returned callId over the read-only /calling websocket for live state —
  // this endpoint itself only starts the call and returns, same as the
  // dialer never blocking on ring/connect either.
  @Post(':id/call')
  initiateCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manualCallService.initiateCall(user, id);
  }
}
