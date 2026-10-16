import type { DetectedIntent } from '../ai-voice/conversation-state';
import type { LeadPriority } from '../../../generated/prisma/enums';

/** Why a live call got flagged for human handoff — a call can match more
 * than one at once (see evaluateTransferTriggers), all of which are kept so
 * the salesperson's context popup and the activity/notification records
 * show every reason it fired, not just the first one checked.
 *
 * 'ai_judgment' is distinct from 'explicit_request': it's the LLM reasoner
 * itself deciding action: 'transfer_to_human' (e.g. for a request phrased
 * in a way the deterministic keyword list doesn't cover) — see
 * llm-reasoner.service.ts's record_turn_outcome tool. */
export type TransferReason =
  | 'explicit_request'
  | 'high_positive_intent'
  | 'negotiation'
  | 'unresolved_technical_question'
  | 'low_ai_confidence'
  | 'high_value_lead'
  | 'ai_judgment';

export const TRANSFER_REASON_LABEL: Record<TransferReason, string> = {
  explicit_request: 'Customer asked for a human',
  high_positive_intent: 'High buying intent detected',
  negotiation: 'Customer wants to negotiate',
  unresolved_technical_question:
    "Complex question the knowledge base couldn't answer",
  low_ai_confidence: "AI wasn't confident in its last reply",
  high_value_lead: 'Lead flagged high-value',
  ai_judgment: 'AI judged this call needs a human',
};

/** Per-turn signal HumanTransferService.evaluate checks against the
 * configured trigger rules (see ../../system-settings/human-transfer.config.ts) —
 * everything here is already known by the time VoiceSessionService.runTurn
 * finishes reasoning about one turn, so no extra LLM call is needed just to
 * decide whether to hand off. */
export interface TransferTriggerInput {
  customerUtterance: string;
  detectedIntent: DetectedIntent;
  /** From ReasonOutcome.groundedInKnowledgeBase — false means the LLM's
   * reply wasn't fully backed by the knowledge base. */
  groundedInKnowledgeBase: boolean;
  /** From ReasonOutcome.confidence (0-1). */
  confidence: number;
  /** True when the LLM reasoner's own action was 'transfer_to_human'. */
  llmRequestedTransfer: boolean;
  leadPriority: LeadPriority;
  leadScore: number;
}

/** One turn of the live conversation, as handed to the salesperson's
 * transfer context popup — a serializable projection of ConversationTurn
 * (see ../ai-voice/conversation-state.ts). */
export interface TransferTranscriptTurn {
  speaker: 'agent' | 'customer';
  text: string;
  at: string;
}

/** Everything pushed to the receiving salesperson ahead of the call bridging
 * to them — Prompt 18's required context payload. Persisted verbatim as
 * Notification.payload and as the human.transfer websocket event's payload
 * (see CallingGateway), so the frontend renders the same shape from either
 * source. */
export interface HumanTransferContext {
  callId: string;
  leadId: string;
  customerName: string;
  companyName: string | null;
  requirement: string | null;
  budget: number | null;
  timeline: string | null;
  /** A short, heuristically-built recap of the call so far (see
   * buildLiveSummary) — not a full LLM-generated summary, to avoid an extra
   * model round trip on the critical path of bridging the call. */
  aiSummary: string;
  leadScore: number;
  reasons: TransferReason[];
  transcript: TransferTranscriptTurn[];
}

/** Resolved handoff target — whoever's SIP extension the call actually gets
 * bridged to (see HumanTransferService.resolveTarget). */
export interface TransferTarget {
  userId: string;
  extension: string;
}
