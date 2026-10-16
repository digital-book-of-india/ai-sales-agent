import {
  CALLING_QUEUE_STATUS_LABEL,
  CALL_STATUS_LABEL,
  type CallingQueueStatus,
  type CallStatus,
} from './types'

const STATUS_CLASS: Record<CallingQueueStatus, string> = {
  PENDING: 'badge badge-muted',
  QUEUED: 'badge badge-muted',
  DIALING: 'badge badge-warning',
  RINGING: 'badge badge-warning',
  CONNECTED: 'badge badge-success',
  COMPLETED: 'badge badge-success',
  FAILED: 'badge badge-danger',
  NO_ANSWER: 'badge badge-danger',
  BUSY: 'badge badge-danger',
  RETRY: 'badge badge-warning',
  SKIPPED: 'badge badge-muted',
  CANCELLED: 'badge badge-muted',
}

export function CallingStatusBadge({ status }: { status: CallingQueueStatus }) {
  return (
    <span className={STATUS_CLASS[status]}>
      {CALLING_QUEUE_STATUS_LABEL[status]}
    </span>
  )
}

const CALL_STATUS_CLASS: Record<CallStatus, string> = {
  INITIATED: 'badge badge-muted',
  RINGING: 'badge badge-warning',
  IN_PROGRESS: 'badge badge-warning',
  COMPLETED: 'badge badge-success',
  FAILED: 'badge badge-danger',
  NO_ANSWER: 'badge badge-danger',
  BUSY: 'badge badge-danger',
  CANCELLED: 'badge badge-muted',
}

export function CallStatusBadge({ status }: { status: CallStatus }) {
  return (
    <span className={CALL_STATUS_CLASS[status]}>
      {CALL_STATUS_LABEL[status]}
    </span>
  )
}
