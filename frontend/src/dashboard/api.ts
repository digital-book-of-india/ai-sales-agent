import { apiFetch } from '../lib/api'
import type { DashboardCharts, DashboardQuery, DashboardStats } from './types'

function buildQuery(query: DashboardQuery): string {
  const params = new URLSearchParams()
  params.set('range', query.range)
  if (query.range === 'custom') {
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
  }
  return `?${params.toString()}`
}

export function getDashboardStats(query: DashboardQuery) {
  return apiFetch<DashboardStats>(`/dashboard/stats${buildQuery(query)}`)
}

export function getDashboardCharts(query: DashboardQuery) {
  return apiFetch<DashboardCharts>(`/dashboard/charts${buildQuery(query)}`)
}
