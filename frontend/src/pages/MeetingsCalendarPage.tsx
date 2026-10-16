import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  createMeeting,
  deleteMeeting,
  listMeetings,
  updateMeeting,
} from '../meetings/api'
import { MeetingStatusBadge } from '../meetings/badges'
import { MeetingForm } from '../meetings/MeetingForm'
import {
  EMPTY_MEETING_FORM_VALUES,
  formValuesToMeetingInput,
  formValuesToUpdateMeetingInput,
  meetingToFormValues,
  type Meeting,
  type MeetingFormValues,
  type PaginatedMeetings,
} from '../meetings/types'
import { listUsers, type BasicUser } from '../users/api'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'

type ViewMode = 'calendar' | 'list'

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

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function MeetingsCalendarPage() {
  const { user } = useAuth()
  const canAssign = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER'

  const [view, setView] = useState<ViewMode>('calendar')
  const [salespeople, setSalespeople] = useState<BasicUser[]>([])

  // List view
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PaginatedMeetings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Calendar view
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()))
  const [monthMeetings, setMonthMeetings] = useState<Meeting[]>([])
  const [monthLoading, setMonthLoading] = useState(true)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Meeting | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (canAssign) {
      listUsers()
        .then(setSalespeople)
        .catch(() => setSalespeople([]))
    }
  }, [canAssign])

  const refetchList = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setLoading(true)
        setError(null)
        return listMeetings({ page, limit: 20 })
      })
      .then(setResult)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load meetings',
        )
      })
      .finally(() => setLoading(false))
  }, [page])

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
        return listMeetings({ from, to, limit: 200 })
      })
      .then((res) => setMonthMeetings(res.data))
      .catch(() => setMonthMeetings([]))
      .finally(() => setMonthLoading(false))
  }, [monthCursor])

  useEffect(() => {
    if (view === 'calendar') refetchMonth()
  }, [view, refetchMonth])

  const refetch = view === 'list' ? refetchList : refetchMonth

  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor])
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const meeting of monthMeetings) {
      const key = startOfDay(new Date(meeting.date)).toDateString()
      const existing = map.get(key) ?? []
      existing.push(meeting)
      map.set(key, existing)
    }
    return map
  }, [monthMeetings])

  async function handleCreate(values: MeetingFormValues, lead: { id: string } | null) {
    if (!lead) return
    await createMeeting(formValuesToMeetingInput(lead.id, values))
    setCreating(false)
    toast.success('Meeting scheduled')
    refetch()
  }

  async function handleEditSubmit(values: MeetingFormValues) {
    if (!editing) return
    await updateMeeting(editing.id, formValuesToUpdateMeetingInput(values))
    setEditing(null)
    toast.success('Meeting updated')
    refetch()
  }

  async function handleDelete(meeting: Meeting) {
    const confirmed = await confirm({
      title: 'Delete meeting',
      message: `Delete the meeting with ${meeting.lead.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    setBusyId(meeting.id)
    try {
      await deleteMeeting(meeting.id)
      toast.success('Meeting deleted')
      refetch()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to delete meeting',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Meetings
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Meeting calendar
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Scheduled manually or detected from a call transcript.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div role="group" aria-label="View" className="flex gap-1.5">
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
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCreating(true)}
          >
            New meeting
          </button>
        </div>
      </header>

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
          {loading && <p className="text-sm text-muted">Loading meetings…</p>}

          {!loading && result?.data.length === 0 && (
            <div className="card text-center text-sm text-muted">
              No meetings scheduled yet.
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
                      When
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted">
                      Type
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
                  {result.data.map((meeting) => (
                    <tr
                      key={meeting.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/leads/${meeting.leadId}`}
                          className="font-semibold text-ink hover:text-brand"
                        >
                          {meeting.lead.name}
                        </Link>
                        <div className="text-xs text-muted">
                          {meeting.lead.phone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(meeting.date).toLocaleDateString(undefined, {
                          dateStyle: 'medium',
                        })}{' '}
                        · {formatTime(meeting.time)}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {meeting.meetingType}
                      </td>
                      <td className="px-4 py-3">
                        <MeetingStatusBadge status={meeting.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditing(meeting)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === meeting.id}
                            onClick={() => void handleDelete(meeting)}
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
            <p className="text-sm text-muted">Loading meetings…</p>
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
                const dayMeetings = meetingsByDay.get(date.toDateString()) ?? []
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
                      {dayMeetings.map((meeting) => (
                        <button
                          key={meeting.id}
                          type="button"
                          title={`${meeting.lead.name} — ${meeting.meetingType}`}
                          onClick={() => setEditing(meeting)}
                          className={
                            meeting.status === 'CANCELLED'
                              ? 'block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-muted line-through hover:underline'
                              : 'block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-brand hover:underline'
                          }
                        >
                          {formatTime(meeting.time)} {meeting.lead.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {creating && (
        <Modal title="Schedule meeting" onClose={() => setCreating(false)}>
          <MeetingForm
            initialValues={EMPTY_MEETING_FORM_VALUES}
            submitLabel="Schedule meeting"
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
            requireLead
            salespeople={canAssign ? salespeople : undefined}
          />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit meeting" onClose={() => setEditing(null)}>
          <MeetingForm
            initialValues={meetingToFormValues(editing)}
            submitLabel="Save changes"
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(null)}
            salespeople={canAssign ? salespeople : undefined}
          />
        </Modal>
      )}
    </>
  )
}
