import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { CampaignDetailPage } from './CampaignDetailPage'

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

const draftCampaign = {
  id: 'campaign-1',
  name: 'Diwali Outreach',
  description: 'Reach out to warm leads before Diwali',
  objective: 'Book demos',
  aiAgentId: null,
  leadFilters: { statuses: ['NEW'] },
  callingHours: { start: '09:00', end: '18:00', days: ['MON'] },
  maxAttempts: 3,
  retryInterval: 60,
  concurrentCalls: 2,
  startDate: null,
  endDate: null,
  status: 'DRAFT',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const stats = {
  leads: 42,
  attempted: 0,
  connected: 0,
  noAnswer: 0,
  busy: 0,
  failed: 0,
  interested: 0,
  hotLeads: 0,
  meetings: 0,
  conversion: 0,
  avgCallDuration: 0,
}

function renderCampaignDetailPage() {
  return render(
    <MemoryRouter initialEntries={['/campaigns/campaign-1']}>
      <AuthProvider>
        <Routes>
          <Route path="/campaigns" element={<p>Campaigns list page</p>} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
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
      if (url.endsWith('/campaigns/campaign-1/stats')) {
        return Promise.resolve(jsonResponse(stats))
      }
      if (url.endsWith('/campaigns/campaign-1')) {
        return Promise.resolve(jsonResponse(draftCampaign))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('CampaignDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders campaign details and stats fetched from the API', async () => {
    mockFetchAs(managerUser)

    renderCampaignDetailPage()

    expect(
      await screen.findByRole('heading', { name: 'Diwali Outreach' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('starts a draft campaign and reflects the RUNNING status', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: managerUser }),
          )
        }
        if (url.endsWith('/campaigns/campaign-1/stats')) {
          return Promise.resolve(jsonResponse(stats))
        }
        if (url.endsWith('/campaigns/campaign-1/start')) {
          return Promise.resolve(
            jsonResponse({ ...draftCampaign, status: 'RUNNING' }),
          )
        }
        if (url.endsWith('/campaigns/campaign-1')) {
          return Promise.resolve(jsonResponse(draftCampaign))
        }
        return Promise.reject(
          new Error(`Unexpected fetch to ${url} (${init?.method ?? 'GET'})`),
        )
      },
    )

    renderCampaignDetailPage()
    await screen.findByRole('heading', { name: 'Diwali Outreach' })

    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('hides lifecycle and edit controls for a sales executive', async () => {
    mockFetchAs(executiveUser)

    renderCampaignDetailPage()
    await screen.findByRole('heading', { name: 'Diwali Outreach' })

    expect(
      screen.queryByRole('button', { name: 'Start' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Duplicate' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
  })
})
