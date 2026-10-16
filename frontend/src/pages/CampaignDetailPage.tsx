import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  getCampaignStats,
  pauseCampaign,
  resumeCampaign,
  startCampaign,
  stopCampaign,
  updateCampaign,
} from '../campaigns/api'
import { CampaignStatusBadge } from '../campaigns/badges'
import { CampaignForm } from '../campaigns/CampaignForm'
import {
  campaignToFormValues,
  formValuesToInput,
  type Campaign,
  type CampaignFormValues,
  type CampaignStats,
} from '../campaigns/types'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}


function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-ink">{value}</dd>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

const CONTROLLABLE: Record<
  Campaign['status'],
  { action: 'start' | 'pause' | 'resume' | 'stop'; label: string }[]
> = {
  DRAFT: [{ action: 'start', label: 'Start' }],
  SCHEDULED: [
    { action: 'start', label: 'Start now' },
    { action: 'stop', label: 'Stop' },
  ],
  RUNNING: [
    { action: 'pause', label: 'Pause' },
    { action: 'stop', label: 'Stop' },
  ],
  PAUSED: [
    { action: 'resume', label: 'Resume' },
    { action: 'stop', label: 'Stop' },
  ],
  COMPLETED: [],
  STOPPED: [{ action: 'start', label: 'Restart' }],
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refetch = useCallback(() => {
    if (!id) return
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return Promise.all([getCampaign(id), getCampaignStats(id)])
      })
      .then(([campaignData, statsData]) => {
        setCampaign(campaignData)
        setStats(statsData)
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load campaign',
        )
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function handleUpdate(values: CampaignFormValues) {
    if (!id) return
    const updated = await updateCampaign(id, formValuesToInput(values))
    setCampaign(updated)
    setEditing(false)
    toast.success('Campaign updated')
    refetch()
  }

  const ACTION_LABEL: Record<'start' | 'pause' | 'resume' | 'stop', string> = {
    start: 'started',
    pause: 'paused',
    resume: 'resumed',
    stop: 'stopped',
  }

  async function handleAction(action: 'start' | 'pause' | 'resume' | 'stop') {
    if (!id) return
    setActionPending(true)
    try {
      const fn = { start: startCampaign, pause: pauseCampaign, resume: resumeCampaign, stop: stopCampaign }[
        action
      ]
      const updated = await fn(id)
      setCampaign(updated)
      toast.success(`Campaign ${ACTION_LABEL[action]}`)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : `Failed to ${action} campaign`
      toast.error(message)
    } finally {
      setActionPending(false)
    }
  }

  async function handleDuplicate() {
    if (!id) return
    setActionPending(true)
    try {
      const copy = await duplicateCampaign(id)
      toast.success('Campaign duplicated')
      navigate(`/campaigns/${copy.id}`)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to duplicate campaign'
      toast.error(message)
      setActionPending(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    const confirmed = await confirm({
      title: 'Delete campaign',
      message: 'Delete this campaign? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await deleteCampaign(id)
      toast.success('Campaign deleted')
      navigate('/campaigns', { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to delete campaign'
      toast.error(message)
      setDeleting(false)
    }
  }

  if (loading) return <FullScreenLoader />

  if (error && !campaign) {
    return (
      <div className="card">
        <p role="alert" className="mb-4 text-sm font-medium text-danger">
          {error}
        </p>
        <Link to="/campaigns" className="btn-secondary inline-block">
          Back to campaigns
        </Link>
      </div>
    )
  }

  if (!campaign) return null

  const controls = CONTROLLABLE[campaign.status]

  return (
    <>
      <div className="mb-6">
        <Link
          to="/campaigns"
          className="text-sm font-medium text-muted hover:text-ink"
        >
          ← Back to campaigns
        </Link>
      </div>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {campaign.name}
            </h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-muted">
            {campaign.objective ?? 'No objective set'}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-3">
            {controls.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                className={action === 'stop' ? 'btn-secondary' : 'btn-primary'}
                disabled={actionPending}
                onClick={() => void handleAction(action)}
              >
                {label}
              </button>
            ))}
            {!editing && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={actionPending}
              onClick={() => void handleDuplicate()}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card mb-5">
            <h2 className="mb-4 text-base font-bold text-ink">Settings</h2>
            {editing ? (
              <CampaignForm
                initialValues={campaignToFormValues(campaign)}
                submitLabel="Save changes"
                onSubmit={handleUpdate}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <dl>
                <Detail label="Description" value={campaign.description ?? '—'} />
                <Detail
                  label="Lead statuses"
                  value={
                    campaign.leadFilters.statuses?.join(', ') || 'Any status'
                  }
                />
                <Detail
                  label="Lead sources"
                  value={campaign.leadFilters.sources?.join(', ') || 'Any source'}
                />
                <Detail
                  label="Lead tags"
                  value={campaign.leadFilters.tags?.join(', ') || 'Any tags'}
                />
                <Detail
                  label="Calling hours"
                  value={
                    campaign.callingHours.start && campaign.callingHours.end
                      ? `${campaign.callingHours.start} - ${campaign.callingHours.end}`
                      : 'Not set'
                  }
                />
                <Detail
                  label="Calling days"
                  value={campaign.callingHours.days?.join(', ') || 'Every day'}
                />
                <Detail label="Max attempts" value={String(campaign.maxAttempts)} />
                <Detail
                  label="Retry interval"
                  value={`${campaign.retryInterval} min`}
                />
                <Detail
                  label="Concurrent calls"
                  value={String(campaign.concurrentCalls)}
                />
                <Detail
                  label="Calls per minute"
                  value={String(campaign.callsPerMinute)}
                />
                <Detail label="Start date" value={formatDate(campaign.startDate)} />
                <Detail label="End date" value={formatDate(campaign.endDate)} />
                <Detail
                  label="Recording consent"
                  value={campaign.recordingConsent ? 'Enabled' : 'Disabled'}
                />
              </dl>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <h2 className="mb-4 text-base font-bold text-ink">Stats</h2>
            {stats && (
              <dl className="grid grid-cols-2 gap-3">
                <StatTile label="Leads" value={stats.leads} />
                <StatTile label="Attempted" value={stats.attempted} />
                <StatTile label="Connected" value={stats.connected} />
                <StatTile label="No answer" value={stats.noAnswer} />
                <StatTile label="Busy" value={stats.busy} />
                <StatTile label="Failed" value={stats.failed} />
                <StatTile label="Interested" value={stats.interested} />
                <StatTile label="Hot leads" value={stats.hotLeads} />
                <StatTile label="Meetings" value={stats.meetings} />
                <StatTile label="Conversion" value={`${stats.conversion}%`} />
                <StatTile
                  label="Avg call duration"
                  value={`${stats.avgCallDuration}s`}
                />
              </dl>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
