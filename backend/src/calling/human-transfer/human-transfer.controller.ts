import { Controller, Param, ParseUUIDPipe, Post, Body } from '@nestjs/common';
import { HumanTransferService } from './human-transfer.service';
import { IntentDetectionService } from '../ai-voice/intent-detection.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/enums';
import { SimulateHumanTransferDto } from './dto/simulate-human-transfer.dto';

/**
 * Dev/testing only — lets a developer exercise the full Prompt 18 handoff
 * flow (trigger check -> Notification -> Activity -> human.transfer
 * websocket event -> TelephonyProvider.transferCall) against a real Call
 * row without a live AI voice session actually running. Needed because
 * VoiceSessionService.runTurn only ever fires from real inbound call audio
 * (see AudioSocketGateway) — with TELEPHONY_PROVIDER=mock (the local
 * default), a "call" is just a timed ring/connect/hangup simulation with no
 * turns at all, so there is otherwise no way to see this flow run locally
 * without a real Asterisk/SIP call. Same posture as
 * CallAnalysisController.reanalyze and scripts/seed-test-transcript.ts: a
 * manual trigger for logic that normally only runs off real telephony
 * events.
 *
 * Point it at any existing Call (e.g. one made via the mock provider's
 * click-to-call/campaign dialer — its providerCallId is all this needs) and
 * a made-up customerUtterance; the response is the resolved transfer target
 * (or null if nothing triggered), and — on a real trigger — a Notification
 * is created and the human.transfer event is broadcast for real, so a
 * signed-in salesperson watching the UI sees the bell badge and popup live.
 */
@Controller('calling/human-transfer')
export class HumanTransferController {
  constructor(
    private readonly humanTransfer: HumanTransferService,
    private readonly intent: IntentDetectionService,
  ) {}

  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  @Post('simulate/:callId')
  simulate(
    @Param('callId', ParseUUIDPipe) callId: string,
    @Body() dto: SimulateHumanTransferDto,
  ) {
    return this.humanTransfer.evaluateAndTransfer(callId, {
      customerUtterance: dto.customerUtterance,
      detectedIntent:
        dto.detectedIntent ?? this.intent.detect(dto.customerUtterance),
      groundedInKnowledgeBase: dto.groundedInKnowledgeBase ?? true,
      confidence: dto.confidence ?? 1,
      llmRequestedTransfer: dto.llmRequestedTransfer ?? false,
    });
  }
}
