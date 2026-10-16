export const TASK_TYPES = [
  'FOLLOW_UP',
  'CALL',
  'DEMO',
  'SEND_QUOTATION',
  'SEND_PROPOSAL',
  'MEETING',
  'INTERNAL',
] as const

export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  FOLLOW_UP: 'Follow-up',
  CALL: 'Call',
  DEMO: 'Demo',
  SEND_QUOTATION: 'Send quotation',
  SEND_PROPOSAL: 'Send proposal',
  MEETING: 'Meeting',
  INTERNAL: 'Internal',
}

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

// The Task Board's three fixed columns.
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}

export interface TaskLead {
  id: string
  name: string
  phone: string
  companyName: string | null
}

export interface TaskDeal {
  id: string
  leadId: string
  value: number
}

export interface Task {
  id: string
  title: string
  description: string | null
  type: TaskType
  assignedToId: string
  dueDate: string
  priority: TaskPriority
  status: TaskStatus
  relatedLeadId: string | null
  relatedDealId: string | null
  createdAt: string
  updatedAt: string
  assignedTo: { id: string; name: string }
  relatedLead: TaskLead | null
  relatedDeal: TaskDeal | null
}

export interface PaginatedTasks {
  data: Task[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface TaskQuery {
  assignedToId?: string
  status?: TaskStatus
  dueDate?: string
  leadId?: string
  dealId?: string
  page?: number
  limit?: number
}

export interface TaskInput {
  title: string
  description?: string
  type: TaskType
  assignedToId?: string
  dueDate: string
  priority?: TaskPriority
  status?: TaskStatus
  relatedLeadId?: string
  relatedDealId?: string
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  type?: TaskType
  assignedToId?: string
  dueDate?: string
  priority?: TaskPriority
  status?: TaskStatus
  relatedLeadId?: string
  relatedDealId?: string
}

export interface TaskFormValues {
  title: string
  description: string
  type: TaskType
  assignedToId: string
  dueDate: string
  priority: TaskPriority
  status: TaskStatus
}

export const EMPTY_TASK_FORM_VALUES: TaskFormValues = {
  title: '',
  description: '',
  type: 'FOLLOW_UP',
  assignedToId: '',
  dueDate: '',
  priority: 'MEDIUM',
  status: 'TODO',
}

/** `dueDate` in <input type="datetime-local"> form (YYYY-MM-DDTHH:mm, local
 * time, no seconds/timezone), same convention as FollowUp.dueAt. */
export function taskToFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    type: task.type,
    assignedToId: task.assignedToId,
    dueDate: toDatetimeLocal(task.dueDate),
    priority: task.priority,
    status: task.status,
  }
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formValuesToTaskInput(
  values: TaskFormValues,
  related?: { leadId?: string; dealId?: string },
): TaskInput {
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    type: values.type,
    assignedToId: values.assignedToId || undefined,
    dueDate: new Date(values.dueDate).toISOString(),
    priority: values.priority,
    status: values.status,
    relatedLeadId: related?.leadId,
    relatedDealId: related?.dealId,
  }
}

export function formValuesToUpdateTaskInput(
  values: TaskFormValues,
): UpdateTaskInput {
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    type: values.type,
    assignedToId: values.assignedToId || undefined,
    dueDate: new Date(values.dueDate).toISOString(),
    priority: values.priority,
    status: values.status,
  }
}
