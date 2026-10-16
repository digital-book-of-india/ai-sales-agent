import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { DashboardPage } from './DashboardPage'

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

const statsResponse = {
  totalLeads: 120,
  newLeads: 8,
  callsToday: 0,
  connectedCalls: 0,
  failedCalls: 0,
  interestedLeads: 15,
  hotLeads: 6,
  warmLeads: 30,
  followUpsDue: 4,
  meetings: 0,
  openDeals: 10,
  wonDeals: 3,
  lostDeals: 1,
  revenue: 45000,
  conversionRate: 37.5,
  avgCallDuration: 0,
  aiCallSuccessRate: 0,
}

const chartsResponse = {
  leadFunnel: [
    { status: 'NEW', label: 'New', count: 40 },
    { status: 'CONTACTED', label: 'Contacted', count: 20 },
  ],
  statusDistribution: [
    { status: 'NEW', label: 'New', count: 40 },
    { status: 'WON', label: 'Won', count: 3 },
  ],
  campaignPerformance: [
    {
      campaignId: 'campaign-1',
      campaignName: 'Diwali Outreach',
      status: 'RUNNING',
      totalLeads: 12,
      connected: 0,
      interested: 0,
      converted: 0,
      conversionRate: 0,
    },
  ],
  callsOverTime: [{ date: '2026-08-20', calls: 0, connected: 0, failed: 0 }],
}

function renderDashboardPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockFetchAs() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ accessToken: 'token', user: managerUser }),
        )
      }
      if (url.includes('/dashboard/stats')) {
        return Promise.resolve(jsonResponse(statsResponse))
      }
      if (url.includes('/dashboard/charts')) {
        return Promise.resolve(jsonResponse(chartsResponse))
      }
      if (url.includes('/follow-ups/due')) {
        return Promise.resolve(jsonResponse([]))
      }
      if (url.includes('/tasks/mine')) {
        return Promise.resolve(jsonResponse([]))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads stats and charts for the default "today" range', async () => {
    mockFetchAs()

    renderDashboardPage()

    expect(await screen.findByText('Total leads')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('₹45,000')).toBeInTheDocument()
    expect(screen.getByText('37.5%')).toBeInTheDocument()

    await waitFor(() => {
      const calls = vi
        .mocked(globalThis.fetch)
        .mock.calls.map(([input]) => String(input))
      expect(calls.some((url) => url.includes('range=today'))).toBe(true)
    })
  })

  it('renders campaign performance rows from the charts response', async () => {
    mockFetchAs()

    renderDashboardPage()

    expect(await screen.findByText('Diwali Outreach')).toBeInTheDocument()
    const row = screen.getByText('Diwali Outreach').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('12')).toBeInTheDocument()
  })

  it('refetches with the new range when a date range button is clicked', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderDashboardPage()
    await screen.findByText('Total leads')

    await user.click(screen.getByRole('button', { name: 'This week' }))

    await waitFor(() => {
      const calls = vi
        .mocked(globalThis.fetch)
        .mock.calls.map(([input]) => String(input))
      expect(calls.some((url) => url.includes('range=week'))).toBe(true)
    })
  })

  it('waits for both custom dates before fetching', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderDashboardPage()
    await screen.findByText('Total leads')
    vi.mocked(globalThis.fetch).mockClear()

    await user.click(screen.getByRole('button', { name: 'Custom' }))

    expect(
      screen.getByText('Select a start and end date to load the custom range.'),
    ).toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
