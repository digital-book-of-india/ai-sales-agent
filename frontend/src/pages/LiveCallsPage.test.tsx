import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { LiveCallsPage } from './LiveCallsPage'

const socketHandlers = new Map<string, (payload: unknown) => void>()

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: (event: string, handler: (payload: unknown) => void) => {
      socketHandlers.set(event, handler)
    },
    off: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const managerUser = {
  id: 'mgr-1',
  email: 'mgr@example.com',
  role: 'SALES_MANAGER',
}

const liveCallsResponse = [
  {
    id: 'queue-1',
    leadId: 'lead-1',
    campaignId: 'campaign-1',
    priority: 0,
    status: 'RINGING',
    attempts: 1,
    maxAttempts: 3,
    scheduledAt: '2026-08-21T00:00:00.000Z',
    nextRetryAt: null,
    lastAttemptAt: '2026-08-21T00:00:00.000Z',
    callId: 'call-1',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    lead: {
      id: 'lead-1',
      name: 'Asha Verma',
      phone: '9998887777',
      companyName: null,
    },
    campaign: { id: 'campaign-1', name: 'Diwali Outreach' },
  },
]

const emptyQueueResponse = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1,
}

function mockFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ accessToken: 'token', user: managerUser }),
        )
      }
      if (url.endsWith('/calling/live')) {
        return Promise.resolve(jsonResponse(liveCallsResponse))
      }
      if (url.includes('/calling/queue')) {
        return Promise.resolve(jsonResponse(emptyQueueResponse))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

function renderLiveCallsPage() {
  return render(
    <MemoryRouter initialEntries={['/calls']}>
      <AuthProvider>
        <Routes>
          <Route path="/calls" element={<LiveCallsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LiveCallsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    socketHandlers.clear()
  })

  it('renders calls currently in progress from the API', async () => {
    mockFetch()

    renderLiveCallsPage()

    expect(await screen.findByText('Asha Verma')).toBeInTheDocument()
    expect(screen.getByText('9998887777')).toBeInTheDocument()
    expect(screen.getByText('Diwali Outreach')).toBeInTheDocument()
  })

  it('moves a call from in-progress to recent activity when call.ended fires', async () => {
    mockFetch()

    renderLiveCallsPage()
    await screen.findByText('Asha Verma')

    socketHandlers.get('call.ended')?.({
      queueItemId: 'queue-1',
      leadId: 'lead-1',
      leadName: 'Asha Verma',
      campaignId: 'campaign-1',
      campaignName: 'Diwali Outreach',
      status: 'COMPLETED',
      attempts: 1,
      callId: 'call-1',
      outcome: 'CONNECTED',
    })

    await waitFor(() => {
      expect(
        screen.getByText('No calls in progress right now.'),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Recent activity')).toBeInTheDocument()
  })

  it('shows a live connection indicator once the socket connects', async () => {
    mockFetch()

    renderLiveCallsPage()
    await screen.findByText('Asha Verma')

    expect(screen.getByText('Connecting…')).toBeInTheDocument()

    socketHandlers.get('connect')?.(undefined)

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument()
    })
  })
})
