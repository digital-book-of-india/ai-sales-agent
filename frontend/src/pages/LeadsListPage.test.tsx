import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { LeadsListPage } from './LeadsListPage'

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

const leadsPage = {
  data: [
    {
      id: 'lead-1',
      name: 'Priya Sharma',
      phone: '9990001111',
      email: 'priya@acme.com',
      companyName: 'Acme Corp',
      city: 'Pune',
      state: 'MH',
      status: 'NEW',
      priority: 'HIGH',
      leadScore: 60,
      tags: [],
      nextFollowUpAt: null,
      lastContactedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      assignedTo: {
        id: 'exec-1',
        name: 'Jane Exec',
        email: 'jane@example.com',
      },
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}

function renderLeadsListPage() {
  return render(
    <MemoryRouter initialEntries={['/leads']}>
      <AuthProvider>
        <Routes>
          <Route path="/leads" element={<LeadsListPage />} />
          <Route path="/leads/:id" element={<p>Lead detail page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LeadsListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders leads returned by the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: managerUser }),
          )
        }
        if (url.endsWith('/users')) {
          return Promise.resolve(
            jsonResponse([
              {
                id: 'exec-1',
                name: 'Jane Exec',
                email: 'jane@example.com',
                role: 'SALES_EXECUTIVE',
              },
            ]),
          )
        }
        if (url.includes('/leads')) {
          return Promise.resolve(jsonResponse(leadsPage))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderLeadsListPage()

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('Jane Exec')).toBeInTheDocument()
  })

  it('shows Export CSV and Import CSV actions for a manager and opens the import modal', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: managerUser }),
          )
        }
        if (url.endsWith('/users')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.includes('/leads')) {
          return Promise.resolve(jsonResponse(leadsPage))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderLeadsListPage()
    await screen.findByText('Priya Sharma')

    expect(
      screen.getByRole('button', { name: 'Export CSV' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import CSV' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Import leads: upload file',
      }),
    ).toBeInTheDocument()
  })

  it('re-fetches leads with the search term after typing', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: managerUser }),
          )
        }
        if (url.endsWith('/users')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.includes('/leads')) {
          return Promise.resolve(jsonResponse(leadsPage))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      })

    renderLeadsListPage()
    await screen.findByText('Priya Sharma')

    await user.type(screen.getByLabelText(/search/i), 'acme')

    await waitFor(
      () => {
        const calledWithSearch = fetchMock.mock.calls.some(([reqInput]) =>
          String(reqInput).includes('search=acme'),
        )
        expect(calledWithSearch).toBe(true)
      },
      { timeout: 2000 },
    )
  })
})
