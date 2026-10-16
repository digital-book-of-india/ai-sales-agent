import {
  CallIntent,
  CallSentiment,
  DecisionMaker,
  LeadStatus,
} from '../../../generated/prisma/enums';

export interface LeadStatusInput {
  demoRequested: boolean;
  decisionMaker: DecisionMaker;
  intent: CallIntent;
  sentiment: CallSentiment;
}

// Statuses a person deliberately set as a final call — the analysis worker
// never overrides these, even if a later call's transcript would otherwise
// suggest a different bucket. CALL_LATER is not locked: it's just "try
// again", and a completed call is exactly the update that should move it on.
const LOCKED_STATUSES: LeadStatus[] = [
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.INVALID,
  LeadStatus.NOT_INTERESTED,
];

const POSITIVE_INTENT: CallIntent[] = [CallIntent.HIGH, CallIntent.MEDIUM];

/** What CallAnalysisService sets Lead.status to after a call's analysis
 * comes back. Deliberately conservative: it only ever moves a lead forward
 * through the pipeline or flags it NOT_INTERESTED — it never assigns WON/
 * LOST/DEMO stages a human hasn't actually confirmed beyond DEMO_SCHEDULED
 * (which the transcript directly supports via demoRequested). */
export function deriveNextLeadStatus(
  current: LeadStatus,
  input: LeadStatusInput,
): LeadStatus {
  if (LOCKED_STATUSES.includes(current)) return current;

  if (input.demoRequested) return LeadStatus.DEMO_SCHEDULED;

  if (
    input.sentiment === CallSentiment.NEGATIVE &&
    !POSITIVE_INTENT.includes(input.intent)
  ) {
    return LeadStatus.NOT_INTERESTED;
  }

  if (
    input.decisionMaker === DecisionMaker.YES &&
    POSITIVE_INTENT.includes(input.intent)
  ) {
    return LeadStatus.QUALIFIED;
  }

  if (
    POSITIVE_INTENT.includes(input.intent) ||
    input.decisionMaker === DecisionMaker.YES
  ) {
    return LeadStatus.INTERESTED;
  }

  return LeadStatus.CONTACTED;
}
