import { useSyncExternalStore } from 'react'
import {
  getToastSnapshot,
  subscribeToasts,
  toast,
  type ToastVariant,
} from '../lib/toast'

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: 'border-success/30 text-success',
  error: 'border-danger/30 text-danger',
  warning: 'border-warning/30 text-warning',
  info: 'border-brand/30 text-brand',
}

function VariantIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <path
        d="M4 10.5 8 14l8-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }
  if (variant === 'error') {
    return (
      <path
        d="M6 6l8 8M14 6l-8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    )
  }
  if (variant === 'warning') {
    return (
      <path
        d="M10 7v4.5M10 14.2h.01M9.05 3.6 2.4 15a1 1 0 0 0 .87 1.5h13.46a1 1 0 0 0 .87-1.5L10.95 3.6a1 1 0 0 0-1.9 0Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }
  return (
    <path
      d="M10 9v5M10 6.2h.01M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

export function Toaster() {
  const toasts = useSyncExternalStore(
    subscribeToasts,
    getToastSnapshot,
    getToastSnapshot,
  )

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-70 flex w-full max-w-sm flex-col gap-2.5"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={`toast-item pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-surface px-4 py-3 shadow-lg ${VARIANT_CLASS[t.variant]}`}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="mt-0.5 h-4.5 w-4.5 shrink-0"
          >
            <VariantIcon variant={t.variant} />
          </svg>
          <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
          <button
            type="button"
            className="cursor-pointer rounded-md p-0.5 text-muted transition-colors hover:text-ink"
            onClick={() => toast.dismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M5 5l10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
