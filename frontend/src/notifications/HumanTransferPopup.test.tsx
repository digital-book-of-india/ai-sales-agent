import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HumanTransferPopup } from './HumanTransferPopup'
import type { HumanTransferEvent } from './types'

const mocks = vi.hoisted(() => {
  let onTransfer: ((event: HumanTransferEvent) => void) | null = null
  return {
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    getOnTransfer: () => onTransfer,
    setOnTransfer: (next: typeof onTransfer) => {
      onTransfer = next
    },
    lastUserId: null as string | null,
  }
})

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'rep@example.com', role: 'SALES_EXECUTIVE' } }),
}))

vi.mock('./api', () => ({
  markNotificationRead: mocks.markNotificationRead,
}))

vi.mock('./socket', () => ({
  useHumanTransferSocket: (userId: string | null, onTransfer: (event: HumanTransferEvent) => void) => {
    mocks.lastUserId = userId
    mocks.setOnTransfer(onTransfer)
  },
}))

function emitTransfer(event: HumanTransferEvent) {
  act(() => {
    mocks.getOnTransfer()?.(event)
  })
}

function baseEvent(overrides: Partial<HumanTransferEvent> = {}): HumanTransferEvent {
  return {
    callId: 'call-1',
    leadId: 'lead-1',
    customerName: 'Asha Verma',
    companyName: 'Acme Co',
    requirement: 'CRM for 20 seats',
    budget: 500000,
    timeline: 'This quarter',
    aiSummary: '3 turns into the call. Customer last said: "Can I talk to a person?"',
    leadScore: 72,
    reasons: ['explicit_request'],
    reasonLabels: ['Customer asked for a human'],
    transcript: [{ speaker: 'customer', text: 'Can I talk to a person?', at: '2026-08-31T10:00:00.000Z' }],
    targetUserId: 'user-1',
    notificationId: 'notif-1',
    ...overrides,
  }
}

function renderPopup() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<HumanTransferPopup />} />
        <Route path="/leads/:id" element={<p>Lead detail page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HumanTransferPopup', () => {
  beforeEach(() => {
    mocks.markNotificationRead.mockClear()
    mocks.setOnTransfer(null)
    mocks.lastUserId = null
  })

  it('renders nothing until a transfer event arrives', () => {
    renderPopup()

    expect(mocks.lastUserId).toBe('user-1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the full handoff context when a transfer event arrives', () => {
    renderPopup()

    emitTransfer(baseEvent())

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Incoming transfer: Asha Verma')).toBeInTheDocument()
    expect(screen.getByText('Acme Co')).toBeInTheDocument()
    expect(screen.getByText('CRM for 20 seats')).toBeInTheDocument()
    expect(screen.getByText('₹5,00,000')).toBeInTheDocument()
    expect(screen.getByText('This quarter')).toBeInTheDocument()
    expect(screen.getByText('72 / 100')).toBeInTheDocument()
    expect(screen.getByText('Customer asked for a human')).toBeInTheDocument()
    expect(screen.getByText('Can I talk to a person?')).toBeInTheDocument()
  })

  it('dismisses and marks the notification read without navigating', async () => {
    const user = userEvent.setup()
    renderPopup()
    emitTransfer(baseEvent())

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(mocks.markNotificationRead).toHaveBeenCalledWith('notif-1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Lead detail page')).not.toBeInTheDocument()
  })

  it('navigates to the lead and marks read when "View lead" is clicked', async () => {
    const user = userEvent.setup()
    renderPopup()
    emitTransfer(baseEvent())

    await user.click(screen.getByRole('button', { name: 'View lead' }))

    expect(mocks.markNotificationRead).toHaveBeenCalledWith('notif-1')
    expect(await screen.findByText('Lead detail page')).toBeInTheDocument()
  })

  it('queues a second transfer event behind the first', async () => {
    const user = userEvent.setup()
    renderPopup()
    emitTransfer(baseEvent())
    emitTransfer(baseEvent({ customerName: 'Rahul Gupta', notificationId: 'notif-2' }))

    expect(screen.getByText('Incoming transfer: Asha Verma')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByText('Incoming transfer: Rahul Gupta')).toBeInTheDocument()
  })
})
