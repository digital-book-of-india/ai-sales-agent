import { useEffect, useSyncExternalStore } from 'react'
import {
  getConfirmSnapshot,
  resolveConfirm,
  subscribeConfirm,
} from '../lib/confirm'

export function ConfirmHost() {
  const state = useSyncExternalStore(
    subscribeConfirm,
    getConfirmSnapshot,
    getConfirmSnapshot,
  )

  useEffect(() => {
    if (!state) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') resolveConfirm(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state])

  if (!state) return null

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4"
      onClick={() => resolveConfirm(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title ?? 'Confirm action'}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {state.title && (
          <h2 className="mb-2 text-base font-bold text-ink">{state.title}</h2>
        )}
        <p className="mb-5 text-sm text-muted">{state.message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => resolveConfirm(false)}
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus
            className={state.destructive ? 'btn-danger' : 'btn-primary'}
            onClick={() => resolveConfirm(true)}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
