import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Modal } from '../components/Modal'
import { useHumanTransferSocket } from './socket'
import { TransferContextDetails } from './TransferContextDetails'
import { markNotificationRead } from './api'
import type { HumanTransferEvent } from './types'

/**
 * Mounted once, globally (see components/Layout.tsx) — pops up an incoming
 * call context modal the moment a live AI call is handed off to the
 * signed-in salesperson (Prompt 18). Queues events instead of dropping
 * them if more than one arrives close together (rare, but a salesperson
 * shouldn't lose a handoff because they were mid-dialog on another one).
 */
export function HumanTransferPopup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [queue, setQueue] = useState<HumanTransferEvent[]>([])

  const onTransfer = useCallback((event: HumanTransferEvent) => {
    setQueue((q) => [...q, event])
  }, [])

  useHumanTransferSocket(user?.id ?? null, onTransfer)

  if (queue.length === 0) return null

  const current = queue[0]

  function dismiss() {
    markNotificationRead(current.notificationId).catch(() => {
      // Best-effort — the notification still shows as unread in the bell,
      // which the viewer can clear manually; not worth surfacing an error
      // for a background read-receipt call.
    })
    setQueue((q) => q.slice(1))
  }

  function viewLead() {
    dismiss()
    navigate(`/leads/${current.leadId}`)
  }

  return (
    <Modal title={`Incoming transfer: ${current.customerName}`} onClose={dismiss} widthClassName="max-w-xl">
      <div className="flex flex-col gap-5">
        <TransferContextDetails payload={current} />
        <div className="flex justify-end gap-2.5">
          <button type="button" className="btn-secondary" onClick={dismiss}>
            Dismiss
          </button>
          <button type="button" className="btn-primary" onClick={viewLead}>
            View lead
          </button>
        </div>
      </div>
    </Modal>
  )
}
