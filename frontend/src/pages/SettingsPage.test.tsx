import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { SettingsPage } from './SettingsPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const adminUser = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }

const companyInfo = {
  name: 'Acme Corp',
  logoUrl: '',
  contactEmail: 'hello@acme.example',
  contactPhone: '',
  businessHours: { timezone: 'Asia/Kolkata', opensAt: '09:00', closesAt: '18:00', daysOpen: [1, 2, 3, 4, 5] },
}
const callingSettings = {
  provider: 'asterisk',
  callerId: '',
  recordingEnabled: true,
  callingHoursStart: '09:00',
  callingHoursEnd: '19:00',
  maxRetries: 3,
  retryIntervalMinutes: 60,
  concurrentCalls: 1,
}
const aiSettings = {
  defaultAgentId: null,
  defaultLanguage: 'en-IN',
  defaultVoice: 'meera',
  defaultResponseStyle: 'friendly',
}
const salesSettings = {
  followUpRules: { autoScheduleOnNoAnswer: true, defaultDueInHours: 24, maxAutoFollowUps: 3 },
}
const leadScoring = {
  weights: {
    requirementConfirmed: 25,
    budgetConfirmed: 20,
    timelineConfirmed: 20,
    decisionMaker: 15,
    positiveIntent: 10,
    demoRequested: 10,
  },
  thresholds: { hot: 90, warm: 70, cold: 40 },
}

function renderSettingsPage() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
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
      if (url.includes('/system-settings/company') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body)) as { value: typeof companyInfo }
        return Promise.resolve(jsonResponse({ key: 'company', value: body.value }))
      }
      if (url.includes('/system-settings/company')) {
        return Promise.resolve(jsonResponse({ key: 'company', value: companyInfo }))
      }
      if (url.includes('/system-settings/calling')) {
        return Promise.resolve(jsonResponse({ key: 'calling', value: callingSettings }))
      }
      if (url.includes('/system-settings/ai')) {
        return Promise.resolve(jsonResponse({ key: 'ai', value: aiSettings }))
      }
      if (url.includes('/system-settings/sales')) {
        return Promise.resolve(jsonResponse({ key: 'sales', value: salesSettings }))
      }
      if (url.includes('/system-settings/lead_scoring')) {
        return Promise.resolve(jsonResponse({ key: 'lead_scoring', value: leadScoring }))
      }
      if (url.includes('/ai-agents')) {
        return Promise.resolve(jsonResponse([]))
      }
      if (url.includes('/pipeline-stages')) {
        return Promise.resolve(jsonResponse([{ id: 'stage-1', name: 'New', order: 1 }]))
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url} (${method})`))
    },
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads and shows the company section by default', async () => {
    mockFetchAs()

    renderSettingsPage()

    expect(await screen.findByDisplayValue('Acme Corp')).toBeInTheDocument()
  })

  it('saves an edited company name', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderSettingsPage()
    await screen.findByDisplayValue('Acme Corp')

    const nameInput = screen.getByLabelText('Company name')
    await user.clear(nameInput)
    await user.type(nameInput, 'New Name Inc')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/system-settings/company'),
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
  })

  it('switches to the Sales tab and shows the pipeline stage list', async () => {
    const user = userEvent.setup()
    mockFetchAs()

    renderSettingsPage()
    await screen.findByDisplayValue('Acme Corp')

    await user.click(screen.getByRole('button', { name: 'Sales' }))

    expect(await screen.findByText('New')).toBeInTheDocument()
  })
})
