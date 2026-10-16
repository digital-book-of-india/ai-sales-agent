import { useEffect, useState } from 'react'
import { API_URL } from '../lib/api'

type HealthResponse = {
  status: string
  database: string
  timestamp: string
}

type HealthState =
  | { phase: 'loading' }
  | { phase: 'reached'; data: HealthResponse }
  | { phase: 'unreachable'; message: string }

export function HealthStatus() {
  const [health, setHealth] = useState<HealthState>({ phase: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json()) as HealthResponse
        setHealth({ phase: 'reached', data })
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setHealth({
          phase: 'unreachable',
          message: err instanceof Error ? err.message : 'Unknown error',
        })
      })

    return () => controller.abort()
  }, [])

  const isUp = health.phase === 'reached' && health.data.database === 'up'
  const badgeClass =
    health.phase === 'loading'
      ? 'badge badge-muted'
      : isUp
        ? 'badge badge-success'
        : 'badge badge-danger'
  const badgeLabel =
    health.phase === 'loading'
      ? 'Checking…'
      : isUp
        ? 'Operational'
        : 'Unreachable'

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">System status</h2>
        <span className={badgeClass}>{badgeLabel}</span>
      </div>

      {health.phase === 'loading' && (
        <p className="text-sm text-muted">Checking backend connectivity…</p>
      )}

      {health.phase === 'reached' && (
        <dl>
          <div className="flex justify-between border-b border-border py-2 text-sm last:border-b-0 last:pb-0">
            <dt className="text-muted">API</dt>
            <dd className="font-medium text-ink">{health.data.status}</dd>
          </div>
          <div className="flex justify-between border-b border-border py-2 text-sm last:border-b-0 last:pb-0">
            <dt className="text-muted">Database</dt>
            <dd className="font-medium text-ink">{health.data.database}</dd>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-muted">Checked at</dt>
            <dd className="font-medium text-ink">
              {new Date(health.data.timestamp).toLocaleTimeString()}
            </dd>
          </div>
        </dl>
      )}

      {health.phase === 'unreachable' && (
        <div className="flex flex-col gap-1.5 text-sm text-muted">
          <p>Could not reach the backend at {API_URL}</p>
          <p>{health.message}</p>
        </div>
      )}
    </div>
  )
}
