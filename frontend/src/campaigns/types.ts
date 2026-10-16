import { LEAD_STATUSES, type LeadStatus } from '../leads/types'

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'STOPPED',
] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  STOPPED: 'Stopped',
}

export const CALLING_HOURS_DAYS = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const

export type CallingHoursDay = (typeof CALLING_HOURS_DAYS)[number]

export interface LeadFilters {
  statuses?: LeadStatus[]
  sources?: string[]
  tags?: string[]
}

export interface CallingHours {
  start?: string
  end?: string
  days?: CallingHoursDay[]
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  objective: string | null
  aiAgentId: string | null
  leadFilters: LeadFilters
  callingHours: CallingHours
  maxAttempts: number
  retryInterval: number
  concurrentCalls: number
  callsPerMinute: number
  startDate: string | null
  endDate: string | null
  recordingConsent: boolean
  status: CampaignStatus
  createdAt: string
  updatedAt: string
  _count: { campaignLeads: number }
}

export interface PaginatedCampaigns {
  data: Campaign[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface CampaignQuery {
  page?: number
  limit?: number
  search?: string
  status?: CampaignStatus
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface CampaignStats {
  leads: number
  attempted: number
  connected: number
  noAnswer: number
  busy: number
  failed: number
  interested: number
  hotLeads: number
  meetings: number
  conversion: number
  avgCallDuration: number
}

export interface CampaignFormValues {
  name: string
  description: string
  objective: string
  leadStatuses: LeadStatus[]
  leadSources: string
  leadTags: string
  callingStart: string
  callingEnd: string
  callingDays: CallingHoursDay[]
  maxAttempts: string
  retryInterval: string
  concurrentCalls: string
  callsPerMinute: string
  startDate: string
  endDate: string
  recordingConsent: boolean
}

export interface CampaignInput {
  name: string
  description?: string
  objective?: string
  leadFilters?: LeadFilters
  callingHours?: CallingHours
  maxAttempts?: number
  retryInterval?: number
  concurrentCalls?: number
  callsPerMinute?: number
  startDate?: string
  endDate?: string
  recordingConsent?: boolean
}

export const EMPTY_CAMPAIGN_FORM_VALUES: CampaignFormValues = {
  name: '',
  description: '',
  objective: '',
  leadStatuses: [],
  leadSources: '',
  leadTags: '',
  callingStart: '09:00',
  callingEnd: '18:00',
  callingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  maxAttempts: '3',
  retryInterval: '60',
  concurrentCalls: '1',
  callsPerMinute: '10',
  startDate: '',
  endDate: '',
  recordingConsent: true,
}

export function campaignToFormValues(campaign: Campaign): CampaignFormValues {
  return {
    name: campaign.name,
    description: campaign.description ?? '',
    objective: campaign.objective ?? '',
    leadStatuses: campaign.leadFilters.statuses ?? [],
    leadSources: (campaign.leadFilters.sources ?? []).join(', '),
    leadTags: (campaign.leadFilters.tags ?? []).join(', '),
    callingStart: campaign.callingHours.start ?? '09:00',
    callingEnd: campaign.callingHours.end ?? '18:00',
    callingDays: campaign.callingHours.days ?? [],
    maxAttempts: String(campaign.maxAttempts),
    retryInterval: String(campaign.retryInterval),
    concurrentCalls: String(campaign.concurrentCalls),
    callsPerMinute: String(campaign.callsPerMinute),
    startDate: campaign.startDate ? campaign.startDate.slice(0, 10) : '',
    endDate: campaign.endDate ? campaign.endDate.slice(0, 10) : '',
    recordingConsent: campaign.recordingConsent,
  }
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export function formValuesToInput(values: CampaignFormValues): CampaignInput {
  const sources = splitCsv(values.leadSources)
  const tags = splitCsv(values.leadTags)

  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    objective: values.objective.trim() || undefined,
    leadFilters: {
      statuses: values.leadStatuses.length ? values.leadStatuses : undefined,
      sources: sources.length ? sources : undefined,
      tags: tags.length ? tags : undefined,
    },
    callingHours: {
      start: values.callingStart || undefined,
      end: values.callingEnd || undefined,
      days: values.callingDays.length ? values.callingDays : undefined,
    },
    maxAttempts: values.maxAttempts === '' ? undefined : Number(values.maxAttempts),
    retryInterval:
      values.retryInterval === '' ? undefined : Number(values.retryInterval),
    concurrentCalls:
      values.concurrentCalls === '' ? undefined : Number(values.concurrentCalls),
    callsPerMinute:
      values.callsPerMinute === '' ? undefined : Number(values.callsPerMinute),
    startDate: values.startDate
      ? new Date(values.startDate).toISOString()
      : undefined,
    endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
    recordingConsent: values.recordingConsent,
  }
}

export { LEAD_STATUSES }
