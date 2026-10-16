import { apiFetch } from '../lib/api'
import type {
  AiAnalytics,
  AnalyticsQuery,
  CallAnalytics,
  LeadAnalytics,
  SalesAnalytics,
} from './types'

function buildQuery(query: AnalyticsQuery): string {
  const params = new URLSearchParams()
  params.set('range', query.range)
  if (query.range === 'custom') {
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
  }
  return `?${params.toString()}`
}

export function getCallAnalytics(query: AnalyticsQuery) {
  return apiFetch<CallAnalytics>(`/analytics/calls${buildQuery(query)}`)
}

export function getLeadAnalytics(query: AnalyticsQuery) {
  return apiFetch<LeadAnalytics>(`/analytics/leads${buildQuery(query)}`)
}

export function getSalesAnalytics(query: AnalyticsQuery) {
  return apiFetch<SalesAnalytics>(`/analytics/sales${buildQuery(query)}`)
}

export function getAiAnalytics(query: AnalyticsQuery) {
  return apiFetch<AiAnalytics>(`/analytics/ai${buildQuery(query)}`)
}
