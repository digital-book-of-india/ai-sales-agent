import { useState, type FormEvent } from 'react'
import {
  WORKING_HOURS_DAYS,
  type AgentFormValues,
  type WorkingHoursDay,
} from './types'
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

export function AgentForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValues: AgentFormValues
  submitLabel: string
  onSubmit: (values: AgentFormValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function toggleDay(day: WorkingHoursDay) {
    setValues((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.name.trim()) {
      setError('Name is required.')
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
      className="flex flex-col gap-5"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="agent-name">
          <input
            id="agent-name"
            className="input-field"
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Voice" htmlFor="agent-voice">
          <input
            id="agent-voice"
            className="input-field"
            placeholder="e.g. Riya (female, Hindi-English)"
            value={values.voice}
            onChange={(e) => set('voice', e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Language" htmlFor="agent-language">
          <input
            id="agent-language"
            className="input-field"
            placeholder="e.g. English, Hindi"
            value={values.language}
            onChange={(e) => set('language', e.target.value)}
          />
        </Field>
        <Field label="Objective" htmlFor="agent-objective">
          <input
            id="agent-objective"
            className="input-field"
            placeholder="e.g. Book product demos"
            value={values.objective}
            onChange={(e) => set('objective', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="agent-description">
        <textarea
          id="agent-description"
          className="input-field min-h-16 resize-y"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <Field label="Personality" htmlFor="agent-personality">
        <textarea
          id="agent-personality"
          className="input-field min-h-16 resize-y"
          placeholder="e.g. Warm, consultative, patient with objections"
          value={values.personality}
          onChange={(e) => set('personality', e.target.value)}
        />
      </Field>

      <Field label="Opening message" htmlFor="agent-opening-message">
        <textarea
          id="agent-opening-message"
          className="input-field min-h-16 resize-y"
          placeholder="What the agent says when the call connects"
          value={values.openingMessage}
          onChange={(e) => set('openingMessage', e.target.value)}
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink">
          Working hours
        </span>
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" htmlFor="agent-working-start">
              <input
                id="agent-working-start"
                type="time"
                className="input-field"
                value={values.workingStart}
                onChange={(e) => set('workingStart', e.target.value)}
              />
            </Field>
            <Field label="End time" htmlFor="agent-working-end">
              <input
                id="agent-working-end"
                type="time"
                className="input-field"
                value={values.workingEnd}
                onChange={(e) => set('workingEnd', e.target.value)}
              />
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-muted">
              Days
            </span>
            <div className="flex flex-wrap gap-1.5">
              {WORKING_HOURS_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={
                    values.workingDays.includes(day)
                      ? 'badge badge-success cursor-pointer'
                      : 'badge badge-muted cursor-pointer'
                  }
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2.5 rounded-lg border border-border p-3.5 text-sm">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(e) => set('active', e.target.checked)}
        />
        <span className="font-semibold text-ink">Active</span>
      </label>

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
