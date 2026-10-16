export interface CompanyInfo {
  name?: string
  about?: string
  services?: string
  locations?: string[]
  contact?: string
}

export interface ProductItem {
  name: string
  description?: string
  price?: number
  category?: string
}

export interface KnowledgeBase {
  id: string
  agentId: string
  companyInfo: CompanyInfo
  products: ProductItem[]
  services: ProductItem[]
  faqs: Faq[]
  objections: Objection[]
  createdAt: string
  updatedAt: string
}

export interface Faq {
  id: string
  knowledgeBaseId: string
  question: string
  answer: string
  category: string | null
  priority: number
  createdAt: string
  updatedAt: string
}

export interface FaqInput {
  question: string
  answer: string
  category?: string
  priority?: number
}

export interface Objection {
  id: string
  knowledgeBaseId: string
  objection: string
  recommendedResponse: string
  followUpQuestion: string | null
  escalationRule: string | null
  createdAt: string
  updatedAt: string
}

export interface ObjectionInput {
  objection: string
  recommendedResponse: string
  followUpQuestion?: string
  escalationRule?: string
}

export interface UpdateKnowledgeBaseInput {
  companyInfo?: CompanyInfo
  products?: ProductItem[]
  services?: ProductItem[]
}

export const EMPTY_COMPANY_INFO: CompanyInfo = {
  name: '',
  about: '',
  services: '',
  locations: [],
  contact: '',
}
