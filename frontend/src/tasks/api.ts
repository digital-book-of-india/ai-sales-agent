import { apiFetch } from '../lib/api'
import type {
  PaginatedTasks,
  Task,
  TaskInput,
  TaskQuery,
  UpdateTaskInput,
  TaskStatus,
} from './types'

function buildQuery(query: TaskQuery): string {
  const params = new URLSearchParams()
  if (query.assignedToId) params.set('assignedToId', query.assignedToId)
  if (query.status) params.set('status', query.status)
  if (query.dueDate) params.set('dueDate', query.dueDate)
  if (query.leadId) params.set('leadId', query.leadId)
  if (query.dealId) params.set('dealId', query.dealId)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listTasks(query: TaskQuery = {}) {
  return apiFetch<PaginatedTasks>(`/tasks${buildQuery(query)}`)
}

/** Dashboard "My Tasks" widget — every open task assigned to the caller. */
export function listMyTasks() {
  return apiFetch<Task[]>('/tasks/mine')
}

export function getTask(id: string) {
  return apiFetch<Task>(`/tasks/${id}`)
}

export function createTask(input: TaskInput) {
  return apiFetch<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTask(id: string, input: UpdateTaskInput) {
  return apiFetch<Task>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** Task Board drag-and-drop: move a task to a different status column. */
export function updateTaskStatus(id: string, status: TaskStatus) {
  return apiFetch<Task>(`/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function deleteTask(id: string) {
  return apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' })
}
