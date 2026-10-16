import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { AiAgentsListPage } from './AiAgentsListPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
}

const executiveUser = {
  id: 'exec-1',
  email: 'exec@example.com',
  role: 'SALES_EXECUTIVE',
}

const agents = [
  {
    id: 'agent-1',
    name: 'Riya',
    description: 'Handles inbound demo requests',
    voice: 'Female, Hindi-English',
    language: 'English',
    personality: 'Warm and consultative',
    openingMessage: 'Hi, this is Riya from Acme.',
    objective: 'Book product demos',
    workingHours: { start: '09:00', end: '18:00', days: ['MON', 'TUE'] },
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ai-agents']}>
      <AuthProvider>
        <Routes>
          <Route path="/ai-agents" element={<AiAgentsListPage />} />
          <Route path="/knowledge-base" element={<p>Knowledge base page</p>} />
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
      if (url.includes('/ai-agents')) {
        return Promise.resolve(jsonResponse(agents))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('AiAgentsListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders agents returned by the API as cards', async () => {
    mockFetchAs(adminUser)

    renderPage()

    expect(await screen.findByText('Riya')).toBeInTheDocument()
    expect(screen.getByText('Handles inbound demo requests')).toBeInTheDocument()
    expect(screen.getByText('Female, Hindi-English')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows the "New agent" action for an admin', async () => {
    mockFetchAs(adminUser)

    renderPage()
    await screen.findByText('Riya')

    expect(screen.getByRole('button', { name: 'New agent' })).toBeInTheDocument()
  })

  it('hides management actions for a sales executive', async () => {
    mockFetchAs(executiveUser)

    renderPage()
    await screen.findByText('Riya')

    expect(screen.queryByRole('button', { name: 'New agent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('navigates to the knowledge base page when "Knowledge base" is clicked', async () => {
    const user = userEvent.setup()
    mockFetchAs(adminUser)

    renderPage()
    await screen.findByText('Riya')

    await user.click(screen.getByRole('button', { name: 'Knowledge base' }))

    expect(await screen.findByText('Knowledge base page')).toBeInTheDocument()
  })
})
