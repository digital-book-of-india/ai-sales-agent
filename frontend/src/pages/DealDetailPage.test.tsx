import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { DealDetailPage } from './DealDetailPage'

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

const deal = {
  id: 'deal-1',
  leadId: 'lead-1',
  ownerId: 'exec-1',
  value: 50000,
  probability: 40,
  stageId: 'stage-new',
  expectedCloseDate: null,
  notes: 'Wants a discount',
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  lead: {
    id: 'lead-1',
    name: 'Priya Sharma',
    phone: '9990001111',
    companyName: 'Acme Co',
  },
  owner: { id: 'exec-1', name: 'Executive' },
  stage: { id: 'stage-new', name: 'NEW', order: 0 },
}

const stages = [
  { id: 'stage-new', name: 'NEW', order: 0 },
  { id: 'stage-won', name: 'WON', order: 7 },
]

function renderDealDetailPage() {
  return render(
    <MemoryRouter initialEntries={['/deals/deal-1']}>
      <AuthProvider>
        <Routes>
          <Route path="/pipeline" element={<p>Pipeline page</p>} />
          <Route path="/deals/:id" element={<DealDetailPage />} />
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
      if (url.endsWith('/pipeline-stages')) {
        return Promise.resolve(jsonResponse(stages))
      }
      if (url.endsWith('/users')) {
        return Promise.resolve(jsonResponse([]))
      }
      if (url.endsWith('/deals/deal-1')) {
        return Promise.resolve(jsonResponse(deal))
      }
      if (url.includes('/tasks?dealId=deal-1')) {
        return Promise.resolve(
          jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
        )
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('DealDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders deal details fetched from the API', async () => {
    mockFetchAs(managerUser)

    renderDealDetailPage()

    expect(
      await screen.findByRole('heading', { name: 'Priya Sharma' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Wants a discount')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('hides edit/delete controls for a sales executive', async () => {
    mockFetchAs(executiveUser)

    renderDealDetailPage()
    await screen.findByRole('heading', { name: 'Priya Sharma' })

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
  })

  it('moves the deal to a new stage via the stage select', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: managerUser }),
          )
        }
        if (url.endsWith('/pipeline-stages')) {
          return Promise.resolve(jsonResponse(stages))
        }
        if (url.endsWith('/users')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.endsWith('/deals/deal-1/stage')) {
          return Promise.resolve(
            jsonResponse({ ...deal, stageId: 'stage-won' }),
          )
        }
        if (url.endsWith('/deals/deal-1')) {
          return Promise.resolve(jsonResponse(deal))
        }
        if (url.includes('/tasks?dealId=deal-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        return Promise.reject(
          new Error(`Unexpected fetch to ${url} (${init?.method ?? 'GET'})`),
        )
      },
    )

    renderDealDetailPage()
    await screen.findByRole('heading', { name: 'Priya Sharma' })

    await user.selectOptions(screen.getByDisplayValue('NEW'), 'stage-won')

    await waitFor(() => {
      expect(screen.getByDisplayValue('WON')).toBeInTheDocument()
    })
  })
})
