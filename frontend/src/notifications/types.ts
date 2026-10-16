export type NotificationType =
  | 'HOT_LEAD'
  | 'HIGH_VALUE_LEAD'
  | 'FOLLOW_UP_DUE'
  | 'MEETING_SCHEDULED'
  | 'HUMAN_TRANSFER'
  | 'CAMPAIGN_COMPLETED'
  | 'CALL_FAILURES_THRESHOLD'
  | 'AI_ERROR'
  | 'DEAL_WON'

export type TransferReason =
  | 'explicit_request'
  | 'high_positive_intent'
  | 'negotiation'
  | 'unresolved_technical_question'
  | 'low_ai_confidence'
  | 'high_value_lead'
  | 'ai_judgment'

export const TRANSFER_REASON_LABEL: Record<TransferReason, string> = {
  explicit_request: 'Customer asked for a human',
  high_positive_intent: 'High buying intent detected',
  negotiation: 'Customer wants to negotiate',
  unresolved_technical_question: "Complex question the knowledge base couldn't answer",
  low_ai_confidence: "AI wasn't confident in its last reply",
  high_value_lead: 'Lead flagged high-value',
  ai_judgment: 'AI judged this call needs a human',
}

export interface TransferTranscriptTurn {
  speaker: 'agent' | 'customer'
  text: string
  at: string
}

/** Notification.payload for a HUMAN_TRANSFER notification — mirrors the
 * backend's HumanTransferContext (see
 * backend/src/calling/human-transfer/human-transfer.types.ts), plus the
 * precomputed reasonLabels the websocket event also carries. */
export interface HumanTransferPayload {
  callId: string
  leadId: string
  customerName: string
  companyName: string | null
  requirement: string | null
  budget: number | null
  timeline: string | null
  aiSummary: string
  leadScore: number
  reasons: TransferReason[]
  reasonLabels: string[]
  transcript: TransferTranscriptTurn[]
}

// `payload` is a type-specific bag of extra fields (see NotificationType in
// schema.prisma for which service writes each one) — HUMAN_TRANSFER is the
// only one the frontend renders beyond title/body/relativeTime (see
// HumanTransferPopup/TransferContextDetails, which read the raw
// human.transfer websocket event rather than this field), so this stays
// loosely typed rather than a full per-type union.
export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  payload: Record<string, unknown>
  leadId: string | null
  callId: string | null
  readAt: string | null
  createdAt: string
}

/** Payload of the human.transfer websocket event — the same context as
 * HumanTransferPayload plus who it's for and which notification row it
 * created (see CallingGateway.emitHumanTransferEvent on the backend). */
export interface HumanTransferEvent extends HumanTransferPayload {
  targetUserId: string
  notificationId: string
}
