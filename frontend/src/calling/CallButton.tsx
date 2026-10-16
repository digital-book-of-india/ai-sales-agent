import { useCallback, useState } from 'react'
import { initiateLeadCall } from '../leads/api'
import { softphone, useSoftphone } from './softphone'
import { useCallingSocket } from './socket'
import { CallingStatusBadge } from './badges'
import { Modal } from '../components/Modal'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import type { CallEvent, CallEventName, CallingQueueStatus } from './types'

interface ActiveCall {
  callId: string
  queueItemId: string
}

interface CallButtonProps {
  leadId: string
  leadName: string
  /** 'compact' renders an icon-only button for dense contexts like a table
   * row; 'default' (lead detail page) renders a labeled button. */
  variant?: 'default' | 'compact'
  /** Called when the call panel closes after a call has ended — e.g. the
   * lead detail page uses this to refetch its call history. */
  onCallEnded?: () => void
}

/** "Call" button for a single lead — see LeadsListPage / LeadDetailPage.
 * Reused as-is in both places; all state (registration, active call) lives
 * here so neither page needs to know about the softphone. */
export function CallButton({
  leadId,
  leadName,
  variant = 'default',
  onCallEnded,
}: CallButtonProps) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [callEnded, setCallEnded] = useState(false)
  const [starting, setStarting] = useState(false)

  const handleClick = useCallback(async () => {
    setStarting(true)
    try {
      await softphone.ensureRegistered()
      const result = await initiateLeadCall(leadId)
      softphone.resetCallStatus()
      setCallEnded(false)
      setActiveCall({ callId: result.callId, queueItemId: result.queueItemId })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to start the call'
      toast.error(message)
    } finally {
      setStarting(false)
    }
  }, [leadId])

  return (
    <>
      <button
        type="button"
        className={variant === 'compact' ? 'btn-secondary px-2.5 py-1.5 text-xs' : 'btn-secondary'}
        disabled={starting}
        onClick={(e) => {
          e.stopPropagation()
          void handleClick()
        }}
        aria-label={`Call ${leadName}`}
      >
        {starting ? 'Connecting…' : 'Call'}
      </button>

      {activeCall && (
        <ActiveCallPanel
          leadName={leadName}
          callId={activeCall.callId}
          onEnded={() => setCallEnded(true)}
          onClose={() => {
            setActiveCall(null)
            if (callEnded) onCallEnded?.()
          }}
        />
      )}
    </>
  )
}

const TERMINAL_STATUSES: CallingQueueStatus[] = [
  'COMPLETED',
  'FAILED',
  'NO_ANSWER',
  'BUSY',
  'CANCELLED',
]

function ActiveCallPanel({
  leadName,
  callId,
  onEnded,
  onClose,
}: {
  leadName: string
  callId: string
  onEnded: () => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<CallingQueueStatus>('DIALING')
  const [outcome, setOutcome] = useState<string | null>(null)
  const softphoneState = useSoftphone()

  const handleEvent = useCallback(
    (_name: CallEventName, event: CallEvent) => {
      if (event.callId !== callId) return
      setStatus(event.status as CallingQueueStatus)
      if (event.outcome) setOutcome(event.outcome)
      if (TERMINAL_STATUSES.includes(event.status as CallingQueueStatus)) {
        onEnded()
      }
    },
    [callId, onEnded],
  )
  const { connected } = useCallingSocket(handleEvent)

  const ended = TERMINAL_STATUSES.includes(status)

  return (
    <Modal title={`Call — ${leadName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Call status</span>
          <CallingStatusBadge status={status} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Your phone</span>
          <span className="text-sm font-medium text-ink">
            {softphoneState.status === 'error'
              ? (softphoneState.error ?? 'Error')
              : softphoneState.callStatus === 'ringing'
                ? 'Ringing…'
                : softphoneState.callStatus === 'connected'
                  ? 'Connected'
                  : softphoneState.callStatus === 'ended'
                    ? 'Ended'
                    : 'Waiting…'}
          </span>
        </div>

        {!connected && (
          <p className="text-xs text-muted">Connecting to live call updates…</p>
        )}

        {ended ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              Call ended{outcome ? ` — ${outcome.toLowerCase().replace('_', ' ')}` : ''}.
            </p>
            <button type="button" className="btn-primary self-end" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-danger self-end"
            onClick={() => softphone.hangup()}
          >
            Hang up
          </button>
        )}
      </div>
    </Modal>
  )
}
