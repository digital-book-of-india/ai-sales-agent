import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  completeFollowUp,
  deleteFollowUp,
  listFollowUps,
  updateFollowUp,
} from '../follow-ups/api'
import { FollowUpStatusBadge } from '../follow-ups/badges'
import { FollowUpForm } from '../follow-ups/FollowUpForm'
import {
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_STATUS_LABEL,
  followUpToFormValues,
  formValuesToUpdateInput,
  type FollowUp,
  type FollowUpFormValues,
  type FollowUpStatus,
  type PaginatedFollowUps,
} from '../follow-ups/types'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

type ViewMode = 'list' | 'calendar'

interface CalendarDay {
  date: Date
  inMonth: boolean
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Full 6-week grid for the month `cursor` falls in, including the leading/
 * trailing days from adjacent months needed to fill each week (Sun-Sat). */
function buildMonthGrid(cursor: Date): CalendarDay[] {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay())

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    return { date, inMonth: date.getMonth() === month }
  })
}

function monthLabel(cursor: Date): string {
  return cursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function FollowUpsListPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [status, setStatus] = useState<FollowUpStatus | ''>('')

  // List view
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PaginatedFollowUps | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Calendar view
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()))
  const [monthFollowUps, setMonthFollowUps] = useState<FollowUp[]>([])
  const [monthLoading, setMonthLoading] = useState(true)

  const [editing, setEditing] = useState<FollowUp | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refetchList = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return listFollowUps({ status: status || undefined, page, limit: 20 })
      })
      .then(setResult)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load follow-ups',
        )
      })
      .finally(() => setLoading(false))
  }, [status, page])

  useEffect(() => {
    if (view === 'list') refetchList()
  }, [view, refetchList])

  const refetchMonth = useCallback(() => {
    const from = new Date(
      monthCursor.getFullYear(),
      monthCursor.getMonth() - 1,
      25,
    ).toISOString()
    const to = new Date(
      monthCursor.getFullYear(),
      monthCursor.getMonth() + 2,
      5,
    ).toISOString()

    Promise.resolve()
      .then(() => {
        setMonthLoading(true)
        return listFollowUps({
          status: status || undefined,
          from,
          to,
          limit: 200,
        })
      })
      .then((res) => setMonthFollowUps(res.data))
      .catch(() => setMonthFollowUps([]))
      .finally(() => setMonthLoading(false))
  }, [monthCursor, status])

  useEffect(() => {
    if (view === 'calendar') refetchMonth()
  }, [view, refetchMonth])

  const refetch = view === 'list' ? refetchList : refetchMonth

  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor])
  const followUpsByDay = useMemo(() => {
    const map = new Map<string, FollowUp[]>()
    for (const followUp of monthFollowUps) {
      const key = startOfDay(new Date(followUp.dueAt)).toDateString()
      const existing = map.get(key) ?? []
      existing.push(followUp)
      map.set(key, existing)
    }
    return map
  }, [monthFollowUps])

  async function handleComplete(followUp: FollowUp) {
    setBusyId(followUp.id)
    try {
      await completeFollowUp(followUp.id)
      toast.success('Follow-up marked done')
      refetch()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to complete follow-up',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(followUp: FollowUp) {
    const confirmed = await confirm({
      title: 'Delete follow-up',
      message: `Delete the follow-up for ${followUp.lead.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setBusyId(followUp.id)
    try {
      await deleteFollowUp(followUp.id)
      toast.success('Follow-up deleted')
      refetch()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to delete follow-up',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleEditSubmit(values: FollowUpFormValues) {
    if (!editing) return
    await updateFollowUp(editing.id, formValuesToUpdateInput(values))
    setEditing(null)
    toast.success('Follow-up updated')
    refetch()
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Follow-ups
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Scheduled follow-ups
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {view === 'list' && result
              ? `${result.total} follow-up${result.total === 1 ? '' : 's'}`
              : 'Callbacks logged manually or detected from a call transcript.'}
          </p>
        </div>
        <div role="group" aria-label="View" className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={
              view === 'list'
                ? 'rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-on'
                : 'rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink'
            }
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            aria-pressed={view === 'calendar'}
            className={
              view === 'calendar'
                ? 'rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-on'
                : 'rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink'
            }
          >
            Calendar
          </button>
        </div>
      </header>

      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="follow-up-status-filter"
              className="text-xs font-semibold text-muted"
            >
              Status
            </label>
            <select
              id="follow-up-status-filter"
              className="input-field"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as FollowUpStatus | '')
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              {FOLLOW_UP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FOLLOW_UP_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && view === 'list' && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {view === 'list' && (
        <>
          {loading && <p className="text-sm text-muted">Loading follow-ups…</p>}

          {!loading && result?.data.length === 0 && (
            <div className="card text-center text-sm text-muted">
              No follow-ups match your filters.
            </div>
          )}

          {!loading && result && result.data.length > 0 && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-150 text-sm">
                <thead>
                  <tr className="border-b border-border text-xs">
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Lead
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Due
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((followUp) => (
                    <tr
                      key={followUp.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/leads/${followUp.leadId}`}
                          className="font-semibold text-ink hover:text-brand"
                        >
                          {followUp.lead.name}
                        </Link>
                        <div className="text-xs text-muted">
                          {followUp.lead.phone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDueAt(followUp.dueAt)}
                      </td>
                      <td className="max-w-80 px-4 py-3 text-ink">
                        {followUp.reason}
                      </td>
                      <td className="px-4 py-3">
                        <FollowUpStatusBadge status={followUp.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {followUp.status === 'PENDING' && (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={busyId === followUp.id}
                              onClick={() => void handleComplete(followUp)}
                            >
                              Complete
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditing(followUp)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === followUp.id}
                            onClick={() => void handleDelete(followUp)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
        </>
      )}

      {view === 'calendar' && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setMonthCursor(
                  (c) => new Date(c.getFullYear(), c.getMonth() - 1, 1),
                )
              }
            >
              ← Prev
            </button>
            <h2 className="text-base font-bold text-ink">
              {monthLabel(monthCursor)}
            </h2>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setMonthCursor(
                  (c) => new Date(c.getFullYear(), c.getMonth() + 1, 1),
                )
              }
            >
              Next →
            </button>
          </div>

          {monthLoading && (
            <p className="text-sm text-muted">Loading follow-ups…</p>
          )}

          {!monthLoading && (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="bg-surface px-2 py-1.5 text-center text-xs font-semibold text-muted"
                >
                  {label}
                </div>
              ))}
              {grid.map(({ date, inMonth }) => {
                const dayFollowUps =
                  followUpsByDay.get(date.toDateString()) ?? []
                const isToday = isSameDay(date, new Date())
                return (
                  <div
                    key={date.toISOString()}
                    className={`min-h-24 bg-surface px-1.5 py-1.5 ${inMonth ? '' : 'opacity-40'}`}
                  >
                    <div
                      className={
                        isToday
                          ? 'mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-on'
                          : 'mb-1 text-xs font-semibold text-muted'
                      }
                    >
                      {date.getDate()}
                    </div>
                    <div className="flex flex-col gap-1">
                      {dayFollowUps.map((followUp) => (
                        <Link
                          key={followUp.id}
                          to={`/leads/${followUp.leadId}`}
                          title={`${followUp.lead.name} — ${followUp.reason}`}
                          className={
                            followUp.status === 'PENDING'
                              ? 'block truncate rounded px-1.5 py-0.5 text-xs font-medium text-brand hover:underline'
                              : 'block truncate rounded px-1.5 py-0.5 text-xs font-medium text-muted line-through hover:underline'
                          }
                        >
                          {new Date(followUp.dueAt).toLocaleTimeString(
                            undefined,
                            { hour: 'numeric', minute: '2-digit' },
                          )}{' '}
                          {followUp.lead.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {editing && (
        <Modal title="Edit follow-up" onClose={() => setEditing(null)}>
          <FollowUpForm
            initialValues={followUpToFormValues(editing)}
            submitLabel="Save changes"
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  )
}
