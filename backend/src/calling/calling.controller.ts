import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CallingQueueService } from './calling-queue.service';
import { CallsService } from './telephony/calls.service';
import { QueryCallingQueueDto } from './dto/query-calling-queue.dto';
import { QueryLiveCallsDto } from './dto/query-live-calls.dto';
import { QueryCallsDto } from './dto/query-calls.dto';

// Read-only: the frontend observes queue/call state here and over the
// /calling websocket namespace, but never drives calling logic — only the
// backend dialer queue does that.
@Controller('calling')
export class CallingController {
  constructor(
    private readonly callingQueueService: CallingQueueService,
    private readonly callsService: CallsService,
  ) {}

  @Get('queue')
  listQueue(@Query() query: QueryCallingQueueDto) {
    return this.callingQueueService.listQueue(query);
  }

  @Get('live')
  getLiveCalls(@Query() query: QueryLiveCallsDto) {
    return this.callingQueueService.getLiveCalls(query.campaignId);
  }

  @Get('calls')
  listCalls(@Query() query: QueryCallsDto) {
    return this.callsService.listForLead(query.leadId);
  }

  @Get('calls/:id')
  getCall(@Param('id', ParseUUIDPipe) id: string) {
    return this.callsService.getDetail(id);
  }
}
