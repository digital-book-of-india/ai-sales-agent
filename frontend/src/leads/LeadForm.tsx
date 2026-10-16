import { useState, type FormEvent } from 'react'
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type LeadFormValues,
} from './types'
import type { BasicUser } from '../users/api'
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

export function LeadForm({
  initialValues,
  owners,
  canAssign,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValues: LeadFormValues
  owners: BasicUser[]
  canAssign: boolean
  submitLabel: string
  onSubmit: (values: LeadFormValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof LeadFormValues>(
    key: K,
    value: LeadFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.name.trim() || !values.phone.trim()) {
      setError('Name and phone are required.')
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="lead-name">
          <input
            id="lead-name"
            className="input-field"
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Phone" htmlFor="lead-phone">
          <input
            id="lead-phone"
            className="input-field"
            required
            value={values.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>
        <Field label="Alternate phone" htmlFor="lead-alt-phone">
          <input
            id="lead-alt-phone"
            className="input-field"
            value={values.alternatePhone}
            onChange={(e) => set('alternatePhone', e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="lead-email">
          <input
            id="lead-email"
            type="email"
            className="input-field"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
        <Field label="Company" htmlFor="lead-company">
          <input
            id="lead-company"
            className="input-field"
            value={values.companyName}
            onChange={(e) => set('companyName', e.target.value)}
          />
        </Field>
        <Field label="Designation" htmlFor="lead-designation">
          <input
            id="lead-designation"
            className="input-field"
            value={values.designation}
            onChange={(e) => set('designation', e.target.value)}
          />
        </Field>
        <Field label="Industry" htmlFor="lead-industry">
          <input
            id="lead-industry"
            className="input-field"
            value={values.industry}
            onChange={(e) => set('industry', e.target.value)}
          />
        </Field>
        <Field label="Source" htmlFor="lead-source">
          <input
            id="lead-source"
            className="input-field"
            placeholder="Website, referral…"
            value={values.source}
            onChange={(e) => set('source', e.target.value)}
          />
        </Field>
        <Field label="City" htmlFor="lead-city">
          <input
            id="lead-city"
            className="input-field"
            value={values.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>
        <Field label="State" htmlFor="lead-state">
          <input
            id="lead-state"
            className="input-field"
            value={values.state}
            onChange={(e) => set('state', e.target.value)}
          />
        </Field>
        <Field label="Status" htmlFor="lead-status">
          <select
            id="lead-status"
            className="input-field"
            value={values.status}
            onChange={(e) =>
              set('status', e.target.value as LeadFormValues['status'])
            }
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor="lead-priority">
          <select
            id="lead-priority"
            className="input-field"
            value={values.priority}
            onChange={(e) =>
              set('priority', e.target.value as LeadFormValues['priority'])
            }
          >
            {LEAD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority.charAt(0) + priority.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lead score (0-100)" htmlFor="lead-score">
          <input
            id="lead-score"
            type="number"
            min={0}
            max={100}
            className="input-field"
            value={values.leadScore}
            onChange={(e) => set('leadScore', e.target.value)}
          />
        </Field>
        <Field label="Budget" htmlFor="lead-budget">
          <input
            id="lead-budget"
            type="number"
            min={0}
            className="input-field"
            value={values.budget}
            onChange={(e) => set('budget', e.target.value)}
          />
        </Field>
        <Field label="Timeline" htmlFor="lead-timeline">
          <input
            id="lead-timeline"
            className="input-field"
            placeholder="e.g. 1-3 months"
            value={values.timeline}
            onChange={(e) => set('timeline', e.target.value)}
          />
        </Field>
        <Field label="Last contacted" htmlFor="lead-last-contacted">
          <input
            id="lead-last-contacted"
            type="date"
            className="input-field"
            value={values.lastContactedAt}
            onChange={(e) => set('lastContactedAt', e.target.value)}
          />
        </Field>
        <Field label="Next follow-up" htmlFor="lead-next-followup">
          <input
            id="lead-next-followup"
            type="date"
            className="input-field"
            value={values.nextFollowUpAt}
            onChange={(e) => set('nextFollowUpAt', e.target.value)}
          />
        </Field>
        {canAssign && (
          <Field label="Assigned to" htmlFor="lead-assignee">
            <select
              id="lead-assignee"
              className="input-field"
              value={values.assignedToId}
              onChange={(e) => set('assignedToId', e.target.value)}
            >
              <option value="">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Requirement" htmlFor="lead-requirement">
        <textarea
          id="lead-requirement"
          className="input-field min-h-20 resize-y"
          value={values.requirement}
          onChange={(e) => set('requirement', e.target.value)}
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
