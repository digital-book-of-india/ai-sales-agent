import { apiFetch } from '../lib/api'
import type {
  BoardStage,
  Deal,
  DealInput,
  DealQuery,
  PaginatedDeals,
  PipelineStage,
  UpdateDealInput,
} from './types'

export function listPipelineStages() {
  return apiFetch<PipelineStage[]>('/pipeline-stages')
}

function buildQuery(query: DealQuery): string {
  const params = new URLSearchParams()
  if (query.leadId) params.set('leadId', query.leadId)
  if (query.ownerId) params.set('ownerId', query.ownerId)
  if (query.stageId) params.set('stageId', query.stageId)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listDeals(query: DealQuery = {}) {
  return apiFetch<PaginatedDeals>(`/deals${buildQuery(query)}`)
}

/** Every pipeline stage with its deals nested — backs the Kanban board. */
export function getDealsBoard() {
  return apiFetch<BoardStage[]>('/deals/board')
}

export function getDeal(id: string) {
  return apiFetch<Deal>(`/deals/${id}`)
}

export function createDeal(input: DealInput) {
  return apiFetch<Deal>('/deals', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateDeal(id: string, input: UpdateDealInput) {
  return apiFetch<Deal>(`/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function moveDealStage(id: string, stageId: string) {
  return apiFetch<Deal>(`/deals/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stageId }),
  })
}

export function deleteDeal(id: string) {
  return apiFetch<void>(`/deals/${id}`, { method: 'DELETE' })
}
