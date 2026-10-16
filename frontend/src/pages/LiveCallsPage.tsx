import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveCalls, listCallingQueue } from '../calling/api'
import { useCallingSocket } from '../calling/socket'
import { CallingStatusBadge } from '../calling/badges'
import { LiveTranscriptPanel } from '../calling/LiveTranscriptPanel'
import {
  CALLING_QUEUE_STATUSES,
  CALLING_QUEUE_STATUS_LABEL,
  type CallEvent,
  type CallEventName,
  type CallingQueueItem,
  type CallingQueueStatus,
  type PaginatedCallingQueue,
} from '../calling/types'
import { ApiError } from '../lib/api'

const PAGE_SIZE = 20

interface RecentActivity {
  key: string
  leadName: string
  campaignName: string
  status: string
  outcome?: string
  at: number
}

function upsertLiveCall(
  items: CallingQueueItem[],
  event: CallEvent,
  status: CallingQueueStatus,
): CallingQueueItem[] {
  const existing = items.find((item) => item.id === event.queueItemId)
  if (existing) {
    return items.map((item) =>
      item.id === event.queueItemId ? { ...item, status } : item,
    )
  }

  // Optimistic placeholder until the next queue refetch fills in the rest
  // (phone number, priority, etc.) from the database.
  const placeholder: CallingQueueItem = {
    id: event.queueItemId,
    leadId: event.leadId,
    campaignId: event.campaignId,
    priority: 0,
    status,
    attempts: event.attempts,
    maxAttempts: event.attempts,
    scheduledAt: new Date().toISOString(),
    nextRetryAt: null,
    lastAttemptAt: new Date().toISOString(),
    callId: event.callId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lead: { id: event.leadId, name: event.leadName, phone: '—', companyName: null },
    campaign: { id: event.campaignId, name: event.campaignName },
  }
  return [placeholder, ...items]
}

export function LiveCallsPage() {
  const [liveCalls, setLiveCalls] = useState<CallingQueueItem[]>([])
  const [liveError, setLiveError] = useState<string | null>(null)
  const [activity, setActivity] = useState<RecentActivity[]>([])

  const [statusFilter, setStatusFilter] = useState<CallingQueueStatus | ''>('')
  const [page, setPage] = useState(1)
  const [queue, setQueue] = useState<PaginatedCallingQueue | null>(null)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState<string | null>(null)

  const refetchLiveCalls = useCallback(() => {
    Promise.resolve()
      .then(() => getLiveCalls())
      .then(setLiveCalls)
      .catch((err: unknown) => {
        setLiveError(err instanceof ApiError ? err.message : 'Failed to load live calls')
      })
  }, [])

  const refetchQueue = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setQueueLoading(true)
        setQueueError(null)
        return listCallingQueue({
          page,
          limit: PAGE_SIZE,
          status: statusFilter || undefined,
        })
      })
      .then(setQueue)
      .catch((err: unknown) => {
        setQueueError(err instanceof ApiError ? err.message : 'Failed to load the queue')
      })
      .finally(() => setQueueLoading(false))
  }, [page, statusFilter])

  useEffect(() => {
    refetchLiveCalls()
  }, [refetchLiveCalls])

  useEffect(() => {
    refetchQueue()
  }, [refetchQueue])

  const refetchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimeout.current) clearTimeout(refetchTimeout.current)
    refetchTimeout.current = setTimeout(() => {
      refetchLiveCalls()
      refetchQueue()
    }, 800)
  }, [refetchLiveCalls, refetchQueue])

  useEffect(() => {
    return () => {
      if (refetchTimeout.current) clearTimeout(refetchTimeout.current)
    }
  }, [])

  const handleEvent = useCallback(
    (name: CallEventName, event: CallEvent) => {
      if (name === 'call.ended') {
        setLiveCalls((items) => items.filter((item) => item.id !== event.queueItemId))
        setActivity((prev) =>
          [
            {
              key: `${event.queueItemId}-${Date.now()}`,
              leadName: event.leadName,
              campaignName: event.campaignName,
              status: event.status,
              outcome: event.outcome,
              at: Date.now(),
            },
            ...prev,
          ].slice(0, 10),
        )
        scheduleRefetch()
        return
      }

      const status = event.status as CallingQueueStatus
      setLiveCalls((items) => upsertLiveCall(items, event, status))
      if (name === 'call.created') {
        scheduleRefetch()
      }
    },
    [scheduleRefetch],
  )

  const { connected } = useCallingSocket(handleEvent)

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
            Calling
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Live Calls</h1>
          <p className="mt-1.5 text-sm text-muted">
            Real-time view of the backend dialer queue — nothing here can be
            triggered from the browser.
          </p>
        </div>
        <span
          className={`badge ${connected ? 'badge-success' : 'badge-muted'}`}
          role="status"
        >
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </header>

      {liveError && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {liveError}
        </p>
      )}

      <div className="mb-8">
        <h2 className="mb-4 text-base font-bold text-ink">
          In progress {liveCalls.length > 0 && `(${liveCalls.length})`}
        </h2>
        {liveCalls.length === 0 ? (
          <div className="card text-sm text-muted">No calls in progress right now.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveCalls.map((call) => (
              <div key={call.id} className="card">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="font-semibold text-ink">{call.lead.name}</span>
                  <CallingStatusBadge status={call.status} />
                </div>
                <p className="text-sm text-muted">{call.lead.phone}</p>
                <p className="mt-1 text-xs text-muted">{call.campaign.name}</p>
                <p className="mt-2 text-xs text-muted">
                  Attempt {call.attempts} of {call.maxAttempts}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <LiveTranscriptPanel liveCalls={liveCalls} />
      </div>

      {activity.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-base font-bold text-ink">Recent activity</h2>
          <div className="card p-0">
            <ul>
              {activity.map((entry) => (
                <li
                  key={entry.key}
                  className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="font-medium text-ink">{entry.leadName}</span>
                  <span className="text-muted">{entry.campaignName}</span>
                  <span className="text-muted">{entry.outcome ?? entry.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink">Queue</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="queue-status-filter"
              className="input-field"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CallingQueueStatus | '')
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              {CALLING_QUEUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CALLING_QUEUE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {queueError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            {queueError}
          </p>
        )}

        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-160 text-sm">
            <thead>
              <tr className="border-b border-border text-xs">
                <th className="px-4 py-3 text-left font-semibold text-muted">Lead</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">Campaign</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">Attempts</th>
                <th className="px-4 py-3 text-left font-semibold text-muted">
                  Last attempt
                </th>
              </tr>
            </thead>
            <tbody>
              {queueLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Loading queue…
                  </td>
                </tr>
              )}
              {!queueLoading && queue?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No queue items match this filter.
                  </td>
                </tr>
              )}
              {!queueLoading &&
                queue?.data.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-ink">{item.lead.name}</span>
                      <span className="block text-xs text-muted">{item.lead.phone}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{item.campaign.name}</td>
                    <td className="px-4 py-3">
                      <CallingStatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {item.attempts} / {item.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {item.lastAttemptAt
                        ? new Date(item.lastAttemptAt).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {queue && queue.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>
              Page {queue.page} of {queue.totalPages}
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
                disabled={page >= queue.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
