export const WORKING_HOURS_DAYS = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const

export type WorkingHoursDay = (typeof WORKING_HOURS_DAYS)[number]

export interface WorkingHours {
  start?: string
  end?: string
  days?: WorkingHoursDay[]
}

export interface AiAgent {
  id: string
  name: string
  description: string | null
  voice: string | null
  language: string | null
  personality: string | null
  openingMessage: string | null
  objective: string | null
  workingHours: WorkingHours
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentQuery {
  search?: string
  active?: boolean
}

export interface AgentInput {
  name: string
  description?: string
  voice?: string
  language?: string
  personality?: string
  openingMessage?: string
  objective?: string
  workingHours?: WorkingHours
  active?: boolean
}

export interface AgentFormValues {
  name: string
  description: string
  voice: string
  language: string
  personality: string
  openingMessage: string
  objective: string
  workingStart: string
  workingEnd: string
  workingDays: WorkingHoursDay[]
  active: boolean
}

export const EMPTY_AGENT_FORM_VALUES: AgentFormValues = {
  name: '',
  description: '',
  voice: '',
  language: 'English',
  personality: '',
  openingMessage: '',
  objective: '',
  workingStart: '09:00',
  workingEnd: '18:00',
  workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  active: true,
}

export function agentToFormValues(agent: AiAgent): AgentFormValues {
  return {
    name: agent.name,
    description: agent.description ?? '',
    voice: agent.voice ?? '',
    language: agent.language ?? '',
    personality: agent.personality ?? '',
    openingMessage: agent.openingMessage ?? '',
    objective: agent.objective ?? '',
    workingStart: agent.workingHours.start ?? '09:00',
    workingEnd: agent.workingHours.end ?? '18:00',
    workingDays: agent.workingHours.days ?? [],
    active: agent.active,
  }
}

export function formValuesToAgentInput(values: AgentFormValues): AgentInput {
  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    voice: values.voice.trim() || undefined,
    language: values.language.trim() || undefined,
    personality: values.personality.trim() || undefined,
    openingMessage: values.openingMessage.trim() || undefined,
    objective: values.objective.trim() || undefined,
    workingHours: {
      start: values.workingStart || undefined,
      end: values.workingEnd || undefined,
      days: values.workingDays.length ? values.workingDays : undefined,
    },
    active: values.active,
  }
}
