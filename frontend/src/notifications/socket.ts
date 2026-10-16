import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL, getAccessToken } from '../lib/api'
import type { AppNotification, HumanTransferEvent } from './types'

/**
 * Subscribes to notification.created on the backend's dedicated
 * /notifications websocket namespace (see NotificationsGateway) — every
 * NotificationsService.create() call lands here in real time, across every
 * NotificationType (hot lead, follow-up due, deal won, ...), not just
 * human transfers (contrast useHumanTransferSocket below, kept only for
 * HumanTransferPopup's own live-call popup). Unlike that hook, no
 * client-side filtering is needed — the backend only ever emits into the
 * signed-in user's own socket room. A null userId skips connecting.
 */
export function useNotificationsSocket(
  userId: string | null,
  onNotification: (notification: AppNotification) => void,
) {
  const onNotificationRef = useRef(onNotification)

  useEffect(() => {
    onNotificationRef.current = onNotification
  })

  useEffect(() => {
    if (!userId) return

    const token = getAccessToken()
    const socket: Socket = io(`${API_URL}/notifications`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
    })

    const handler = (notification: AppNotification) =>
      onNotificationRef.current(notification)
    socket.on('notification.created', handler)

    return () => {
      socket.off('notification.created', handler)
      socket.disconnect()
    }
  }, [userId])
}

/**
 * Subscribes to human.transfer on the backend's /calling websocket
 * namespace (same namespace useCallingSocket etc. use — see
 * ../calling/socket.ts) and calls onTransfer for every event addressed to
 * userId. The event is a broadcast (the backend doesn't maintain per-user
 * socket rooms — see CallingGateway.emitHumanTransferEvent), so filtering
 * by targetUserId happens here client-side, same posture as
 * useLeadEventsSocket filtering on leadId. A null userId skips connecting.
 */
export function useHumanTransferSocket(
  userId: string | null,
  onTransfer: (event: HumanTransferEvent) => void,
) {
  const onTransferRef = useRef(onTransfer)

  useEffect(() => {
    onTransferRef.current = onTransfer
  })

  useEffect(() => {
    if (!userId) return

    const token = getAccessToken()
    const socket: Socket = io(`${API_URL}/calling`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
    })

    const handler = (event: HumanTransferEvent) => {
      if (event.targetUserId === userId) onTransferRef.current(event)
    }
    socket.on('human.transfer', handler)

    return () => {
      socket.off('human.transfer', handler)
      socket.disconnect()
    }
  }, [userId])
}
