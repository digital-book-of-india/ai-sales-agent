import type { LeadStatus } from '../leads/types'
import type { CampaignStatus } from '../campaigns/types'

export const DASHBOARD_RANGES = [
  'today',
  'yesterday',
  'week',
  'month',
  'custom',
] as const

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]

export const DASHBOARD_RANGE_LABEL: Record<DashboardRange, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  month: 'This month',
  custom: 'Custom',
}

export interface DashboardQuery {
  range: DashboardRange
  from?: string
  to?: string
}

export interface DashboardStats {
  totalLeads: number
  newLeads: number
  callsToday: number
  connectedCalls: number
  failedCalls: number
  interestedLeads: number
  hotLeads: number
  warmLeads: number
  followUpsDue: number
  meetings: number
  openDeals: number
  wonDeals: number
  lostDeals: number
  revenue: number
  conversionRate: number
  avgCallDuration: number
  aiCallSuccessRate: number
}

export interface FunnelStage {
  status: LeadStatus
  label: string
  count: number
}

export interface StatusDistributionEntry {
  status: LeadStatus
  label: string
  count: number
}

export interface CampaignPerformanceRow {
  campaignId: string
  campaignName: string
  status: CampaignStatus
  totalLeads: number
  connected: number
  interested: number
  converted: number
  conversionRate: number
}

export interface CallsOverTimePoint {
  date: string
  calls: number
  connected: number
  failed: number
}

export interface DashboardCharts {
  leadFunnel: FunnelStage[]
  statusDistribution: StatusDistributionEntry[]
  campaignPerformance: CampaignPerformanceRow[]
  callsOverTime: CallsOverTimePoint[]
}
