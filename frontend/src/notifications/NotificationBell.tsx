import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Modal } from '../components/Modal'
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './api'
import { useNotificationsSocket } from './socket'
import type { AppNotification } from './types'

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Bell + notifications list, mounted in Nav — the persistent counterpart
 * to HumanTransferPopup's live incoming-transfer popup. Opens as a centered
 * Modal (same component HumanTransferPopup uses) rather than an
 * anchored dropdown — a dropdown positioned off the bell button has to
 * fight Nav's sidebar for space/clipping on every viewport (it did, badly);
 * a centered modal has no such problem on desktop, tablet, or mobile, and
 * it already comes with a close button (top-right), backdrop-click-to-close,
 * and Escape-to-close for free (see components/Modal.tsx). */
export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<AppNotification[]>([])

  useEffect(() => {
    if (!user) return
    getUnreadNotificationCount()
      .then((res) => setUnreadCount(res.count))
      .catch(() => {})
  }, [user])

  // The event's own fields aren't needed here — arriving at all is enough
  // to bump the badge; the modal re-fetches the full list next time it opens.
  // Covers every NotificationType (see NotificationsGateway), not just
  // HUMAN_TRANSFER — HumanTransferPopup keeps its own separate subscription
  // for the live-call popup itself.
  const onNotification = useCallback(() => {
    setUnreadCount((c) => c + 1)
  }, [])
  useNotificationsSocket(user?.id ?? null, onNotification)

  function openModal() {
    setOpen(true)
    listNotifications({ limit: 20 })
      .then(setItems)
      .catch(() => {})
  }

  function openNotification(n: AppNotification) {
    setOpen(false)
    if (!n.readAt) {
      setUnreadCount((c) => Math.max(0, c - 1))
      markNotificationRead(n.id).catch(() => {})
    }
    if (n.leadId) navigate(`/leads/${n.leadId}`)
  }

  function markAllRead() {
    setUnreadCount(0)
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    markAllNotificationsRead().catch(() => {})
  }

  if (!user) return null

  return (
    <>
      <button
        type="button"
        className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-ink"
        onClick={openModal}
        aria-label="Notifications"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
          <path
            d="M5 8a5 5 0 0 1 10 0c0 3.5 1.2 4.8 1.2 4.8H3.8S5 11.5 5 8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8.3 15.5a1.7 1.7 0 0 0 3.4 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <Modal title="Notifications" onClose={() => setOpen(false)} widthClassName="max-w-md">
          {items.some((n) => !n.readAt) && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-brand hover:underline"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No notifications yet.</p>
          ) : (
            <ul className="-mx-6">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full cursor-pointer border-b border-border px-6 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-hover ${
                      n.readAt ? '' : 'bg-brand-soft/40'
                    }`}
                    onClick={() => openNotification(n)}
                  >
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted">{relativeTime(n.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  )
}
