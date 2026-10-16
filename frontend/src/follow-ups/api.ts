import { apiFetch } from '../lib/api'
import type {
  FollowUp,
  FollowUpInput,
  FollowUpQuery,
  PaginatedFollowUps,
  UpdateFollowUpInput,
} from './types'

function buildQuery(query: FollowUpQuery): string {
  const params = new URLSearchParams()
  if (query.leadId) params.set('leadId', query.leadId)
  if (query.status) params.set('status', query.status)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listFollowUps(query: FollowUpQuery = {}) {
  return apiFetch<PaginatedFollowUps>(`/follow-ups${buildQuery(query)}`)
}

/** Dashboard "Follow-ups due" widget — every PENDING follow-up already
 * at/past its dueAt, scoped to the current user. */
export function listDueFollowUps() {
  return apiFetch<FollowUp[]>('/follow-ups/due')
}

export function getFollowUp(id: string) {
  return apiFetch<FollowUp>(`/follow-ups/${id}`)
}

export function createFollowUp(input: FollowUpInput) {
  return apiFetch<FollowUp>('/follow-ups', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateFollowUp(id: string, input: UpdateFollowUpInput) {
  return apiFetch<FollowUp>(`/follow-ups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function completeFollowUp(id: string) {
  return apiFetch<FollowUp>(`/follow-ups/${id}/complete`, { method: 'POST' })
}

export function deleteFollowUp(id: string) {
  return apiFetch<void>(`/follow-ups/${id}`, { method: 'DELETE' })
}
