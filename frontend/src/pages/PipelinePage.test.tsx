import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { PipelinePage } from './PipelinePage'

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

const board = [
  {
    id: 'stage-new',
    name: 'NEW',
    order: 0,
    deals: [
      {
        id: 'deal-1',
        leadId: 'lead-1',
        ownerId: 'exec-1',
        value: 50000,
        probability: 40,
        stageId: 'stage-new',
        expectedCloseDate: null,
        notes: null,
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
      },
    ],
  },
  {
    id: 'stage-won',
    name: 'WON',
    order: 7,
    deals: [],
  },
]

function renderPipelinePage() {
  return render(
    <MemoryRouter initialEntries={['/pipeline']}>
      <AuthProvider>
        <Routes>
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/deals/:id" element={<p>Deal detail page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('PipelinePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders each stage as a column with its deals', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            jsonResponse({ accessToken: 'token', user: executiveUser }),
          )
        }
        if (url.endsWith('/deals/board')) {
          return Promise.resolve(jsonResponse(board))
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderPipelinePage()

    expect(await screen.findByText('NEW')).toBeInTheDocument()
    expect(screen.getByText('WON')).toBeInTheDocument()
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('Acme Co')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('No deals')).toBeInTheDocument()
  })
})
