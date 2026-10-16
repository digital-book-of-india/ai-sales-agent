export interface PipelineStage {
  id: string
  name: string
  order: number
}

export interface DealLead {
  id: string
  name: string
  phone: string
  companyName: string | null
}

export interface Deal {
  id: string
  leadId: string
  ownerId: string
  value: number
  probability: number
  stageId: string
  expectedCloseDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  lead: DealLead
  owner: { id: string; name: string }
  stage: PipelineStage
}

/** A pipeline stage with its deals nested — one Kanban column. Matches
 * GET /deals/board on the backend. */
export interface BoardStage extends PipelineStage {
  deals: Deal[]
}

export interface DealQuery {
  leadId?: string
  ownerId?: string
  stageId?: string
  page?: number
  limit?: number
}

export interface PaginatedDeals {
  data: Deal[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface DealInput {
  leadId: string
  ownerId?: string
  value: number
  probability?: number
  stageId?: string
  expectedCloseDate?: string
  notes?: string
}

export interface UpdateDealInput {
  ownerId?: string
  value?: number
  probability?: number
  expectedCloseDate?: string
  notes?: string
}

export interface DealFormValues {
  value: string
  probability: string
  expectedCloseDate: string
  notes: string
  ownerId: string
}

export const EMPTY_DEAL_FORM_VALUES: DealFormValues = {
  value: '',
  probability: '0',
  expectedCloseDate: '',
  notes: '',
  ownerId: '',
}

export function dealToFormValues(deal: Deal): DealFormValues {
  return {
    value: String(deal.value),
    probability: String(deal.probability),
    expectedCloseDate: deal.expectedCloseDate?.slice(0, 10) ?? '',
    notes: deal.notes ?? '',
    ownerId: deal.ownerId,
  }
}

export function formValuesToDealInput(
  leadId: string,
  values: DealFormValues,
): DealInput {
  return {
    leadId,
    ownerId: values.ownerId || undefined,
    value: Number(values.value),
    probability: values.probability ? Number(values.probability) : undefined,
    expectedCloseDate: values.expectedCloseDate || undefined,
    notes: values.notes.trim() || undefined,
  }
}

export function formValuesToUpdateDealInput(
  values: DealFormValues,
): UpdateDealInput {
  return {
    ownerId: values.ownerId || undefined,
    value: Number(values.value),
    probability: values.probability ? Number(values.probability) : undefined,
    expectedCloseDate: values.expectedCloseDate || undefined,
    notes: values.notes.trim() || undefined,
  }
}
