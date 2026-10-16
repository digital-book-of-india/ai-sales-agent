import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from './types'

const STATUS_CLASS: Record<TaskStatus, string> = {
  TODO: 'badge badge-muted',
  IN_PROGRESS: 'badge badge-warning',
  DONE: 'badge badge-success',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={STATUS_CLASS[status]}>{TASK_STATUS_LABEL[status]}</span>
}

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  LOW: 'badge badge-muted',
  MEDIUM: 'badge badge-warning',
  HIGH: 'badge badge-danger',
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={PRIORITY_CLASS[priority]}>
      {TASK_PRIORITY_LABEL[priority]}
    </span>
  )
}

export function TaskTypeBadge({ type }: { type: TaskType }) {
  return <span className="badge badge-muted">{TASK_TYPE_LABEL[type]}</span>
}
