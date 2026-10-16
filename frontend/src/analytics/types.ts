import type { LeadStatus } from '../leads/types'
import type { DashboardQuery } from '../dashboard/types'

export type AnalyticsQuery = DashboardQuery

export interface CallTrendPoint {
  date: string
  totalCalls: number
  connectedCalls: number
  failedCalls: number
}

export interface CallAnalytics {
  totalCalls: number
  connectedCalls: number
  failedCalls: number
  answerRate: number
  avgDuration: number
  retryRate: number
  trend: CallTrendPoint[]
}

export interface LeadFunnelStage {
  status: LeadStatus
  label: string
  count: number
}

export interface LeadAnalytics {
  newLeads: number
  contactedLeads: number
  interestedLeads: number
  qualifiedLeads: number
  hotLeads: number
  funnel: LeadFunnelStage[]
}

export interface PipelineStageValue {
  stageId: string
  stageName: string
  order: number
  value: number
  dealCount: number
}

export interface RevenuePoint {
  date: string
  revenue: number
}

export interface SalesAnalytics {
  pipelineByStage: PipelineStageValue[]
  totalPipelineValue: number
  wonDeals: number
  lostDeals: number
  revenue: number
  conversionRate: number
  revenueOverTime: RevenuePoint[]
}

export interface TextCount {
  count: number
}

export interface ObjectionCount extends TextCount {
  objection: string
}

export interface CustomerQuestionCount extends TextCount {
  question: string
}

export interface AiAnalytics {
  aiCalls: number
  successfulCalls: number
  humanTransfers: number
  failedAiCalls: number
  avgQualityScore: number
  topObjections: ObjectionCount[]
  topCustomerQuestions: CustomerQuestionCount[]
}
