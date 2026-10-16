import { useState, type FormEvent } from 'react'
import type { FollowUpFormValues } from './types'
import { toast } from '../lib/toast'

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  )
}

export function FollowUpForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValues: FollowUpFormValues
  submitLabel: string
  onSubmit: (values: FollowUpFormValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof FollowUpFormValues>(
    key: K,
    value: FollowUpFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.dueAt || !values.reason.trim()) {
      setError('Due date/time and reason are required.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(values)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
    >
      <Field label="Due date & time" htmlFor="follow-up-due-at">
        <input
          id="follow-up-due-at"
          type="datetime-local"
          className="input-field"
          value={values.dueAt}
          onChange={(e) => set('dueAt', e.target.value)}
        />
      </Field>

      <Field label="Reason" htmlFor="follow-up-reason">
        <textarea
          id="follow-up-reason"
          className="input-field min-h-20 resize-y"
          placeholder="What to follow up about…"
          value={values.reason}
          onChange={(e) => set('reason', e.target.value)}
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
