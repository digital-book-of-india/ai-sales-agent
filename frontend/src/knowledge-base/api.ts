import { apiFetch } from '../lib/api'
import type {
  Faq,
  FaqInput,
  KnowledgeBase,
  Objection,
  ObjectionInput,
  UpdateKnowledgeBaseInput,
} from './types'

export function getKnowledgeBase(agentId: string) {
  return apiFetch<KnowledgeBase>(`/ai-agents/${agentId}/knowledge-base`)
}

export function saveKnowledgeBase(agentId: string, input: UpdateKnowledgeBaseInput) {
  return apiFetch<KnowledgeBase>(`/ai-agents/${agentId}/knowledge-base`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function createFaq(knowledgeBaseId: string, input: FaqInput) {
  return apiFetch<Faq>(`/knowledge-bases/${knowledgeBaseId}/faqs`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateFaq(id: string, input: FaqInput) {
  return apiFetch<Faq>(`/faqs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteFaq(id: string) {
  return apiFetch<void>(`/faqs/${id}`, { method: 'DELETE' })
}

export function createObjection(knowledgeBaseId: string, input: ObjectionInput) {
  return apiFetch<Objection>(`/knowledge-bases/${knowledgeBaseId}/objections`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateObjection(id: string, input: ObjectionInput) {
  return apiFetch<Objection>(`/objections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteObjection(id: string) {
  return apiFetch<void>(`/objections/${id}`, { method: 'DELETE' })
}
