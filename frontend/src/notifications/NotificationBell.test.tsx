import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './NotificationBell'
import type { AppNotification } from './types'

const mocks = vi.hoisted(() => {
  let onNotification: ((notification: AppNotification) => void) | null = null
  return {
    getUnreadNotificationCount: vi.fn(),
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
    getOnNotification: () => onNotification,
    setOnNotification: (next: typeof onNotification) => {
      onNotification = next
    },
  }
})

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'rep@example.com', role: 'SALES_EXECUTIVE' } }),
}))

vi.mock('./api', () => ({
  getUnreadNotificationCount: mocks.getUnreadNotificationCount,
  listNotifications: mocks.listNotifications,
  markNotificationRead: mocks.markNotificationRead,
  markAllNotificationsRead: mocks.markAllNotificationsRead,
}))

vi.mock('./socket', () => ({
  useNotificationsSocket: (
    _userId: string | null,
    onNotification: (notification: AppNotification) => void,
  ) => {
    mocks.setOnNotification(onNotification)
  },
}))

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'notif-1',
    type: 'HUMAN_TRANSFER',
    title: 'Live call transfer: Asha Verma',
    body: 'Customer asked for a human',
    payload: {
      callId: 'call-1',
      leadId: 'lead-1',
      customerName: 'Asha Verma',
      companyName: 'Acme Co',
      requirement: null,
      budget: null,
      timeline: null,
      aiSummary: '',
      leadScore: 72,
      reasons: ['explicit_request'],
      reasonLabels: ['Customer asked for a human'],
      transcript: [],
    },
    leadId: 'lead-1',
    callId: 'call-1',
    readAt: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    ...overrides,
  }
}

function renderBell() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<NotificationBell />} />
        <Route path="/leads/:id" element={<p>Lead detail page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('NotificationBell', () => {
  beforeEach(() => {
    mocks.getUnreadNotificationCount.mockReset().mockResolvedValue({ count: 2 })
    mocks.listNotifications.mockReset().mockResolvedValue([notification()])
    mocks.markNotificationRead.mockClear()
    mocks.markAllNotificationsRead.mockClear()
    mocks.setOnNotification(null)
  })

  it('shows the unread count loaded on mount', async () => {
    renderBell()

    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('bumps the unread count live when a notification arrives, of any type', async () => {
    renderBell()
    await screen.findByText('2')

    mocks.getOnNotification()?.(notification({ id: 'notif-2', type: 'HOT_LEAD' }))

    expect(await screen.findByText('3')).toBeInTheDocument()
  })

  it('opens the dropdown and lists notifications on click', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByLabelText('Notifications'))

    expect(await screen.findByText('Live call transfer: Asha Verma')).toBeInTheDocument()
    expect(mocks.listNotifications).toHaveBeenCalledWith({ limit: 20 })
  })

  it('marks a notification read and navigates to its lead when clicked', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByLabelText('Notifications'))
    await user.click(await screen.findByText('Live call transfer: Asha Verma'))

    expect(mocks.markNotificationRead).toHaveBeenCalledWith('notif-1')
    expect(await screen.findByText('Lead detail page')).toBeInTheDocument()
  })

  it('marks all notifications read', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByLabelText('Notifications'))
    await screen.findByText('Live call transfer: Asha Verma')
    await user.click(screen.getByText('Mark all read'))

    expect(mocks.markAllNotificationsRead).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Mark all read')).not.toBeInTheDocument())
  })
})
