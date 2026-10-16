export const MEETING_STATUSES = [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED',
  'NO_SHOW',
] as const

export type MeetingStatus = (typeof MEETING_STATUSES)[number]

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
  NO_SHOW: 'No-show',
}

// Suggested options for the meetingType free-text field — the backend
// stores whatever string is sent (see Meeting model in schema.prisma), so
// this is only a convenience list for the form, not a closed set.
export const MEETING_TYPE_SUGGESTIONS = [
  'Video Call',
  'Phone Call',
  'In Person',
  'Demo',
]

export interface MeetingLead {
  id: string
  name: string
  phone: string
  companyName: string | null
}

export interface Meeting {
  id: string
  leadId: string
  date: string
  time: string
  salespersonId: string
  meetingType: string
  meetingLink: string | null
  notes: string | null
  status: MeetingStatus
  createdAt: string
  updatedAt: string
  lead: MeetingLead
  salesperson: { id: string; name: string }
}

export interface PaginatedMeetings {
  data: Meeting[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface MeetingQuery {
  leadId?: string
  salespersonId?: string
  status?: MeetingStatus
  from?: string
  to?: string
  page?: number
  limit?: number
}

export interface MeetingInput {
  leadId: string
  date: string
  time: string
  salespersonId?: string
  meetingType: string
  meetingLink?: string
  notes?: string
}

export interface UpdateMeetingInput {
  date?: string
  time?: string
  salespersonId?: string
  meetingType?: string
  meetingLink?: string
  notes?: string
  status?: MeetingStatus
}

export interface MeetingFormValues {
  date: string
  time: string
  meetingType: string
  meetingLink: string
  notes: string
  salespersonId: string
}

export const EMPTY_MEETING_FORM_VALUES: MeetingFormValues = {
  date: '',
  time: '',
  meetingType: '',
  meetingLink: '',
  notes: '',
  salespersonId: '',
}

export function meetingToFormValues(meeting: Meeting): MeetingFormValues {
  return {
    date: meeting.date.slice(0, 10),
    time: meeting.time,
    meetingType: meeting.meetingType,
    meetingLink: meeting.meetingLink ?? '',
    notes: meeting.notes ?? '',
    salespersonId: meeting.salespersonId,
  }
}

export function formValuesToMeetingInput(
  leadId: string,
  values: MeetingFormValues,
): MeetingInput {
  return {
    leadId,
    date: values.date,
    time: values.time,
    salespersonId: values.salespersonId || undefined,
    meetingType: values.meetingType.trim(),
    meetingLink: values.meetingLink.trim() || undefined,
    notes: values.notes.trim() || undefined,
  }
}

export function formValuesToUpdateMeetingInput(
  values: MeetingFormValues,
): UpdateMeetingInput {
  return {
    date: values.date,
    time: values.time,
    salespersonId: values.salespersonId || undefined,
    meetingType: values.meetingType.trim(),
    meetingLink: values.meetingLink.trim() || undefined,
    notes: values.notes.trim() || undefined,
  }
}
