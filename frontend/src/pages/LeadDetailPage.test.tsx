import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { LeadDetailPage } from './LeadDetailPage'

// LeadDetailPage subscribes to lead.updated/lead.score.updated over the
// /calling websocket (see useLeadEventsSocket) — mocked the same way
// LiveCallsPage.test.tsx mocks it, so tests don't open a real socket.
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const execUser = {
  id: 'exec-1',
  email: 'exec@example.com',
  role: 'SALES_EXECUTIVE',
}

const lead = {
  id: 'lead-1',
  name: 'Priya Sharma',
  phone: '9990001111',
  alternatePhone: null,
  email: 'priya@acme.com',
  companyName: 'Acme Corp',
  designation: null,
  industry: null,
  city: 'Pune',
  state: 'MH',
  source: null,
  status: 'NEW',
  priority: 'HIGH',
  leadScore: 60,
  tags: ['vip'],
  requirement: null,
  budget: null,
  timeline: null,
  nextFollowUpAt: null,
  lastContactedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  assignedTo: { id: 'exec-1', name: 'Jane Exec', email: 'jane@example.com' },
  notes: [],
}

function renderLeadDetailPage() {
  return render(
    <MemoryRouter initialEntries={['/leads/lead-1']}>
      <AuthProvider>
        <Routes>
          <Route path="/leads" element={<p>Leads list page</p>} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LeadDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders lead details fetched from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: execUser }),
          )
        }
        if (url.endsWith('/leads/lead-1')) {
          return Promise.resolve(jsonResponse(lead))
        }
        if (url.includes('/calling/calls?leadId=lead-1')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.endsWith('/calling/analysis/latest-for-lead/lead-1')) {
          return Promise.resolve(jsonResponse(null))
        }
        if (url.endsWith('/leads/lead-1/activity')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.includes('/follow-ups?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        if (url.includes('/tasks?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderLeadDetailPage()

    expect(
      await screen.findByRole('heading', { name: 'Priya Sharma' }),
    ).toBeInTheDocument()
    expect(screen.getByText('vip')).toBeInTheDocument()
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
    expect(
      await screen.findByText('No AI-analyzed call for this lead yet.'),
    ).toBeInTheDocument()
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument()
  })

  it('adds a note and displays it', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: execUser }),
          )
        }
        if (url.endsWith('/leads/lead-1/notes')) {
          return Promise.resolve(
            jsonResponse({
              ...lead,
              notes: [
                {
                  id: 'note-1',
                  body: 'Called, will follow up next week',
                  createdAt: '2026-08-02T00:00:00.000Z',
                  author: { id: 'exec-1', name: 'Jane Exec' },
                },
              ],
            }),
          )
        }
        if (url.endsWith('/leads/lead-1')) {
          return Promise.resolve(jsonResponse(lead))
        }
        if (url.includes('/calling/calls?leadId=lead-1')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.endsWith('/calling/analysis/latest-for-lead/lead-1')) {
          return Promise.resolve(jsonResponse(null))
        }
        if (url.endsWith('/leads/lead-1/activity')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.includes('/follow-ups?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        if (url.includes('/tasks?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        return Promise.reject(
          new Error(`Unexpected fetch to ${url} (${init?.method ?? 'GET'})`),
        )
      },
    )

    renderLeadDetailPage()
    await screen.findByRole('heading', { name: 'Priya Sharma' })

    await user.type(
      screen.getByLabelText(/new note/i),
      'Called, will follow up next week',
    )
    await user.click(screen.getByRole('button', { name: /add note/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Called, will follow up next week'),
      ).toBeInTheDocument()
    })
  })

  it('shows past calls and plays a completed call recording inline', async () => {
    const user = userEvent.setup()
    const call = {
      id: 'call-1',
      status: 'COMPLETED',
      provider: 'mock',
      duration: 42,
      startedAt: '2026-08-20T10:00:00.000Z',
      endedAt: '2026-08-20T10:00:42.000Z',
      createdAt: '2026-08-20T10:00:00.000Z',
      campaign: { id: 'campaign-1', name: 'Diwali Outreach' },
      queueItem: { attempts: 1, maxAttempts: 3 },
      recording: { id: 'rec-1', retentionStatus: 'ACTIVE' },
    }
    const recording = {
      id: 'rec-1',
      callId: 'call-1',
      duration: 42,
      startedAt: '2026-08-20T10:00:00.000Z',
      endedAt: '2026-08-20T10:00:42.000Z',
      retentionStatus: 'ACTIVE',
      createdAt: '2026-08-20T10:00:42.000Z',
      playUrl: '/calling/recordings/rec-1/stream?exp=1&disp=inline&sig=abc',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: execUser }),
          )
        }
        if (url.endsWith('/leads/lead-1')) {
          return Promise.resolve(jsonResponse(lead))
        }
        if (url.includes('/calling/calls?leadId=lead-1')) {
          return Promise.resolve(jsonResponse([call]))
        }
        if (url.endsWith('/calling/recordings/by-call/call-1')) {
          return Promise.resolve(jsonResponse(recording))
        }
        if (url.endsWith('/calling/analysis/latest-for-lead/lead-1')) {
          return Promise.resolve(jsonResponse(null))
        }
        if (url.endsWith('/leads/lead-1/activity')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.includes('/follow-ups?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        if (url.includes('/tasks?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderLeadDetailPage()
    await screen.findByRole('heading', { name: 'Priya Sharma' })

    expect(await screen.findByText(/Diwali Outreach/)).toBeInTheDocument()
    const playButton = screen.getByRole('button', { name: /play recording/i })
    await user.click(playButton)

    expect(
      await screen.findByLabelText('Seek recording'),
    ).toBeInTheDocument()
  })

  it('shows the AI Analysis panel and activity timeline once populated', async () => {
    const analysis = {
      id: 'analysis-1',
      callId: 'call-1',
      summary: 'Prospect wants a CRM upgrade.',
      requirement: 'CRM for 20 people',
      budget: 'around 5 lakh',
      timeline: 'next quarter',
      decisionMaker: 'YES',
      intent: 'HIGH',
      sentiment: 'POSITIVE',
      demoRequested: true,
      objections: [],
      nextAction: 'Send pricing sheet',
      qualityScore: {
        opening: 80,
        discovery: 80,
        productKnowledge: 80,
        objectionHandling: 80,
        closing: 80,
        naturalness: 80,
        total: 80,
      },
      coachingFeedback: 'Well handled.',
      leadScore: 100,
      leadScoreCategory: 'HOT',
      createdAt: '2026-08-20T10:00:42.000Z',
    }
    const activity = [
      {
        id: 'activity-1',
        type: 'CALL_COMPLETED',
        payload: { summary: 'Prospect wants a CRM upgrade.' },
        createdAt: '2026-08-20T10:00:42.000Z',
        actorUser: null,
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: execUser }),
          )
        }
        if (url.endsWith('/leads/lead-1')) {
          return Promise.resolve(jsonResponse(lead))
        }
        if (url.includes('/calling/calls?leadId=lead-1')) {
          return Promise.resolve(jsonResponse([]))
        }
        if (url.endsWith('/calling/analysis/latest-for-lead/lead-1')) {
          return Promise.resolve(jsonResponse(analysis))
        }
        if (url.endsWith('/leads/lead-1/activity')) {
          return Promise.resolve(jsonResponse(activity))
        }
        if (url.includes('/follow-ups?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        if (url.includes('/tasks?leadId=lead-1')) {
          return Promise.resolve(
            jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderLeadDetailPage()
    await screen.findByRole('heading', { name: 'Priya Sharma' })

    // The same summary appears both in the AnalysisPanel and the activity
    // timeline entry (see Activity.payload.summary) — two matches is correct.
    expect(
      await screen.findAllByText('Prospect wants a CRM upgrade.'),
    ).toHaveLength(2)
    expect(screen.getByText('CRM for 20 people')).toBeInTheDocument()
    expect(screen.getByText('CALL COMPLETED')).toBeInTheDocument()
    // Badge category is derived from the lead's own score (60 -> COLD),
    // independent of the analysis row's own leadScoreCategory (HOT). Shown
    // twice: once in the header, once in the Profile detail row.
    expect(screen.getAllByText('COLD · 60')).toHaveLength(2)
  })
})
