import { useState, type FormEvent } from 'react'
import type { BasicUser } from '../users/api'
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  type TaskFormValues,
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

export function TaskForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  assignees,
  showStatus = false,
}: {
  initialValues: TaskFormValues
  submitLabel: string
  onSubmit: (values: TaskFormValues) => Promise<void>
  onCancel: () => void
  /** Omit to hide the assignee select entirely — a SALES_EXECUTIVE always
   * gets assigned their own task server-side either way (see
   * TasksService.create), so there's nothing useful to show them here. */
  assignees?: BasicUser[]
  /** Only meaningful when editing an existing task — a new task always
   * starts life as TODO. */
  showStatus?: boolean
}) {
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof TaskFormValues>(
    key: K,
    value: TaskFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.title.trim() || !values.dueDate) {
      setError('Title and due date/time are required.')
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
      <Field label="Title" htmlFor="task-title">
        <input
          id="task-title"
          className="input-field"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>

      <Field label="Description" htmlFor="task-description">
        <textarea
          id="task-description"
          className="input-field min-h-20 resize-y"
          placeholder="Optional details…"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Type" htmlFor="task-type">
          <select
            id="task-type"
            className="input-field"
            value={values.type}
            onChange={(e) => set('type', e.target.value as TaskFormValues['type'])}
          >
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {TASK_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority" htmlFor="task-priority">
          <select
            id="task-priority"
            className="input-field"
            value={values.priority}
            onChange={(e) =>
              set('priority', e.target.value as TaskFormValues['priority'])
            }
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Due date & time" htmlFor="task-due-date">
        <input
          id="task-due-date"
          type="datetime-local"
          className="input-field"
          value={values.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
        />
      </Field>

      {assignees && (
        <Field label="Assigned to" htmlFor="task-assignee">
          <select
            id="task-assignee"
            className="input-field"
            value={values.assignedToId}
            onChange={(e) => set('assignedToId', e.target.value)}
          >
            <option value="">Myself</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {showStatus && (
        <Field label="Status" htmlFor="task-status">
          <select
            id="task-status"
            className="input-field"
            value={values.status}
            onChange={(e) =>
              set('status', e.target.value as TaskFormValues['status'])
            }
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>
      )}

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
