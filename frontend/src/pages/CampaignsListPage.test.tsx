import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { CampaignsListPage } from './CampaignsListPage'

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

const executiveUser = {
  id: 'exec-1',
  email: 'exec@example.com',
  role: 'SALES_EXECUTIVE',
}

const campaignsPage = {
  data: [
    {
      id: 'campaign-1',
      name: 'Diwali Outreach',
      description: 'Reach out to warm leads before Diwali',
      objective: 'Book demos',
      aiAgentId: null,
      leadFilters: { statuses: ['NEW'] },
      callingHours: { start: '09:00', end: '18:00', days: ['MON', 'TUE'] },
      maxAttempts: 3,
      retryInterval: 60,
      concurrentCalls: 2,
      startDate: null,
      endDate: null,
      status: 'DRAFT',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      _count: { campaignLeads: 42 },
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}

function renderCampaignsListPage() {
  return render(
    <MemoryRouter initialEntries={['/campaigns']}>
      <AuthProvider>
        <Routes>
          <Route path="/campaigns" element={<CampaignsListPage />} />
          <Route path="/campaigns/:id" element={<p>Campaign detail page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockFetchAs(user: { id: string; email: string; role: string }) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ accessToken: 'token', user }))
      }
      if (url.includes('/campaigns')) {
        return Promise.resolve(jsonResponse(campaignsPage))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('CampaignsListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders campaigns returned by the API as cards', async () => {
    mockFetchAs(managerUser)

    renderCampaignsListPage()

    expect(await screen.findByText('Diwali Outreach')).toBeInTheDocument()
    expect(
      screen.getByText('Reach out to warm leads before Diwali'),
    ).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Diwali Outreach Draft/ }),
    ).toBeInTheDocument()
  })

  it('navigates to the detail page when a campaign card is clicked', async () => {
    const user = userEvent.setup()
    mockFetchAs(managerUser)

    renderCampaignsListPage()
    await screen.findByText('Diwali Outreach')

    await user.click(screen.getByText('Diwali Outreach'))

    expect(await screen.findByText('Campaign detail page')).toBeInTheDocument()
  })

  it('shows the "New campaign" action for a manager', async () => {
    mockFetchAs(managerUser)

    renderCampaignsListPage()
    await screen.findByText('Diwali Outreach')

    expect(
      screen.getByRole('button', { name: 'New campaign' }),
    ).toBeInTheDocument()
  })

  it('hides the "New campaign" action for a sales executive', async () => {
    mockFetchAs(executiveUser)

    renderCampaignsListPage()
    await screen.findByText('Diwali Outreach')

    expect(
      screen.queryByRole('button', { name: 'New campaign' }),
    ).not.toBeInTheDocument()
  })
})
