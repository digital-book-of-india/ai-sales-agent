import { apiFetch } from '../lib/api'
import type {
  Campaign,
  CampaignInput,
  CampaignQuery,
  CampaignStats,
  PaginatedCampaigns,
} from './types'

function buildQuery(query: CampaignQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.status) params.set('status', query.status)
  if (query.sortBy) params.set('sortBy', query.sortBy)
  if (query.sortOrder) params.set('sortOrder', query.sortOrder)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listCampaigns(query: CampaignQuery) {
  return apiFetch<PaginatedCampaigns>(`/campaigns${buildQuery(query)}`)
}

export function getCampaign(id: string) {
  return apiFetch<Campaign>(`/campaigns/${id}`)
}

export function getCampaignStats(id: string) {
  return apiFetch<CampaignStats>(`/campaigns/${id}/stats`)
}

export function createCampaign(input: CampaignInput) {
  return apiFetch<Campaign>('/campaigns', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateCampaign(id: string, input: CampaignInput) {
  return apiFetch<Campaign>(`/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteCampaign(id: string) {
  return apiFetch<void>(`/campaigns/${id}`, { method: 'DELETE' })
}

export function duplicateCampaign(id: string) {
  return apiFetch<Campaign>(`/campaigns/${id}/duplicate`, { method: 'POST' })
}

export function startCampaign(id: string) {
  return apiFetch<Campaign>(`/campaigns/${id}/start`, { method: 'POST' })
}

export function pauseCampaign(id: string) {
  return apiFetch<Campaign>(`/campaigns/${id}/pause`, { method: 'POST' })
}

export function resumeCampaign(id: string) {
  return apiFetch<Campaign>(`/campaigns/${id}/resume`, { method: 'POST' })
}

export function stopCampaign(id: string) {
  return apiFetch<Campaign>(`/campaigns/${id}/stop`, { method: 'POST' })
}
