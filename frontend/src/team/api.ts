import { apiFetch } from '../lib/api'
import type {
  InviteTeamMemberInput,
  TeamMember,
  TeamQuery,
  UpdateTeamMemberInput,
} from './types'

function buildQuery(query: TeamQuery): string {
  const params = new URLSearchParams()
  params.set('range', query.range)
  if (query.range === 'custom') {
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
  }
  return `?${params.toString()}`
}

export function listTeam(query: TeamQuery) {
  return apiFetch<TeamMember[]>(`/team${buildQuery(query)}`)
}

export function inviteTeamMember(input: InviteTeamMemberInput) {
  return apiFetch<TeamMember>('/team/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTeamMember(id: string, input: UpdateTeamMemberInput) {
  return apiFetch<TeamMember>(`/team/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deactivateTeamMember(id: string) {
  return apiFetch<TeamMember>(`/team/${id}/deactivate`, { method: 'POST' })
}

export function activateTeamMember(id: string) {
  return apiFetch<TeamMember>(`/team/${id}/activate`, { method: 'POST' })
}
