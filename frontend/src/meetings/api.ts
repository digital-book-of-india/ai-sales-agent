import { apiFetch } from '../lib/api'
import type {
  Meeting,
  MeetingInput,
  MeetingQuery,
  PaginatedMeetings,
  UpdateMeetingInput,
} from './types'

function buildQuery(query: MeetingQuery): string {
  const params = new URLSearchParams()
  if (query.leadId) params.set('leadId', query.leadId)
  if (query.salespersonId) params.set('salespersonId', query.salespersonId)
  if (query.status) params.set('status', query.status)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listMeetings(query: MeetingQuery = {}) {
  return apiFetch<PaginatedMeetings>(`/meetings${buildQuery(query)}`)
}

export function getMeeting(id: string) {
  return apiFetch<Meeting>(`/meetings/${id}`)
}

export function createMeeting(input: MeetingInput) {
  return apiFetch<Meeting>('/meetings', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateMeeting(id: string, input: UpdateMeetingInput) {
  return apiFetch<Meeting>(`/meetings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteMeeting(id: string) {
  return apiFetch<void>(`/meetings/${id}`, { method: 'DELETE' })
}
