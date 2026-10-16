import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const DETECTED_INTENTS = [
  'greeting',
  'question',
  'objection',
  'pricing',
  'interest',
  'negative',
  'other',
] as const;

// Dev/testing only — backs POST /calling/human-transfer/simulate/:callId
// (see HumanTransferController). Every field but customerUtterance is
// optional and defaults to what a normal, unremarkable AI turn would look
// like, so a tester only has to type what the "customer" said and let the
// same trigger logic a real call would use decide whether that's enough.
export class SimulateHumanTransferDto {
  @MinLength(1)
  @IsString()
  customerUtterance!: string;

  // Auto-detected via IntentDetectionService when omitted — same as a real
  // turn (see VoiceSessionService.runTurn).
  @IsOptional()
  @IsIn(DETECTED_INTENTS)
  detectedIntent?: (typeof DETECTED_INTENTS)[number];

  @IsOptional()
  @IsBoolean()
  groundedInKnowledgeBase?: boolean = true;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number = 1;

  @IsOptional()
  @IsBoolean()
  llmRequestedTransfer?: boolean = false;
}
