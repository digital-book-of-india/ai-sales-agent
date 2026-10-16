import { apiFetch } from '../lib/api'
import type {
  CallAnalysis,
  CallDetail,
  CallingQueueItem,
  CallingQueueQuery,
  CallSummary,
  PaginatedCallingQueue,
  Recording,
  Transcript,
} from './types'

function buildQuery(query: CallingQueueQuery): string {
  const params = new URLSearchParams()
  if (query.campaignId) params.set('campaignId', query.campaignId)
  if (query.status) params.set('status', query.status)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listCallingQueue(query: CallingQueueQuery) {
  return apiFetch<PaginatedCallingQueue>(`/calling/queue${buildQuery(query)}`)
}

export function getLiveCalls(campaignId?: string) {
  const qs = campaignId ? `?campaignId=${campaignId}` : ''
  return apiFetch<CallingQueueItem[]>(`/calling/live${qs}`)
}

export function listCallsForLead(leadId: string) {
  return apiFetch<CallSummary[]>(`/calling/calls?leadId=${leadId}`)
}

export function getCall(id: string) {
  return apiFetch<CallDetail>(`/calling/calls/${id}`)
}

export function getRecordingForCall(callId: string) {
  return apiFetch<Recording | null>(`/calling/recordings/by-call/${callId}`)
}

export function getRecording(id: string) {
  return apiFetch<Recording>(`/calling/recordings/${id}`)
}

export function getRecordingDownloadUrl(id: string) {
  return apiFetch<{ url: string }>(`/calling/recordings/${id}/download-url`)
}

export function getTranscriptForCall(callId: string) {
  return apiFetch<Transcript | null>(`/calling/transcripts/by-call/${callId}`)
}

export function getAnalysisForCall(callId: string) {
  return apiFetch<CallAnalysis | null>(`/calling/analysis/by-call/${callId}`)
}

export function getLatestAnalysisForLead(leadId: string) {
  return apiFetch<CallAnalysis | null>(
    `/calling/analysis/latest-for-lead/${leadId}`,
  )
}
