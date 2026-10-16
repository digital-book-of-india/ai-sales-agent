import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') {
    const state = location.state as { from?: { pathname?: string } } | null
    const from = state?.from?.pathname ?? '/dashboard'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to log in'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-[radial-gradient(1200px_600px_at_15%_-10%,var(--brand-soft),transparent_60%)] bg-bg p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-9 py-9 shadow-lg">
        <div className="mb-8 flex items-center gap-2.5">
          <span
            className="flex h-8.5 w-8.5 items-center justify-center rounded-[9px] bg-linear-to-br from-brand to-[#8b7ffb] text-sm font-extrabold text-white"
            aria-hidden="true"
          >
            S
          </span>
          <span className="text-sm font-bold text-ink">Sales ERP</span>
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Sign in to your account to continue.
          </p>
        </div>

        <form
          className="flex flex-col gap-4.5"
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold text-ink">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-sm font-semibold text-ink"
              >
                Password
              </label>
              <button
                type="button"
                className="cursor-not-allowed border-none bg-transparent p-0 text-xs text-faint"
                disabled
                title="Coming soon"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary mt-1 w-full"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
