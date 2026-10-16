import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  bulkAssignLeads,
  createLead,
  exportLeads,
  listLeads,
} from '../leads/api'
import { listUsers, type BasicUser } from '../users/api'
import {
  EMPTY_LEAD_FORM_VALUES,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  formValuesToInput,
  type LeadFormValues,
  type LeadSummary,
  type PaginatedLeads,
} from '../leads/types'
import { StatusBadge, PriorityBadge, LeadScoreBadge } from '../leads/badges'
import { LeadForm } from '../leads/LeadForm'
import { LeadImportModal } from '../leads/LeadImportModal'
import { CallButton } from '../calling/CallButton'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'

type SortField =
  'name' | 'status' | 'priority' | 'leadScore' | 'createdAt' | 'nextFollowUpAt'

const PAGE_SIZE = 20

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

function SortButton({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
}: {
  field: SortField
  label: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: SortField) => void
}) {
  const active = sortBy === field
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`flex cursor-pointer items-center gap-1 text-left font-semibold ${active ? 'text-ink' : 'text-muted'}`}
    >
      {label}
      {active && (
        <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  )
}

export function LeadsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<PaginatedLeads | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [owners, setOwners] = useState<BasicUser[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    if (!canManage) return
    listUsers()
      .then(setOwners)
      .catch(() => setOwners([]))
  }, [canManage])

  const refetch = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return listLeads({
          page,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: (status || undefined) as LeadSummary['status'] | undefined,
          assignedTo: assignedTo || undefined,
          sortBy,
          sortOrder,
        })
      })
      .then((data) => {
        setResult(data)
        setSelected(new Set())
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load leads')
      })
      .finally(() => setLoading(false))
  }, [page, debouncedSearch, status, assignedTo, sortBy, sortOrder])

  useEffect(() => {
    refetch()
  }, [refetch])

  function handleSort(field: SortField) {
    if (field === sortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!result) return
    setSelected((prev) =>
      prev.size === result.data.length
        ? new Set()
        : new Set(result.data.map((lead) => lead.id)),
    )
  }

  async function handleBulkAssign() {
    if (!bulkAssignee || selected.size === 0) return
    setBulkSubmitting(true)
    try {
      await bulkAssignLeads(Array.from(selected), bulkAssignee)
      setBulkAssignee('')
      toast.success('Leads assigned')
      refetch()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to assign leads'
      toast.error(message)
    } finally {
      setBulkSubmitting(false)
    }
  }

  async function handleCreate(values: LeadFormValues) {
    const created = await createLead(formValuesToInput(values))
    setShowCreateModal(false)
    toast.success('Lead created')
    navigate(`/leads/${created.id}`)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportLeads({
        search: debouncedSearch || undefined,
        status: (status || undefined) as LeadSummary['status'] | undefined,
        assignedTo: assignedTo || undefined,
        sortBy,
        sortOrder,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `leads-export-${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Leads exported')
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to export leads'
      toast.error(message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Leads
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Lead pipeline
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {result
              ? `${result.total} lead${result.total === 1 ? '' : 's'}`
              : 'Loading…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {canManage && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowImportModal(true)}
            >
              Import CSV
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Add Lead
          </button>
        </div>
      </header>

      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label
              htmlFor="lead-search"
              className="text-xs font-semibold text-muted"
            >
              Search
            </label>
            <input
              id="lead-search"
              className="input-field"
              placeholder="Name, phone, email, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="status-filter"
              className="text-xs font-semibold text-muted"
            >
              Status
            </label>
            <select
              id="status-filter"
              className="input-field"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {canManage && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="owner-filter"
                className="text-xs font-semibold text-muted"
              >
                Owner
              </label>
              <select
                id="owner-filter"
                className="input-field"
                value={assignedTo}
                onChange={(e) => {
                  setAssignedTo(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All owners</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {canManage && selected.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-brand-soft px-3.5 py-2.5">
            <span className="text-sm font-medium text-ink">
              {selected.size} selected
            </span>
            <select
              className="input-field w-auto"
              value={bulkAssignee}
              onChange={(e) => setBulkAssignee(e.target.value)}
            >
              <option value="">Assign to…</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!bulkAssignee || bulkSubmitting}
              onClick={() => void handleBulkAssign()}
            >
              {bulkSubmitting ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b border-border text-xs">
              {canManage && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all leads"
                    checked={
                      !!result &&
                      result.data.length > 0 &&
                      selected.size === result.data.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
              )}
              <th className="px-4 py-3">
                <SortButton
                  field="name"
                  label="Name"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted">
                Company
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted">
                Phone
              </th>
              <th className="px-4 py-3">
                <SortButton
                  field="status"
                  label="Status"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3">
                <SortButton
                  field="priority"
                  label="Priority"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3">
                <SortButton
                  field="leadScore"
                  label="Score"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted">
                Owner
              </th>
              <th className="px-4 py-3">
                <SortButton
                  field="nextFollowUpAt"
                  label="Next follow-up"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted">
                Call
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted">
                  Loading leads…
                </td>
              </tr>
            )}
            {!loading && result?.data.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted">
                  No leads match your filters.
                </td>
              </tr>
            )}
            {!loading &&
              result?.data.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-border last:border-b-0 hover:bg-surface-hover"
                >
                  {canManage && (
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${lead.name}`}
                        checked={selected.has(lead.id)}
                        onChange={() => toggleSelected(lead.id)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="cursor-pointer text-left font-semibold text-ink hover:text-brand"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      {lead.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {lead.companyName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">{lead.phone}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={lead.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <LeadScoreBadge score={lead.leadScore} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {lead.assignedTo?.name ?? 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(lead.nextFollowUpAt)}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <CallButton leadId={lead.id} leadName={lead.name} variant="compact" />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {result && result.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {result.page} of {result.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= result.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <Modal title="Add lead" onClose={() => setShowCreateModal(false)}>
          <LeadForm
            initialValues={EMPTY_LEAD_FORM_VALUES}
            owners={owners}
            canAssign={canManage}
            submitLabel="Create lead"
            onSubmit={handleCreate}
            onCancel={() => setShowCreateModal(false)}
          />
        </Modal>
      )}

      {showImportModal && (
        <LeadImportModal
          onClose={() => setShowImportModal(false)}
          onImported={refetch}
        />
      )}
    </>
  )
}
