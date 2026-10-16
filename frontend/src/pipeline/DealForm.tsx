import { useState, type FormEvent } from 'react'
import { LeadPicker } from '../components/LeadPicker'
import type { LeadSummary } from '../leads/types'
import type { BasicUser } from '../users/api'
import { toast } from '../lib/toast'
import type { DealFormValues } from './types'

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

export function DealForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  requireLead = false,
  owners,
}: {
  initialValues: DealFormValues
  submitLabel: string
  onSubmit: (values: DealFormValues, lead: LeadSummary | null) => Promise<void>
  onCancel: () => void
  requireLead?: boolean
  /** Managers/admins only — lets them assign the deal to a specific rep. */
  owners?: BasicUser[]
}) {
  const [values, setValues] = useState(initialValues)
  const [lead, setLead] = useState<LeadSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof DealFormValues>(
    key: K,
    value: DealFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (requireLead && !lead) {
      setError('Choose a lead for this deal.')
      return
    }
    const value = Number(values.value)
    if (!values.value || Number.isNaN(value) || value < 0) {
      setError('Enter a valid deal value.')
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
        <Field label="Lead" htmlFor="deal-lead">
          <LeadPicker value={lead} onChange={setLead} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Value (₹)" htmlFor="deal-value">
          <input
            id="deal-value"
            type="number"
            min={0}
            className="input-field"
            value={values.value}
            onChange={(e) => set('value', e.target.value)}
          />
        </Field>
        <Field label="Probability (%)" htmlFor="deal-probability">
          <input
            id="deal-probability"
            type="number"
            min={0}
            max={100}
            className="input-field"
            value={values.probability}
            onChange={(e) => set('probability', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Expected close date (optional)" htmlFor="deal-close-date">
        <input
          id="deal-close-date"
          type="date"
          className="input-field"
          value={values.expectedCloseDate}
          onChange={(e) => set('expectedCloseDate', e.target.value)}
        />
      </Field>

      {owners && owners.length > 0 && (
        <Field label="Owner" htmlFor="deal-owner">
          <select
            id="deal-owner"
            className="input-field"
            value={values.ownerId}
            onChange={(e) => set('ownerId', e.target.value)}
          >
            <option value="">Myself</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Notes (optional)" htmlFor="deal-notes">
        <textarea
          id="deal-notes"
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
