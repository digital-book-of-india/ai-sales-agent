import { useState, type FormEvent } from 'react'
import {
  CALLING_HOURS_DAYS,
  LEAD_STATUSES,
  type CallingHoursDay,
  type CampaignFormValues,
} from './types'
import { LEAD_STATUS_LABEL } from '../leads/types'
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

export function CampaignForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValues: CampaignFormValues
  submitLabel: string
  onSubmit: (values: CampaignFormValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof CampaignFormValues>(
    key: K,
    value: CampaignFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function toggleStatus(status: (typeof LEAD_STATUSES)[number]) {
    setValues((prev) => ({
      ...prev,
      leadStatuses: prev.leadStatuses.includes(status)
        ? prev.leadStatuses.filter((s) => s !== status)
        : [...prev.leadStatuses, status],
    }))
  }

  function toggleDay(day: CallingHoursDay) {
    setValues((prev) => ({
      ...prev,
      callingDays: prev.callingDays.includes(day)
        ? prev.callingDays.filter((d) => d !== day)
        : [...prev.callingDays, day],
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
        <Field label="Name" htmlFor="campaign-name">
          <input
            id="campaign-name"
            className="input-field"
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Objective" htmlFor="campaign-objective">
          <input
            id="campaign-objective"
            className="input-field"
            placeholder="e.g. Book demos"
            value={values.objective}
            onChange={(e) => set('objective', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="campaign-description">
        <textarea
          id="campaign-description"
          className="input-field min-h-20 resize-y"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink">
          Lead filters
        </span>
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-muted">
              Status
            </span>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={
                    values.leadStatuses.includes(status)
                      ? 'badge badge-success cursor-pointer'
                      : 'badge badge-muted cursor-pointer'
                  }
                >
                  {LEAD_STATUS_LABEL[status]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sources (comma separated)" htmlFor="campaign-sources">
              <input
                id="campaign-sources"
                className="input-field"
                placeholder="Website, referral…"
                value={values.leadSources}
                onChange={(e) => set('leadSources', e.target.value)}
              />
            </Field>
            <Field label="Tags (comma separated)" htmlFor="campaign-tags">
              <input
                id="campaign-tags"
                className="input-field"
                placeholder="vip, hot…"
                value={values.leadTags}
                onChange={(e) => set('leadTags', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink">
          Calling hours
        </span>
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" htmlFor="campaign-calling-start">
              <input
                id="campaign-calling-start"
                type="time"
                className="input-field"
                value={values.callingStart}
                onChange={(e) => set('callingStart', e.target.value)}
              />
            </Field>
            <Field label="End time" htmlFor="campaign-calling-end">
              <input
                id="campaign-calling-end"
                type="time"
                className="input-field"
                value={values.callingEnd}
                onChange={(e) => set('callingEnd', e.target.value)}
              />
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-muted">
              Days
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CALLING_HOURS_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={
                    values.callingDays.includes(day)
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Max attempts" htmlFor="campaign-max-attempts">
          <input
            id="campaign-max-attempts"
            type="number"
            min={1}
            className="input-field"
            value={values.maxAttempts}
            onChange={(e) => set('maxAttempts', e.target.value)}
          />
        </Field>
        <Field label="Retry interval (min)" htmlFor="campaign-retry-interval">
          <input
            id="campaign-retry-interval"
            type="number"
            min={1}
            className="input-field"
            value={values.retryInterval}
            onChange={(e) => set('retryInterval', e.target.value)}
          />
        </Field>
        <Field label="Concurrent calls" htmlFor="campaign-concurrent-calls">
          <input
            id="campaign-concurrent-calls"
            type="number"
            min={1}
            className="input-field"
            value={values.concurrentCalls}
            onChange={(e) => set('concurrentCalls', e.target.value)}
          />
        </Field>
        <Field label="Calls per minute" htmlFor="campaign-calls-per-minute">
          <input
            id="campaign-calls-per-minute"
            type="number"
            min={1}
            className="input-field"
            value={values.callsPerMinute}
            onChange={(e) => set('callsPerMinute', e.target.value)}
          />
        </Field>
      </div>

      <div>
        <label className="flex items-start gap-2.5 rounded-lg border border-border p-3.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={values.recordingConsent}
            onChange={(e) => set('recordingConsent', e.target.checked)}
          />
          <span>
            <span className="block font-semibold text-ink">
              Recording consent &amp; disclosure
            </span>
            <span className="block text-muted">
              When enabled, calls in this campaign are recorded and a
              disclosure is given to the lead. Disable for campaigns where
              recording consent hasn&apos;t been obtained — no recording will
              be stored.
            </span>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Start date" htmlFor="campaign-start-date">
          <input
            id="campaign-start-date"
            type="date"
            className="input-field"
            value={values.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
        <Field label="End date" htmlFor="campaign-end-date">
          <input
            id="campaign-end-date"
            type="date"
            className="input-field"
            value={values.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </Field>
      </div>

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
