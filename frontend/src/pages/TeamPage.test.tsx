import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { TeamPage } from './TeamPage'

vi.mock('../lib/confirm', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const adminUser = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }

const execMember = {
  id: 'exec-1',
  name: 'Priya Sharma',
  email: 'priya@example.com',
  role: 'SALES_EXECUTIVE',
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  performance: { callsMade: 42, leadsConverted: 5, revenue: 250000 },
}

function renderTeamPage() {
  return render(
    <MemoryRouter initialEntries={['/team']}>
      <AuthProvider>
        <Routes>
          <Route path="/team" element={<TeamPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockFetchAs() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ accessToken: 'token', user: adminUser }))
      }
      if (url.includes('/team/exec-1/deactivate') && method === 'POST') {
        return Promise.resolve(jsonResponse({ ...execMember, isActive: false }))
      }
      if (url.includes('/team/invite') && method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            id: 'new-1',
            name: 'New Hire',
            email: 'new@example.com',
            role: 'SALES_EXECUTIVE',
            isActive: true,
            createdAt: '2026-09-01T00:00:00.000Z',
            performance: { callsMade: 0, leadsConverted: 0, revenue: 0 },
          }),
        )
      }
      if (url.includes('/team?')) {
        return Promise.resolve(jsonResponse([execMember]))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url} (${method})`))
    },
  )
}

describe('TeamPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders team members with their performance stats', async () => {
    mockFetchAs()

    renderTeamPage()

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('₹2,50,000')).toBeInTheDocument()
  })

  it('invites a new team member', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderTeamPage()
    await screen.findByText('Priya Sharma')

    await user.click(screen.getByRole('button', { name: 'Invite member' }))
    await user.type(screen.getByLabelText('Name'), 'New Hire')
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-strong-password')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/team/invite'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('deactivates a team member after confirming', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderTeamPage()
    await screen.findByText('Priya Sharma')

    await user.click(screen.getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/team/exec-1/deactivate'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
