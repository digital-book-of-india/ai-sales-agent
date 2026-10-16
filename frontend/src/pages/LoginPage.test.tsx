import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { LoginPage } from './LoginPage'

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('logs in with valid credentials and redirects to the dashboard', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(jsonResponse({ message: 'no session' }, 401))
        }
        if (url.endsWith('/auth/login')) {
          return Promise.resolve(
            jsonResponse({
              accessToken: 'access-token',
              user: { id: '1', email: 'admin@example.com', role: 'ADMIN' },
            }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderLoginPage()

    await user.type(await screen.findByLabelText(/email/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
  })

  it('shows an error message on invalid credentials', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(jsonResponse({ message: 'no session' }, 401))
        }
        if (url.endsWith('/auth/login')) {
          return Promise.resolve(
            jsonResponse({ message: 'Invalid email or password' }, 401),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch to ${url}`))
      },
    )

    renderLoginPage()

    await user.type(await screen.findByLabelText(/email/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid email or password',
      )
    })
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
  })
})
