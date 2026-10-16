export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'QUALIFIED',
  'DEMO_SCHEDULED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'CALL_LATER',
  'INVALID',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  QUALIFIED: 'Qualified',
  DEMO_SCHEDULED: 'Demo scheduled',
  PROPOSAL_SENT: 'Proposal sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  NOT_INTERESTED: 'Not interested',
  CALL_LATER: 'Call later',
  INVALID: 'Invalid',
}

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

export type LeadPriority = (typeof LEAD_PRIORITIES)[number]

export interface LeadOwner {
  id: string
  name: string
  email: string
}

export interface LeadSummary {
  id: string
  name: string
  phone: string
  email: string | null
  companyName: string | null
  city: string | null
  state: string | null
  status: LeadStatus
  priority: LeadPriority
  leadScore: number
  tags: string[]
  nextFollowUpAt: string | null
  lastContactedAt: string | null
  createdAt: string
  assignedTo: LeadOwner | null
}

export interface LeadNote {
  id: string
  body: string
  createdAt: string
  author: { id: string; name: string }
}

export interface Lead extends LeadSummary {
  alternatePhone: string | null
  designation: string | null
  industry: string | null
  source: string | null
  requirement: string | null
  budget: number | null
  timeline: string | null
  updatedAt: string
  notes: LeadNote[]
}

/** One entry in a lead's activity timeline (see backend Activity model).
 * `type` is a free-form string — 'CALL_COMPLETED' is the only one produced
 * today, with more expected over time, so the frontend renders unknown
 * types generically rather than needing a fixed union kept in sync. */
export interface LeadActivity {
  id: string
  type: string
  payload: Record<string, unknown>
  createdAt: string
  actorUser: { id: string; name: string } | null
}

export interface PaginatedLeads {
  data: LeadSummary[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface LeadQuery {
  page?: number
  limit?: number
  search?: string
  status?: LeadStatus
  assignedTo?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface LeadFormValues {
  name: string
  phone: string
  alternatePhone: string
  email: string
  companyName: string
  designation: string
  industry: string
  city: string
  state: string
  source: string
  status: LeadStatus
  priority: LeadPriority
  leadScore: string
  assignedToId: string
  requirement: string
  budget: string
  timeline: string
  lastContactedAt: string
  nextFollowUpAt: string
}

export interface LeadInput {
  name: string
  phone: string
  alternatePhone?: string
  email?: string
  companyName?: string
  designation?: string
  industry?: string
  city?: string
  state?: string
  source?: string
  status?: LeadStatus
  priority?: LeadPriority
  leadScore?: number
  assignedToId?: string
  requirement?: string
  budget?: number
  timeline?: string
  tags?: string[]
  lastContactedAt?: string
  nextFollowUpAt?: string
}

export const EMPTY_LEAD_FORM_VALUES: LeadFormValues = {
  name: '',
  phone: '',
  alternatePhone: '',
  email: '',
  companyName: '',
  designation: '',
  industry: '',
  city: '',
  state: '',
  source: '',
  status: 'NEW',
  priority: 'MEDIUM',
  leadScore: '0',
  assignedToId: '',
  requirement: '',
  budget: '',
  timeline: '',
  lastContactedAt: '',
  nextFollowUpAt: '',
}

export function leadToFormValues(lead: Lead): LeadFormValues {
  return {
    name: lead.name,
    phone: lead.phone,
    alternatePhone: lead.alternatePhone ?? '',
    email: lead.email ?? '',
    companyName: lead.companyName ?? '',
    designation: lead.designation ?? '',
    industry: lead.industry ?? '',
    city: lead.city ?? '',
    state: lead.state ?? '',
    source: lead.source ?? '',
    status: lead.status,
    priority: lead.priority,
    leadScore: String(lead.leadScore),
    assignedToId: lead.assignedTo?.id ?? '',
    requirement: lead.requirement ?? '',
    budget: lead.budget !== null ? String(lead.budget) : '',
    timeline: lead.timeline ?? '',
    lastContactedAt: lead.lastContactedAt
      ? lead.lastContactedAt.slice(0, 10)
      : '',
    nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : '',
  }
}

export const IMPORTABLE_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'alternatePhone', label: 'Alternate phone' },
  { value: 'email', label: 'Email' },
  { value: 'companyName', label: 'Company' },
  { value: 'designation', label: 'Designation' },
  { value: 'industry', label: 'Industry' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'source', label: 'Source' },
  { value: 'requirement', label: 'Requirement' },
  { value: 'budget', label: 'Budget' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'tags', label: 'Tags' },
] as const

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number]['value']

export interface LeadImportUploadResult {
  importId: string
  headers: string[]
  suggestedMapping: Record<string, ImportableField | null>
  totalRows: number
  previewRows: Record<string, string>[]
}

export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate'

export interface LeadImportRowResult {
  rowIndex: number
  data: Record<string, string>
  status: ImportRowStatus
  reason?: string
}

export interface LeadImportSummary {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  importedRows: number
}

export interface LeadImportResult {
  summary: LeadImportSummary
  rows: LeadImportRowResult[]
}

export function formValuesToInput(values: LeadFormValues): LeadInput {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    alternatePhone: values.alternatePhone.trim() || undefined,
    email: values.email.trim() || undefined,
    companyName: values.companyName.trim() || undefined,
    designation: values.designation.trim() || undefined,
    industry: values.industry.trim() || undefined,
    city: values.city.trim() || undefined,
    state: values.state.trim() || undefined,
    source: values.source.trim() || undefined,
    status: values.status,
    priority: values.priority,
    leadScore: values.leadScore === '' ? undefined : Number(values.leadScore),
    assignedToId: values.assignedToId || undefined,
    requirement: values.requirement.trim() || undefined,
    budget: values.budget === '' ? undefined : Number(values.budget),
    timeline: values.timeline.trim() || undefined,
    lastContactedAt: values.lastContactedAt
      ? new Date(values.lastContactedAt).toISOString()
      : undefined,
    nextFollowUpAt: values.nextFollowUpAt
      ? new Date(values.nextFollowUpAt).toISOString()
      : undefined,
  }
}
