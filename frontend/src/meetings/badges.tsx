import { MEETING_STATUS_LABEL, type MeetingStatus } from './types'

const STATUS_CLASS: Record<MeetingStatus, string> = {
  SCHEDULED: 'badge badge-warning',
  COMPLETED: 'badge badge-success',
  CANCELLED: 'badge badge-muted',
  RESCHEDULED: 'badge badge-warning',
  NO_SHOW: 'badge badge-danger',
}

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <span className={STATUS_CLASS[status]}>{MEETING_STATUS_LABEL[status]}</span>
  )
}
