import type { HumanTransferPayload } from './types'

function formatBudget(budget: number | null) {
  if (budget === null) return '—'
  return `₹${budget.toLocaleString('en-IN')}`
}

function formatTime(at: string) {
  return new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

/** Renders the full handoff context Prompt 18 asks for: customer name,
 * company, requirement, budget, timeline, AI summary so far, lead score,
 * and the live conversation transcript. Shared by HumanTransferPopup (the
 * auto-opened incoming-call popup) and NotificationBell (past transfers
 * from the inbox). */
export function TransferContextDetails({ payload }: { payload: HumanTransferPayload }) {
  return (
    <div className="flex flex-col gap-4">
      {payload.reasonLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {payload.reasonLabels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Customer</dt>
          <dd className="mt-0.5 font-medium text-ink">{payload.customerName}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Company</dt>
          <dd className="mt-0.5 font-medium text-ink">{payload.companyName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Budget</dt>
          <dd className="mt-0.5 font-medium text-ink">{formatBudget(payload.budget)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Timeline</dt>
          <dd className="mt-0.5 font-medium text-ink">{payload.timeline ?? '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Requirement</dt>
          <dd className="mt-0.5 font-medium text-ink">{payload.requirement ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Lead score</dt>
          <dd className="mt-0.5 font-medium text-ink">{payload.leadScore} / 100</dd>
        </div>
      </dl>

      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">AI summary so far</p>
        <p className="mt-1 rounded-lg bg-surface-hover p-3 text-sm text-ink">{payload.aiSummary}</p>
      </div>

      {payload.transcript.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            Live conversation
          </p>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            {payload.transcript.map((turn, i) => (
              <div key={i} className="text-sm">
                <span
                  className={`font-semibold ${turn.speaker === 'agent' ? 'text-brand' : 'text-ink'}`}
                >
                  {turn.speaker === 'agent' ? 'AI' : 'Customer'}
                </span>{' '}
                <span className="text-xs text-muted">{formatTime(turn.at)}</span>
                <p className="text-ink">{turn.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
