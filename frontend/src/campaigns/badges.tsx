import { CAMPAIGN_STATUS_LABEL, type CampaignStatus } from './types'

const CAMPAIGN_STATUS_CLASS: Record<CampaignStatus, string> = {
  DRAFT: 'badge badge-muted',
  SCHEDULED: 'badge badge-muted',
  RUNNING: 'badge badge-success',
  PAUSED: 'badge badge-muted',
  COMPLETED: 'badge badge-success',
  STOPPED: 'badge badge-danger',
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={CAMPAIGN_STATUS_CLASS[status]}>
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  )
}
