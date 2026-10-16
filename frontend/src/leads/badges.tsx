import {
  LEAD_STATUS_LABEL,
  type ImportRowStatus,
  type LeadPriority,
  type LeadStatus,
} from './types'
import { getLeadScoreCategory, type LeadScoreCategory } from './lead-score'

const STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  NEW: 'badge badge-muted',
  CONTACTED: 'badge badge-muted',
  INTERESTED: 'badge badge-muted',
  QUALIFIED: 'badge badge-muted',
  DEMO_SCHEDULED: 'badge badge-muted',
  PROPOSAL_SENT: 'badge badge-muted',
  NEGOTIATION: 'badge badge-muted',
  WON: 'badge badge-success',
  LOST: 'badge badge-danger',
  NOT_INTERESTED: 'badge badge-danger',
  CALL_LATER: 'badge badge-muted',
  INVALID: 'badge badge-danger',
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={STATUS_BADGE_CLASS[status]}>
      {LEAD_STATUS_LABEL[status]}
    </span>
  )
}

const PRIORITY_LABEL: Record<LeadPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

const PRIORITY_CLASS: Record<LeadPriority, string> = {
  LOW: 'badge badge-muted',
  MEDIUM: 'badge badge-muted',
  HIGH: 'badge badge-danger',
}

export function PriorityBadge({ priority }: { priority: LeadPriority }) {
  return (
    <span className={PRIORITY_CLASS[priority]}>{PRIORITY_LABEL[priority]}</span>
  )
}

const LEAD_SCORE_CATEGORY_CLASS: Record<LeadScoreCategory, string> = {
  HOT: 'badge badge-danger',
  WARM: 'badge badge-warning',
  COLD: 'badge badge-muted',
  LOW: 'badge badge-muted',
}

/** Color-coded HOT/WARM/COLD/LOW indicator for Lead.leadScore — see the
 * Leads list and Lead Detail pages. Derives its category straight from the
 * score (see lead-score.ts) rather than needing that classification handed
 * down from the API. */
export function LeadScoreBadge({ score }: { score: number }) {
  const category = getLeadScoreCategory(score)
  return (
    <span
      className={LEAD_SCORE_CATEGORY_CLASS[category]}
      title={`Lead score ${score}/100`}
    >
      {category} · {score}
    </span>
  )
}

const IMPORT_ROW_STATUS_LABEL: Record<ImportRowStatus, string> = {
  valid: 'Valid',
  invalid: 'Invalid',
  duplicate: 'Duplicate',
}

const IMPORT_ROW_STATUS_CLASS: Record<ImportRowStatus, string> = {
  valid: 'badge badge-success',
  invalid: 'badge badge-danger',
  duplicate: 'badge badge-muted',
}

export function ImportRowStatusBadge({ status }: { status: ImportRowStatus }) {
  return (
    <span className={IMPORT_ROW_STATUS_CLASS[status]}>
      {IMPORT_ROW_STATUS_LABEL[status]}
    </span>
  )
}
