import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { MeetingsCalendarPage } from './MeetingsCalendarPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const executiveUser = {
  id: 'exec-1',
  email: 'exec@example.com',
  role: 'SALES_EXECUTIVE',
}

const today = new Date()
const todayIso = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
).toISOString()

const meeting = {
  id: 'mtg-1',
  leadId: 'lead-1',
  date: todayIso,
  time: '15:00',
  salespersonId: 'exec-1',
  meetingType: 'Demo',
  meetingLink: null,
  notes: null,
  status: 'SCHEDULED',
  createdAt: todayIso,
  updatedAt: todayIso,
  lead: {
    id: 'lead-1',
    name: 'Priya Sharma',
    phone: '9990001111',
    companyName: null,
  },
  salesperson: { id: 'exec-1', name: 'Executive' },
}

const paginated = {
  data: [meeting],
  total: 1,
  page: 1,
  limit: 200,
  totalPages: 1,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/meetings']}>
      <AuthProvider>
        <MeetingsCalendarPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ accessToken: 'token', user: executiveUser }),
        )
      }
      if (url.includes('/meetings')) {
        return Promise.resolve(jsonResponse(paginated))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('MeetingsCalendarPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a scheduled meeting on its day in the calendar view', async () => {
    mockFetch()

    renderPage()

    expect(
      await screen.findByRole('button', { name: /Priya Sharma/ }),
    ).toBeInTheDocument()
  })

  it('switches to list view and shows the meeting in a table with its status', async () => {
    const user = userEvent.setup()
    mockFetch()

    renderPage()
    await screen.findByRole('button', { name: /Priya Sharma/ })

    await user.click(screen.getByRole('button', { name: 'List' }))

    expect(await screen.findByRole('link', { name: 'Priya Sharma' })).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })

  it('opens the schedule-meeting modal from "New meeting"', async () => {
    const user = userEvent.setup()
    mockFetch()

    renderPage()
    await screen.findByRole('button', { name: /Priya Sharma/ })

    await user.click(screen.getByRole('button', { name: 'New meeting' }))

    expect(
      screen.getByRole('dialog', { name: 'Schedule meeting' }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search leads/)).toBeInTheDocument()
  })
})
