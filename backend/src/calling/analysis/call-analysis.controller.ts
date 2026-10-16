import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CallAnalysisService } from './call-analysis.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/enums';

// Read-only except for reanalyze, same posture as TranscriptsController/
// RecordingsController — the analysis is normally only ever produced by
// the background worker (see CallAnalysisProcessor), never written through
// this controller in the ordinary flow.
@Controller('calling/analysis')
export class CallAnalysisController {
  constructor(private readonly callAnalysis: CallAnalysisService) {}

  @Get('by-call/:callId')
  getForCall(@Param('callId', ParseUUIDPipe) callId: string) {
    return this.callAnalysis.getForCall(callId);
  }

  @Get('latest-for-lead/:leadId')
  getLatestForLead(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.callAnalysis.getLatestForLead(leadId);
  }

  // Manual re-run — recovers a call that was skipped (no transcript yet at
  // completion time) or whose background job failed, and is also how local
  // dev/testing triggers analysis on demand (see
  // scripts/seed-test-transcript.ts) without waiting for a real call.
  // Admin/manager only: it's a write action and re-touches the lead.
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  @Post('by-call/:callId/reanalyze')
  reanalyze(@Param('callId', ParseUUIDPipe) callId: string) {
    return this.callAnalysis.reanalyze(callId);
  }
}
