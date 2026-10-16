import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { createCampaign, listCampaigns } from '../campaigns/api'
import { CampaignStatusBadge } from '../campaigns/badges'
import { CampaignForm } from '../campaigns/CampaignForm'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  EMPTY_CAMPAIGN_FORM_VALUES,
  formValuesToInput,
  type Campaign,
  type CampaignFormValues,
  type PaginatedCampaigns,
} from '../campaigns/types'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled'
  return new Date(value).toLocaleDateString()
}

export function CampaignsListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<PaginatedCampaigns | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const refetch = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return listCampaigns({
          status: (status || undefined) as Campaign['status'] | undefined,
          search: search || undefined,
        })
      })
      .then(setResult)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load campaigns',
        )
      })
      .finally(() => setLoading(false))
  }, [status, search])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function handleCreate(values: CampaignFormValues) {
    const created = await createCampaign(formValuesToInput(values))
    setShowCreateModal(false)
    toast.success('Campaign created')
    navigate(`/campaigns/${created.id}`)
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Campaigns
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Calling campaigns
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {result
              ? `${result.total} campaign${result.total === 1 ? '' : 's'}`
              : 'Loading…'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            New campaign
          </button>
        )}
      </header>

      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label
              htmlFor="campaign-search"
              className="text-xs font-semibold text-muted"
            >
              Search
            </label>
            <input
              id="campaign-search"
              className="input-field"
              placeholder="Campaign name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="campaign-status-filter"
              className="text-xs font-semibold text-muted"
            >
              Status
            </label>
            <select
              id="campaign-status-filter"
              className="input-field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CAMPAIGN_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-muted">Loading campaigns…</p>}

      {!loading && result?.data.length === 0 && (
        <div className="card text-center text-sm text-muted">
          No campaigns match your filters.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!loading &&
          result?.data.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => navigate(`/campaigns/${campaign.id}`)}
              className="card cursor-pointer text-left transition-colors hover:bg-surface-hover"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="text-base font-bold text-ink">{campaign.name}</h2>
                <CampaignStatusBadge status={campaign.status} />
              </div>
              {campaign.description && (
                <p className="mb-4 line-clamp-2 text-sm text-muted">
                  {campaign.description}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Leads</dt>
                  <dd className="font-semibold text-ink">
                    {campaign._count.campaignLeads}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Max attempts</dt>
                  <dd className="font-semibold text-ink">
                    {campaign.maxAttempts}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Start date</dt>
                  <dd className="font-semibold text-ink">
                    {formatDate(campaign.startDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Concurrent calls</dt>
                  <dd className="font-semibold text-ink">
                    {campaign.concurrentCalls}
                  </dd>
                </div>
              </dl>
            </button>
          ))}
      </div>

      {canManage && showCreateModal && (
        <Modal
          title="New campaign"
          onClose={() => setShowCreateModal(false)}
          widthClassName="max-w-2xl"
        >
          <CampaignForm
            initialValues={EMPTY_CAMPAIGN_FORM_VALUES}
            submitLabel="Create campaign"
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
          />
        </Modal>
      )}
    </>
  )
}
