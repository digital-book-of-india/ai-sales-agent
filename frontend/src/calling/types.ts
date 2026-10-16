export const CALLING_QUEUE_STATUSES = [
  'PENDING',
  'QUEUED',
  'DIALING',
  'RINGING',
  'CONNECTED',
  'COMPLETED',
  'FAILED',
  'NO_ANSWER',
  'BUSY',
  'RETRY',
  'SKIPPED',
  'CANCELLED',
] as const

export type CallingQueueStatus = (typeof CALLING_QUEUE_STATUSES)[number]

export const CALLING_QUEUE_STATUS_LABEL: Record<CallingQueueStatus, string> = {
  PENDING: 'Pending',
  QUEUED: 'Queued',
  DIALING: 'Dialing',
  RINGING: 'Ringing',
  CONNECTED: 'Connected',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  RETRY: 'Retry scheduled',
  SKIPPED: 'Skipped',
  CANCELLED: 'Cancelled',
}

/** The statuses a call is actively "in flight" for — shown on the live board. */
export const ACTIVE_CALL_STATUSES: CallingQueueStatus[] = [
  'DIALING',
  'RINGING',
  'CONNECTED',
]

export interface CallingQueueLead {
  id: string
  name: string
  phone: string
  companyName: string | null
}

export interface CallingQueueCampaign {
  id: string
  name: string
}

export interface CallingQueueItem {
  id: string
  leadId: string
  campaignId: string
  priority: number
  status: CallingQueueStatus
  attempts: number
  maxAttempts: number
  scheduledAt: string
  nextRetryAt: string | null
  lastAttemptAt: string | null
  callId: string | null
  createdAt: string
  updatedAt: string
  lead: CallingQueueLead
  campaign: CallingQueueCampaign
}

export interface PaginatedCallingQueue {
  data: CallingQueueItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface CallingQueueQuery {
  campaignId?: string
  status?: CallingQueueStatus
  page?: number
  limit?: number
}

export type CallEventName =
  | 'call.created'
  | 'call.dialing'
  | 'call.ringing'
  | 'call.connected'
  | 'call.ended'

export interface CallEvent {
  queueItemId: string
  leadId: string
  leadName: string
  campaignId: string
  campaignName: string
  status: string
  attempts: number
  callId: string | null
  outcome?: 'CONNECTED' | 'NO_ANSWER' | 'BUSY' | 'FAILED'
  talkMs?: number
}

export const CALL_STATUSES = [
  'INITIATED',
  'RINGING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'NO_ANSWER',
  'BUSY',
  'CANCELLED',
] as const

export type CallStatus = (typeof CALL_STATUSES)[number]

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  INITIATED: 'Initiated',
  RINGING: 'Ringing',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  CANCELLED: 'Cancelled',
}

export type RecordingRetentionStatus = 'ACTIVE' | 'EXPIRED' | 'DELETED'

export interface CallRecordingRef {
  id: string
  retentionStatus: RecordingRetentionStatus
}

export interface CallCampaignRef {
  id: string
  name: string
}

export interface CallLeadRef {
  id: string
  name: string
  phone: string
  companyName: string | null
}

export interface CallSummary {
  id: string
  status: CallStatus
  provider: string
  duration: number | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  campaign: CallCampaignRef
  queueItem: { attempts: number; maxAttempts: number }
  recording: CallRecordingRef | null
}

export interface CallDetail extends CallSummary {
  lead: CallLeadRef
}

export type TranscriptSpeaker = 'AI' | 'CUSTOMER'

export interface TranscriptMessage {
  id: string
  speaker: TranscriptSpeaker
  text: string
  timestamp: string
  confidence: number | null
}

export interface Transcript {
  id: string
  callId: string
  finalizedAt: string | null
  createdAt: string
  messages: TranscriptMessage[]
}

/** Payload of the transcript.updated websocket event — one new message at a
 * time, not the whole transcript (see useTranscriptSocket). */
export interface TranscriptEvent {
  callId: string
  message: TranscriptMessage
}

export interface Recording {
  id: string
  callId: string
  duration: number | null
  startedAt: string | null
  endedAt: string | null
  retentionStatus: RecordingRetentionStatus
  createdAt: string
  /** Short-lived signed URL — safe to drop straight into an <audio src>. */
  playUrl: string
}

export type DecisionMaker = 'YES' | 'NO' | 'UNKNOWN'
export type CallIntent = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
export type CallSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'

export interface AnalysisObjection {
  objection: string
  response: string
}

export interface QualityScoreBreakdown {
  opening: number
  discovery: number
  productKnowledge: number
  objectionHandling: number
  closing: number
  naturalness: number
  total: number
}

/** Backs the AI Analysis panel on the Call Detail and Lead Detail pages —
 * the post-call analysis worker's output for one call (see
 * backend/src/calling/analysis/). Null (not a 404) whenever the call has
 * no analysis yet — still queued/retrying, or skipped for having no
 * transcript. */
export interface CallAnalysis {
  id: string
  callId: string
  summary: string | null
  requirement: string | null
  budget: string | null
  timeline: string | null
  decisionMaker: DecisionMaker
  intent: CallIntent
  sentiment: CallSentiment
  demoRequested: boolean
  objections: AnalysisObjection[]
  nextAction: string | null
  qualityScore: QualityScoreBreakdown
  coachingFeedback: string | null
  leadScore: number
  leadScoreCategory: string
  createdAt: string
}
