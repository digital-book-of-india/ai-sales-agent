import { apiFetch } from '../lib/api'
import type {
  PlaybookQuestion,
  PlaybookQuestionInput,
  SalesPlaybook,
  UpdatePlaybookInput,
} from './types'

export function getPlaybook(agentId: string) {
  return apiFetch<SalesPlaybook>(`/ai-agents/${agentId}/playbook`)
}

export function savePlaybook(agentId: string, input: UpdatePlaybookInput) {
  return apiFetch<SalesPlaybook>(`/ai-agents/${agentId}/playbook`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function createPlaybookQuestion(
  playbookId: string,
  input: PlaybookQuestionInput,
) {
  return apiFetch<PlaybookQuestion>(`/playbooks/${playbookId}/questions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePlaybookQuestion(id: string, input: PlaybookQuestionInput) {
  return apiFetch<PlaybookQuestion>(`/playbook-questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deletePlaybookQuestion(id: string) {
  return apiFetch<void>(`/playbook-questions/${id}`, { method: 'DELETE' })
}
