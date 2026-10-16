import { apiFetch } from '../lib/api'
import type { AppNotification } from './types'

export function listNotifications(options: { unreadOnly?: boolean; limit?: number } = {}) {
  const params = new URLSearchParams()
  if (options.unreadOnly) params.set('unreadOnly', 'true')
  if (options.limit) params.set('limit', String(options.limit))
  const qs = params.toString()
  return apiFetch<AppNotification[]>(`/notifications${qs ? `?${qs}` : ''}`)
}

export function getUnreadNotificationCount() {
  return apiFetch<{ count: number }>('/notifications/unread-count')
}

export function markNotificationRead(id: string) {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, { method: 'POST' })
}

export function markAllNotificationsRead() {
  return apiFetch<void>('/notifications/read-all', { method: 'POST' })
}
