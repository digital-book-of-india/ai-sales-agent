import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { FollowUpsListPage } from './FollowUpsListPage'

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

const followUp = {
  id: 'fu-1',
  leadId: 'lead-1',
  dueAt: '2026-08-28T10:00:00.000Z',
  reason: 'Wants to review pricing with her manager',
  status: 'PENDING',
  createdBy: 'mgr-1',
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z',
  lead: { id: 'lead-1', name: 'Priya Sharma', phone: '9990001111', companyName: null },
  creator: { id: 'mgr-1', name: 'Manager' },
}

const followUpsPage = {
  data: [followUp],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}

function renderFollowUpsListPage() {
  return render(
    <MemoryRouter initialEntries={['/follow-ups']}>
      <AuthProvider>
        <Routes>
          <Route path="/follow-ups" element={<FollowUpsListPage />} />
          <Route path="/leads/:id" element={<p>Lead detail page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockFetchAs() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ accessToken: 'token', user: managerUser }),
        )
      }
      if (url.includes('/follow-ups/fu-1/complete')) {
        return Promise.resolve(
          jsonResponse({ ...followUp, status: 'DONE' }),
        )
      }
      if (url.includes('/follow-ups?')) {
        return Promise.resolve(jsonResponse(followUpsPage))
      }
      return Promise.reject(
        new Error(`Unexpected fetch to ${url} (${init?.method ?? 'GET'})`),
      )
    },
  )
}

describe('FollowUpsListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders follow-ups returned by the API', async () => {
    mockFetchAs()

    renderFollowUpsListPage()

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument()
    expect(
      screen.getByText('Wants to review pricing with her manager'),
    ).toBeInTheDocument()
    expect(screen.getByText('Pending', { selector: 'span' })).toBeInTheDocument()
  })

  it('navigates to the lead detail page from a row', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderFollowUpsListPage()
    await screen.findByText('Priya Sharma')

    await user.click(screen.getByText('Priya Sharma'))

    expect(await screen.findByText('Lead detail page')).toBeInTheDocument()
  })

  it('marks a follow-up done via the Complete action', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderFollowUpsListPage()
    await screen.findByText('Priya Sharma')

    await user.click(screen.getByRole('button', { name: 'Complete' }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/follow-ups/fu-1/complete'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('switches to the calendar view', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderFollowUpsListPage()
    await screen.findByText('Priya Sharma')

    await user.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(
      await screen.findByRole('button', { name: 'Calendar' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '← Prev' })).toBeInTheDocument()
  })
})
