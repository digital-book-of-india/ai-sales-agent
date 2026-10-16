import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { CallDetailPage } from './CallDetailPage'

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

const managerUser = {
  id: 'mgr-1',
  email: 'mgr@example.com',
  role: 'SALES_MANAGER',
}

const callWithRecording = {
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
  lead: { id: 'lead-1', name: 'Priya Sharma', phone: '9990001111', companyName: null },
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

const transcript = {
  id: 'transcript-1',
  callId: 'call-1',
  finalizedAt: '2026-08-20T10:00:42.000Z',
  createdAt: '2026-08-20T10:00:00.000Z',
  messages: [
    {
      id: 'msg-1',
      speaker: 'AI',
      text: 'Hi, this is Riya calling from Acme.',
      timestamp: '2026-08-20T10:00:01.000Z',
      confidence: null,
    },
    {
      id: 'msg-2',
      speaker: 'CUSTOMER',
      text: 'Sure, tell me more.',
      timestamp: '2026-08-20T10:00:05.000Z',
      confidence: 0.91,
    },
  ],
}

const analysis = {
  id: 'analysis-1',
  callId: 'call-1',
  summary: 'Prospect is interested in a CRM upgrade.',
  requirement: 'CRM for a 20-person team',
  budget: 'around 5 lakh',
  timeline: 'next quarter',
  decisionMaker: 'YES',
  intent: 'HIGH',
  sentiment: 'POSITIVE',
  demoRequested: true,
  objections: [{ objection: 'Price', response: 'Offered a discount' }],
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
  coachingFeedback: 'Great discovery, could close sooner.',
  leadScore: 90,
  leadScoreCategory: 'HOT',
  createdAt: '2026-08-20T10:00:42.000Z',
}

function renderCallDetailPage() {
  return render(
    <MemoryRouter initialEntries={['/calls/call-1']}>
      <AuthProvider>
        <Routes>
          <Route path="/calls/:id" element={<CallDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('CallDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders call details and a recording player when a recording exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: executiveUser }),
          )
        }
        if (url.endsWith('/calling/calls/call-1')) {
          return Promise.resolve(jsonResponse(callWithRecording))
        }
        if (url.endsWith('/calling/recordings/by-call/call-1')) {
          return Promise.resolve(jsonResponse(recording))
        }
        if (url.endsWith('/calling/transcripts/by-call/call-1')) {
          return Promise.resolve(jsonResponse(transcript))
        }
        if (url.endsWith('/calling/analysis/by-call/call-1')) {
          return Promise.resolve(jsonResponse(analysis))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderCallDetailPage()

    expect(
      await screen.findByRole('heading', { name: 'Call with Priya Sharma' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Diwali Outreach · 9990001111')).toBeInTheDocument()
    expect(await screen.findByLabelText('Seek recording')).toBeInTheDocument()
    // A sales executive can play but not download.
    expect(
      screen.queryByRole('button', { name: /download/i }),
    ).not.toBeInTheDocument()
  })

  it('offers a download button to a sales manager', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: managerUser }),
          )
        }
        if (url.endsWith('/calling/calls/call-1')) {
          return Promise.resolve(jsonResponse(callWithRecording))
        }
        if (url.endsWith('/calling/recordings/by-call/call-1')) {
          return Promise.resolve(jsonResponse(recording))
        }
        if (url.endsWith('/calling/transcripts/by-call/call-1')) {
          return Promise.resolve(jsonResponse(transcript))
        }
        if (url.endsWith('/calling/analysis/by-call/call-1')) {
          return Promise.resolve(jsonResponse(analysis))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderCallDetailPage()

    expect(
      await screen.findByRole('button', { name: /download/i }),
    ).toBeInTheDocument()
  })

  it('shows a fallback message when the call has no recording', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: executiveUser }),
          )
        }
        if (url.endsWith('/calling/calls/call-1')) {
          return Promise.resolve(
            jsonResponse({ ...callWithRecording, recording: null }),
          )
        }
        if (url.endsWith('/calling/transcripts/by-call/call-1')) {
          return Promise.resolve(jsonResponse(null))
        }
        if (url.endsWith('/calling/analysis/by-call/call-1')) {
          return Promise.resolve(jsonResponse(null))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderCallDetailPage()

    expect(
      await screen.findByText('No recording for this call.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('No transcript for this call.'),
    ).toBeInTheDocument()
  })

  it('renders the historical transcript as speaker-labeled messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: executiveUser }),
          )
        }
        if (url.endsWith('/calling/calls/call-1')) {
          return Promise.resolve(jsonResponse(callWithRecording))
        }
        if (url.endsWith('/calling/recordings/by-call/call-1')) {
          return Promise.resolve(jsonResponse(recording))
        }
        if (url.endsWith('/calling/transcripts/by-call/call-1')) {
          return Promise.resolve(jsonResponse(transcript))
        }
        if (url.endsWith('/calling/analysis/by-call/call-1')) {
          return Promise.resolve(jsonResponse(analysis))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderCallDetailPage()

    expect(
      await screen.findByText('Hi, this is Riya calling from Acme.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sure, tell me more.')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
  })

  it('renders the AI Analysis panel with the quality score breakdown and coaching feedback', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: executiveUser }),
          )
        }
        if (url.endsWith('/calling/calls/call-1')) {
          return Promise.resolve(jsonResponse(callWithRecording))
        }
        if (url.endsWith('/calling/recordings/by-call/call-1')) {
          return Promise.resolve(jsonResponse(recording))
        }
        if (url.endsWith('/calling/transcripts/by-call/call-1')) {
          return Promise.resolve(jsonResponse(transcript))
        }
        if (url.endsWith('/calling/analysis/by-call/call-1')) {
          return Promise.resolve(jsonResponse(analysis))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderCallDetailPage()

    expect(
      await screen.findByText('Prospect is interested in a CRM upgrade.'),
    ).toBeInTheDocument()
    expect(screen.getByText('CRM for a 20-person team')).toBeInTheDocument()
    expect(screen.getByText('Send pricing sheet')).toBeInTheDocument()
    expect(screen.getByText('Demo requested')).toBeInTheDocument()
    expect(screen.getByText('80/100')).toBeInTheDocument()
    expect(
      screen.getByText('Great discovery, could close sooner.'),
    ).toBeInTheDocument()
  })

  it('shows a fallback message in the AI Analysis panel when there is no analysis yet', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: executiveUser }),
          )
        }
        if (url.endsWith('/calling/calls/call-1')) {
          return Promise.resolve(jsonResponse(callWithRecording))
        }
        if (url.endsWith('/calling/recordings/by-call/call-1')) {
          return Promise.resolve(jsonResponse(recording))
        }
        if (url.endsWith('/calling/transcripts/by-call/call-1')) {
          return Promise.resolve(jsonResponse(transcript))
        }
        if (url.endsWith('/calling/analysis/by-call/call-1')) {
          return Promise.resolve(jsonResponse(null))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderCallDetailPage()

    expect(
      await screen.findByText('No AI analysis available for this call yet.'),
    ).toBeInTheDocument()
  })
})
