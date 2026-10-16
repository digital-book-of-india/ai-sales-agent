import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { TranscriptsService } from './transcripts.service';

// Read-only, same posture as CallingController/RecordingsController — the
// live panel gets its updates over the /calling websocket namespace
// (transcript.updated); this only serves the historical/initial load.
@Controller('calling/transcripts')
export class TranscriptsController {
  constructor(private readonly transcripts: TranscriptsService) {}

  @Get('by-call/:callId')
  getForCall(@Param('callId', ParseUUIDPipe) callId: string) {
    return this.transcripts.getForCall(callId);
  }
}
