import { useState, type FormEvent } from 'react'
import type { Role } from '../auth/types'
import { ROLE_LABEL, TEAM_ROLES, type InviteTeamMemberInput, type UpdateTeamMemberInput } from './types'
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

interface TeamMemberFormValues {
  name: string
  email: string
  password: string
  role: Role
}

// Invite (email + password editable, defaults to SALES_EXECUTIVE) and edit
// (email/password untouched — TeamService.update never touches either)
// share this one form, same reuse posture as FollowUpForm across create/edit.
export function TeamMemberForm({
  mode,
  initialValues,
  assignableRoles,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  mode: 'invite' | 'edit'
  initialValues: TeamMemberFormValues
  /** SALES_MANAGER can't invite/promote to ADMIN — narrows the role select. */
  assignableRoles?: Role[]
  submitLabel: string
  onSubmit: (values: InviteTeamMemberInput | UpdateTeamMemberInput) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const roles = assignableRoles ?? TEAM_ROLES

  function set<K extends keyof TeamMemberFormValues>(key: K, value: TeamMemberFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.name.trim() || (mode === 'invite' && !values.email.trim())) {
      setError('Name and email are required.')
      return
    }
    if (mode === 'invite' && values.password.trim().length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'invite') {
        await onSubmit({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          role: values.role,
        })
      } else {
        await onSubmit({ name: values.name.trim(), role: values.role })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <Field label="Name" htmlFor="team-member-name">
        <input
          id="team-member-name"
          type="text"
          className="input-field"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <Field label="Email" htmlFor="team-member-email">
        <input
          id="team-member-email"
          type="email"
          className="input-field disabled:cursor-not-allowed disabled:opacity-60"
          value={values.email}
          disabled={mode === 'edit'}
          onChange={(e) => set('email', e.target.value)}
        />
      </Field>

      {mode === 'invite' && (
        <Field label="Password" htmlFor="team-member-password">
          <input
            id="team-member-password"
            type="password"
            className="input-field"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={values.password}
            onChange={(e) => set('password', e.target.value)}
          />
          <p className="text-xs text-muted">
            Share this with {values.name.trim() || 'them'} yourself — they can log in with it right away.
          </p>
        </Field>
      )}

      <Field label="Role" htmlFor="team-member-role">
        <select
          id="team-member-role"
          className="input-field"
          value={values.role}
          onChange={(e) => set('role', e.target.value as Role)}
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
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
