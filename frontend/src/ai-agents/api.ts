import { apiFetch } from '../lib/api'
import type { AgentInput, AgentQuery, AiAgent } from './types'

function buildQuery(query: AgentQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.active !== undefined) params.set('active', String(query.active))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listAgents(query: AgentQuery = {}) {
  return apiFetch<AiAgent[]>(`/ai-agents${buildQuery(query)}`)
}

export function getAgent(id: string) {
  return apiFetch<AiAgent>(`/ai-agents/${id}`)
}

export function createAgent(input: AgentInput) {
  return apiFetch<AiAgent>('/ai-agents', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateAgent(id: string, input: AgentInput) {
  return apiFetch<AiAgent>(`/ai-agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteAgent(id: string) {
  return apiFetch<void>(`/ai-agents/${id}`, { method: 'DELETE' })
}
