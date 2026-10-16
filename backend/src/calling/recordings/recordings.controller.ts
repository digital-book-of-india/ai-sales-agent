import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { RecordingsService } from './recordings.service';
import { RecordingStreamQueryDto } from './dto/recording-stream-query.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { Role } from '../../../generated/prisma/enums';

@Controller('calling/recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Get('by-call/:callId')
  getForCall(@Param('callId', ParseUUIDPipe) callId: string) {
    return this.recordings.getForCall(callId);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.recordings.getById(id);
  }

  // Download is reserved for roles that can export call data off the
  // platform; every other authenticated role can still play the recording
  // inline via getById's playUrl above.
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  @Get(':id/download-url')
  getDownloadUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.recordings.getDownloadUrl(id);
  }

  // Deliberately @Public(): a bare <audio src>/<a href> can't attach an
  // Authorization header, so this route accepts no JWT at all. Access
  // control instead lives entirely in the signed exp/disp/sig query params
  // minted by getById/getDownloadUrl — see recording-url.util.ts.
  @Public()
  @Get(':id/stream')
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RecordingStreamQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { disposition, contentType, body, filename } =
      await this.recordings.resolveStream(id, query);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(body);
  }
}
