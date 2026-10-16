import type { LoginResponse } from '../auth/types'

export const API_URL = import.meta.env.VITE_API_URL

let accessToken: string | null = null
let refreshPromise: Promise<LoginResponse | null> | null = null

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token: string | null) {
  accessToken = token
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json()
    if (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
    ) {
      return (data as { message: string }).message
    }
  } catch {
    // response body wasn't JSON — fall through to the status text
  }
  return res.statusText || 'Request failed'
}

async function doRefresh(): Promise<LoginResponse | null> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = (await res.json()) as LoginResponse
      setAccessToken(data.accessToken)
      return data
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

interface ApiFetchOptions extends RequestInit {
  skipAuthRetry?: boolean
}

async function rawFetch(
  path: string,
  options: ApiFetchOptions,
): Promise<Response> {
  const { skipAuthRetry, ...init } = options

  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await doRefresh()
    if (refreshed) {
      return rawFetch(path, { ...options, skipAuthRetry: true })
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res))
  }

  return res
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const res = await rawFetch(path, options)

  if (res.status === 204) {
    return undefined as T
  }

  return (await res.json()) as T
}

export async function apiFetchBlob(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Blob> {
  const res = await rawFetch(path, options)
  return res.blob()
}

export { doRefresh as refreshSession }
