import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { KnowledgeBasePage } from './KnowledgeBasePage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
}

const agent = {
  id: 'agent-1',
  name: 'Riya',
  description: null,
  voice: null,
  language: null,
  personality: null,
  openingMessage: null,
  objective: null,
  workingHours: {},
  active: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const knowledgeBase = {
  id: 'kb-1',
  agentId: 'agent-1',
  companyInfo: { name: 'Acme Corp', about: 'We sell widgets.' },
  products: [{ name: 'Widget Pro', description: 'Our flagship widget' }],
  services: [],
  faqs: [
    {
      id: 'faq-1',
      knowledgeBaseId: 'kb-1',
      question: 'Do you offer EMI?',
      answer: 'Yes, up to 12 months.',
      category: 'pricing',
      priority: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  objections: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

function renderPage(initialEntry = '/knowledge-base') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockFetch({
  kbStatus = 200,
  playbookStatus = 404,
}: { kbStatus?: number; playbookStatus?: number } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ accessToken: 'token', user: adminUser }))
      }
      if (url.endsWith('/ai-agents')) {
        return Promise.resolve(jsonResponse([agent]))
      }
      if (url.includes('/knowledge-base')) {
        return Promise.resolve(
          kbStatus === 200
            ? jsonResponse(knowledgeBase)
            : jsonResponse({ message: 'Not found' }, kbStatus),
        )
      }
      if (url.includes('/playbook')) {
        return Promise.resolve(
          playbookStatus === 200
            ? jsonResponse({
                id: 'playbook-1',
                agentId: 'agent-1',
                opening: 'Hi there',
                discoveryQuestions: [],
                qualificationRules: {},
                objectionHandling: {},
                closingRules: {},
                questions: [],
                createdAt: '2026-08-01T00:00:00.000Z',
                updatedAt: '2026-08-01T00:00:00.000Z',
              })
            : jsonResponse({ message: 'Not found' }, playbookStatus),
        )
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`))
    },
  )
}

describe('KnowledgeBasePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the first agent and pre-fills the company info form', async () => {
    mockFetch()

    renderPage()

    expect(await screen.findByDisplayValue('Acme Corp')).toBeInTheDocument()
    expect(screen.getByDisplayValue('We sell widgets.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Widget Pro')).toBeInTheDocument()
  })

  it('shows FAQs loaded with the knowledge base under the FAQs tab', async () => {
    const user = userEvent.setup()
    mockFetch()

    renderPage()
    await screen.findByDisplayValue('Acme Corp')

    await user.click(screen.getByRole('button', { name: 'FAQs' }))

    expect(await screen.findByText('Do you offer EMI?')).toBeInTheDocument()
    expect(screen.getByText('Yes, up to 12 months.')).toBeInTheDocument()
  })

  it('prompts to save the knowledge base first when none exists yet', async () => {
    const user = userEvent.setup()
    mockFetch({ kbStatus: 404 })

    renderPage()

    // Tabs render once the agent is auto-selected, even without a knowledge base.
    expect(
      await screen.findByRole('button', { name: 'Company & catalog' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'FAQs' }))

    expect(
      await screen.findByText('Save the knowledge base first to start adding FAQs.'),
    ).toBeInTheDocument()
  })

  it('shows the playbook opening text when a playbook already exists', async () => {
    const user = userEvent.setup()
    mockFetch({ playbookStatus: 200 })

    renderPage()
    await screen.findByDisplayValue('Acme Corp')

    await user.click(screen.getByRole('button', { name: 'Sales playbook' }))

    expect(await screen.findByDisplayValue('Hi there')).toBeInTheDocument()
  })
})
