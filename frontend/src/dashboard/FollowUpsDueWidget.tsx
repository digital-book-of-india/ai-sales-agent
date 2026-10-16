import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listDueFollowUps } from '../follow-ups/api'
import type { FollowUp } from '../follow-ups/types'

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** "Follow-ups due" widget — every PENDING follow-up already at/past its
 * dueAt (see GET /follow-ups/due), scoped to the current user the same way
 * the rest of the Dashboard is. Refetches on mount only, same posture as
 * the stat cards above it — the follow-up scheduler runs in the background
 * (see FollowUpsService.processDue) rather than pushing live updates here. */
export function FollowUpsDueWidget() {
  const [followUps, setFollowUps] = useState<FollowUp[] | null>(null)

  useEffect(() => {
    listDueFollowUps()
      .then(setFollowUps)
      .catch(() => setFollowUps([]))
  }, [])

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">Follow-ups due</h2>
        <Link
          to="/follow-ups"
          className="text-xs font-semibold text-brand hover:underline"
        >
          View all
        </Link>
      </div>

      {followUps === null && (
        <p className="text-sm text-muted">Loading…</p>
      )}

      {followUps !== null && followUps.length === 0 && (
        <p className="text-sm text-muted">Nothing due right now.</p>
      )}

      {followUps !== null && followUps.length > 0 && (
        <ul className="flex flex-col gap-3">
          {followUps.map((followUp) => (
            <li
              key={followUp.id}
              className="border-b border-border pb-3 last:border-b-0 last:pb-0"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <Link
                  to={`/leads/${followUp.leadId}`}
                  className="text-sm font-semibold text-ink hover:text-brand"
                >
                  {followUp.lead.name}
                </Link>
                <span className="text-xs text-danger">
                  {formatDue(followUp.dueAt)}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-muted">
                {followUp.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
