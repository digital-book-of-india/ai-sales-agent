import { apiFetch, apiFetchBlob } from '../lib/api'
import type {
  Lead,
  LeadActivity,
  LeadImportResult,
  LeadImportUploadResult,
  LeadInput,
  LeadQuery,
  PaginatedLeads,
} from './types'

function buildQuery(query: LeadQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.status) params.set('status', query.status)
  if (query.assignedTo) params.set('assignedTo', query.assignedTo)
  if (query.sortBy) params.set('sortBy', query.sortBy)
  if (query.sortOrder) params.set('sortOrder', query.sortOrder)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listLeads(query: LeadQuery) {
  return apiFetch<PaginatedLeads>(`/leads${buildQuery(query)}`)
}

export function getLead(id: string) {
  return apiFetch<Lead>(`/leads/${id}`)
}

export function createLead(input: LeadInput) {
  return apiFetch<Lead>('/leads', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateLead(id: string, input: LeadInput) {
  return apiFetch<Lead>(`/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteLead(id: string) {
  return apiFetch<void>(`/leads/${id}`, { method: 'DELETE' })
}

export interface InitiateCallResult {
  callId: string
  queueItemId: string
  campaignId: string
}

/** Click-to-call — see ManualCallService on the backend. Only starts the
 * call; live state (dialing/ringing/connected/ended) follows over the
 * /calling websocket, filtered by the returned callId. */
export function initiateLeadCall(id: string) {
  return apiFetch<InitiateCallResult>(`/leads/${id}/call`, {
    method: 'POST',
  })
}

export function bulkAssignLeads(leadIds: string[], assignedToId: string) {
  return apiFetch<{ updated: number }>('/leads/bulk-assign', {
    method: 'POST',
    body: JSON.stringify({ leadIds, assignedToId }),
  })
}

export function addLeadNote(id: string, body: string) {
  return apiFetch<Lead>(`/leads/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function addLeadTag(id: string, tag: string) {
  return apiFetch<Lead>(`/leads/${id}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag }),
  })
}

export function uploadLeadImport(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch<LeadImportUploadResult>('/leads/import', {
    method: 'POST',
    body: formData,
  })
}

export function confirmLeadImport(
  importId: string,
  mapping: Record<string, string>,
  dryRun: boolean,
) {
  return apiFetch<LeadImportResult>('/leads/import/confirm', {
    method: 'POST',
    body: JSON.stringify({ importId, mapping, dryRun }),
  })
}

export function exportLeads(query: LeadQuery) {
  return apiFetchBlob(`/leads/export${buildQuery(query)}`)
}

export function getLeadActivity(id: string) {
  return apiFetch<LeadActivity[]>(`/leads/${id}/activity`)
}
