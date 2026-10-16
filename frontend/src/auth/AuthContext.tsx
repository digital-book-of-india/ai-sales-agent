import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch, refreshSession, setAccessToken } from '../lib/api'
import { toast } from '../lib/toast'
import type { AuthUser, LoginResponse } from './types'
import { AuthContext, type AuthContextValue } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')

  useEffect(() => {
    let cancelled = false
    void refreshSession().then((data) => {
      if (cancelled) return
      if (!data) {
        setStatus('unauthenticated')
        return
      }
      setUser(data.user)
      setStatus('authenticated')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthRetry: true,
    })
    setAccessToken(data.accessToken)
    setUser(data.user)
    setStatus('authenticated')
    toast.success(`Welcome back, ${data.user.email}`)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', skipAuthRetry: true })
    } catch {
      // ignore: we still clear local session state below
    } finally {
      setAccessToken(null)
      setUser(null)
      setStatus('unauthenticated')
    }
    toast.success('Logged out successfully')
  }, [])

  const value = useMemo(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
