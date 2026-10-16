import { FOLLOW_UP_STATUS_LABEL, type FollowUpStatus } from './types'

const STATUS_CLASS: Record<FollowUpStatus, string> = {
  PENDING: 'badge badge-warning',
  DONE: 'badge badge-success',
  CANCELLED: 'badge badge-muted',
}

export function FollowUpStatusBadge({ status }: { status: FollowUpStatus }) {
  return (
    <span className={STATUS_CLASS[status]}>
      {FOLLOW_UP_STATUS_LABEL[status]}
    </span>
  )
}
