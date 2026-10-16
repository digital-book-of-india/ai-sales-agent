import { useState, type FormEvent } from 'react'
import { LeadPicker } from '../components/LeadPicker'
import type { LeadSummary } from '../leads/types'
import type { BasicUser } from '../users/api'
import { toast } from '../lib/toast'
import { MEETING_TYPE_SUGGESTIONS, type MeetingFormValues } from './types'

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

export function MeetingForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  requireLead = false,
  salespeople,
}: {
  initialValues: MeetingFormValues
  submitLabel: string
  // Called with the chosen lead only when requireLead is true (the
  // Calendar page's "New meeting" flow, with no lead already in context).
  onSubmit: (
    values: MeetingFormValues,
    lead: LeadSummary | null,
  ) => Promise<void>
  onCancel: () => void
  /** Show the lead search combobox — used when this form isn't already
   * scoped to a lead (e.g. from a Lead Detail page). */
  requireLead?: boolean
  /** Managers/admins only — lets them assign the meeting to a specific rep
   * instead of themselves. */
  salespeople?: BasicUser[]
}) {
  const [values, setValues] = useState(initialValues)
  const [lead, setLead] = useState<LeadSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof MeetingFormValues>(
    key: K,
    value: MeetingFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (requireLead && !lead) {
      setError('Choose a lead for this meeting.')
      return
    }
    if (!values.date || !values.time || !values.meetingType.trim()) {
      setError('Date, time, and meeting type are required.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(values, lead)
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
      {requireLead && (
        <Field label="Lead" htmlFor="meeting-lead">
          <LeadPicker value={lead} onChange={setLead} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" htmlFor="meeting-date">
          <input
            id="meeting-date"
            type="date"
            className="input-field"
            value={values.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </Field>
        <Field label="Time" htmlFor="meeting-time">
          <input
            id="meeting-time"
            type="time"
            className="input-field"
            value={values.time}
            onChange={(e) => set('time', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Meeting type" htmlFor="meeting-type">
        <input
          id="meeting-type"
          type="text"
          list="meeting-type-suggestions"
          className="input-field"
          placeholder="Demo, Video Call, In Person…"
          value={values.meetingType}
          onChange={(e) => set('meetingType', e.target.value)}
        />
        <datalist id="meeting-type-suggestions">
          {MEETING_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>

      <Field label="Meeting link (optional)" htmlFor="meeting-link">
        <input
          id="meeting-link"
          type="text"
          className="input-field"
          placeholder="https://meet.example.com/…"
          value={values.meetingLink}
          onChange={(e) => set('meetingLink', e.target.value)}
        />
      </Field>

      {salespeople && salespeople.length > 0 && (
        <Field label="Assigned to" htmlFor="meeting-salesperson">
          <select
            id="meeting-salesperson"
            className="input-field"
            value={values.salespersonId}
            onChange={(e) => set('salespersonId', e.target.value)}
          >
            <option value="">Myself</option>
            {salespeople.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Notes (optional)" htmlFor="meeting-notes">
        <textarea
          id="meeting-notes"
          className="input-field min-h-20 resize-y"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
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
