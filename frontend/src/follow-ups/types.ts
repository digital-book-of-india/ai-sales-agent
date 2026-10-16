export const FOLLOW_UP_STATUSES = ['PENDING', 'DONE', 'CANCELLED'] as const

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  PENDING: 'Pending',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}

export interface FollowUpLead {
  id: string
  name: string
  phone: string
  companyName: string | null
}

export interface FollowUp {
  id: string
  leadId: string
  dueAt: string
  reason: string
  status: FollowUpStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
  lead: FollowUpLead
  creator: { id: string; name: string } | null
}

export interface PaginatedFollowUps {
  data: FollowUp[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface FollowUpQuery {
  leadId?: string
  status?: FollowUpStatus
  from?: string
  to?: string
  page?: number
  limit?: number
}

export interface FollowUpInput {
  leadId: string
  dueAt: string
  reason: string
}

export interface UpdateFollowUpInput {
  dueAt?: string
  reason?: string
  status?: FollowUpStatus
}

export interface FollowUpFormValues {
  dueAt: string
  reason: string
}

export const EMPTY_FOLLOW_UP_FORM_VALUES: FollowUpFormValues = {
  dueAt: '',
  reason: '',
}

/** `dueAt` in <input type="datetime-local"> form (YYYY-MM-DDTHH:mm, local
 * time, no seconds/timezone) — follow-ups carry a specific time ("call me
 * Friday at 10am"), not just a date, unlike Lead.nextFollowUpAt. */
export function followUpToFormValues(followUp: FollowUp): FollowUpFormValues {
  return {
    dueAt: toDatetimeLocal(followUp.dueAt),
    reason: followUp.reason,
  }
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formValuesToFollowUpInput(
  leadId: string,
  values: FollowUpFormValues,
): FollowUpInput {
  return {
    leadId,
    dueAt: new Date(values.dueAt).toISOString(),
    reason: values.reason.trim(),
  }
}

export function formValuesToUpdateInput(
  values: FollowUpFormValues,
): UpdateFollowUpInput {
  return {
    dueAt: new Date(values.dueAt).toISOString(),
    reason: values.reason.trim(),
  }
}
