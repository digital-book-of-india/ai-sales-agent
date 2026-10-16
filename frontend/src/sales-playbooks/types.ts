export interface SalesPlaybook {
  id: string
  agentId: string
  opening: string | null
  discoveryQuestions: string[]
  qualificationRules: Record<string, unknown>
  objectionHandling: Record<string, unknown>
  closingRules: Record<string, unknown>
  questions: PlaybookQuestion[]
  createdAt: string
  updatedAt: string
}

export interface UpdatePlaybookInput {
  opening?: string
  discoveryQuestions?: string[]
  qualificationRules?: Record<string, unknown>
  objectionHandling?: Record<string, unknown>
  closingRules?: Record<string, unknown>
}

export interface PlaybookQuestion {
  id: string
  playbookId: string
  question: string
  purpose: string | null
  expectedInfo: string | null
  possibleAnswers: string[]
  order: number
  createdAt: string
  updatedAt: string
}

export interface PlaybookQuestionInput {
  question: string
  purpose?: string
  expectedInfo?: string
  possibleAnswers?: string[]
  order?: number
}

// qualificationRules / objectionHandling / closingRules are stored as free-
// form JSON, but the editor only needs a simple named-outcome list — this
// is the shape it reads/writes under a single "rules" key.
export interface RuleList {
  rules?: string[]
  [key: string]: unknown
}

export function toRuleList(value: Record<string, unknown>): string[] {
  const rules = (value as RuleList).rules
  return Array.isArray(rules) ? rules.filter((r): r is string => typeof r === 'string') : []
}

export function fromRuleList(rules: string[]): RuleList {
  return { rules }
}
