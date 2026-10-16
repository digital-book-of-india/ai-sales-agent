import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { AnalyticsPage } from './AnalyticsPage'

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

const callAnalyticsResponse = {
  totalCalls: 50,
  connectedCalls: 35,
  failedCalls: 15,
  answerRate: 70,
  avgDuration: 125,
  retryRate: 12.5,
  trend: [{ date: '2026-08-20', totalCalls: 5, connectedCalls: 3, failedCalls: 2 }],
}

const leadAnalyticsResponse = {
  newLeads: 40,
  contactedLeads: 20,
  interestedLeads: 15,
  qualifiedLeads: 6,
  hotLeads: 6,
  funnel: [
    { status: 'NEW', label: 'New', count: 40 },
    { status: 'WON', label: 'Won', count: 3 },
  ],
}

const salesAnalyticsResponse = {
  pipelineByStage: [
    { stageId: 'stage-1', stageName: 'New', order: 0, value: 50000, dealCount: 3 },
  ],
  totalPipelineValue: 50000,
  wonDeals: 3,
  lostDeals: 1,
  revenue: 45000,
  conversionRate: 37.5,
  revenueOverTime: [{ date: '2026-08-20', revenue: 45000 }],
}

const aiAnalyticsResponse = {
  aiCalls: 30,
  successfulCalls: 22,
  humanTransfers: 4,
  failedAiCalls: 4,
  avgQualityScore: 82.5,
  topObjections: [{ objection: 'Price too high', count: 7 }],
  topCustomerQuestions: [{ question: 'Contract length', count: 5 }],
}

function renderAnalyticsPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AnalyticsPage />
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
      if (url.includes('/analytics/calls')) {
        return Promise.resolve(jsonResponse(callAnalyticsResponse))
      }
      if (url.includes('/analytics/leads')) {
        return Promise.resolve(jsonResponse(leadAnalyticsResponse))
      }
      if (url.includes('/analytics/sales')) {
        return Promise.resolve(jsonResponse(salesAnalyticsResponse))
      }
      if (url.includes('/analytics/ai')) {
        return Promise.resolve(jsonResponse(aiAnalyticsResponse))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads Call Analytics by default for the "today" range', async () => {
    mockFetchAs()

    renderAnalyticsPage()

    expect(await screen.findByText('Total calls')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()

    await waitFor(() => {
      const calls = vi
        .mocked(globalThis.fetch)
        .mock.calls.map(([input]) => String(input))
      expect(calls.some((url) => url.includes('/analytics/calls?range=today'))).toBe(
        true,
      )
    })
  })

  it('switches to Lead Analytics and fetches its own data on tab click', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderAnalyticsPage()
    await screen.findByText('Total calls')

    await user.click(screen.getByRole('tab', { name: 'Lead Analytics' }))

    expect(await screen.findByText('New leads')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()

    await waitFor(() => {
      const calls = vi
        .mocked(globalThis.fetch)
        .mock.calls.map(([input]) => String(input))
      expect(calls.some((url) => url.includes('/analytics/leads?range=today'))).toBe(
        true,
      )
    })
  })

  it('renders Sales Analytics figures', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderAnalyticsPage()
    await screen.findByText('Total calls')

    await user.click(screen.getByRole('tab', { name: 'Sales Analytics' }))

    expect(await screen.findByText('Open pipeline value')).toBeInTheDocument()
    expect(screen.getByText('₹45,000')).toBeInTheDocument()
    expect(screen.getByText('37.5%')).toBeInTheDocument()
  })

  it('renders AI Analytics figures and the objection/question chart sections', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderAnalyticsPage()
    await screen.findByText('Total calls')

    await user.click(screen.getByRole('tab', { name: 'AI Analytics' }))

    expect(await screen.findByText('AI calls')).toBeInTheDocument()
    expect(screen.getByText('Human transfers')).toBeInTheDocument()
    expect(screen.getByText('Most common objections')).toBeInTheDocument()
    expect(screen.getByText('Most common customer questions')).toBeInTheDocument()
  })

  it('refetches the active tab with the new range when a date range button is clicked', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderAnalyticsPage()
    await screen.findByText('Total calls')

    await user.click(screen.getByRole('button', { name: 'This week' }))

    await waitFor(() => {
      const calls = vi
        .mocked(globalThis.fetch)
        .mock.calls.map(([input]) => String(input))
      expect(calls.some((url) => url.includes('/analytics/calls?range=week'))).toBe(
        true,
      )
    })
  })

  it('waits for both custom dates before fetching', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderAnalyticsPage()
    await screen.findByText('Total calls')
    vi.mocked(globalThis.fetch).mockClear()

    await user.click(screen.getByRole('button', { name: 'Custom' }))

    expect(
      screen.getByText('Select a start and end date to load the custom range.'),
    ).toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
