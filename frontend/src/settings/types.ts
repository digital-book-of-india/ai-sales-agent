// Mirrors the backend's per-domain config shapes (see
// backend/src/system-settings/*.config.ts) — kept in sync by hand since
// there's no shared schema package between the two apps.

export interface BusinessHours {
  timezone: string
  opensAt: string
  closesAt: string
  daysOpen: number[]
}

export interface CompanyInfo {
  name: string
  logoUrl: string
  contactEmail: string
  contactPhone: string
  businessHours: BusinessHours
}

export interface CallingSettings {
  provider: string
  callerId: string
  recordingEnabled: boolean
  callingHoursStart: string
  callingHoursEnd: string
  maxRetries: number
  retryIntervalMinutes: number
  concurrentCalls: number
}

export type AiResponseStyle = 'concise' | 'friendly' | 'formal' | 'persuasive'

export interface AiSettings {
  defaultAgentId: string | null
  defaultLanguage: string
  defaultVoice: string
  defaultResponseStyle: AiResponseStyle
}

export interface FollowUpRules {
  autoScheduleOnNoAnswer: boolean
  defaultDueInHours: number
  maxAutoFollowUps: number
}

export interface SalesSettings {
  followUpRules: FollowUpRules
}

export interface LeadScoringWeights {
  requirementConfirmed: number
  budgetConfirmed: number
  timelineConfirmed: number
  decisionMaker: number
  positiveIntent: number
  demoRequested: number
}

export interface LeadScoringThresholds {
  hot: number
  warm: number
  cold: number
}

export interface LeadScoringConfig {
  weights: LeadScoringWeights
  thresholds: LeadScoringThresholds
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
