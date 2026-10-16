import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { listAgents } from '../ai-agents/api'
import type { AiAgent } from '../ai-agents/types'
import { getKnowledgeBase, saveKnowledgeBase } from '../knowledge-base/api'
import { EMPTY_COMPANY_INFO, type KnowledgeBase, type ProductItem } from '../knowledge-base/types'
import { CompanyInfoForm } from '../knowledge-base/CompanyInfoForm'
import { CatalogEditor } from '../knowledge-base/CatalogEditor'
import { FaqTable } from '../knowledge-base/FaqTable'
import { ObjectionTable } from '../knowledge-base/ObjectionTable'
import { getPlaybook, savePlaybook } from '../sales-playbooks/api'
import type { SalesPlaybook, UpdatePlaybookInput } from '../sales-playbooks/types'
import { PlaybookForm } from '../sales-playbooks/PlaybookForm'
import { PlaybookQuestionsTable } from '../sales-playbooks/PlaybookQuestionsTable'
import { ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { FullScreenLoader } from '../components/FullScreenLoader'

type Tab = 'catalog' | 'faqs' | 'objections' | 'playbook'

const TABS: { id: Tab; label: string }[] = [
  { id: 'catalog', label: 'Company & catalog' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'objections', label: 'Objection handling' },
  { id: 'playbook', label: 'Sales playbook' },
]

export function KnowledgeBasePage() {
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN'
  const [searchParams, setSearchParams] = useSearchParams()
  const agentId = searchParams.get('agentId') ?? ''

  const [agents, setAgents] = useState<AiAgent[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('catalog')

  const [kb, setKb] = useState<KnowledgeBase | null>(null)
  const [companyInfo, setCompanyInfo] = useState(EMPTY_COMPANY_INFO)
  const [products, setProducts] = useState<ProductItem[]>([])
  const [services, setServices] = useState<ProductItem[]>([])
  const [kbLoading, setKbLoading] = useState(false)
  const [kbSaving, setKbSaving] = useState(false)

  const [playbook, setPlaybook] = useState<SalesPlaybook | null>(null)
  const [playbookLoading, setPlaybookLoading] = useState(false)

  useEffect(() => {
    listAgents()
      .then((data) => {
        setAgents(data)
        if (!agentId && data.length > 0) {
          setSearchParams({ agentId: data[0].id }, { replace: true })
        }
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false))
    // Only run once on mount — agent selection changes are driven by the
    // dropdown, not by refetching the agent list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadKnowledgeBase = useCallback(() => {
    if (!agentId) return
    Promise.resolve()
      .then(() => {
        setKbLoading(true)
        return getKnowledgeBase(agentId)
      })
      .then((data) => {
        setKb(data)
        setCompanyInfo({ ...EMPTY_COMPANY_INFO, ...data.companyInfo })
        setProducts(data.products)
        setServices(data.services)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setKb(null)
          setCompanyInfo(EMPTY_COMPANY_INFO)
          setProducts([])
          setServices([])
          return
        }
        toast.error(
          err instanceof ApiError ? err.message : 'Failed to load knowledge base',
        )
      })
      .finally(() => setKbLoading(false))
  }, [agentId])

  const loadPlaybook = useCallback(() => {
    if (!agentId) return
    Promise.resolve()
      .then(() => {
        setPlaybookLoading(true)
        return getPlaybook(agentId)
      })
      .then(setPlaybook)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setPlaybook(null)
          return
        }
        toast.error(err instanceof ApiError ? err.message : 'Failed to load playbook')
      })
      .finally(() => setPlaybookLoading(false))
  }, [agentId])

  useEffect(() => {
    loadKnowledgeBase()
    loadPlaybook()
  }, [loadKnowledgeBase, loadPlaybook])

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === agentId) ?? null,
    [agents, agentId],
  )

  async function handleSaveCatalog() {
    if (!agentId) return
    setKbSaving(true)
    try {
      const saved = await saveKnowledgeBase(agentId, { companyInfo, products, services })
      setKb(saved)
      toast.success('Knowledge base saved')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save knowledge base')
    } finally {
      setKbSaving(false)
    }
  }

  async function handleSavePlaybook(input: UpdatePlaybookInput) {
    if (!agentId) return
    const saved = await savePlaybook(agentId, input)
    setPlaybook(saved)
  }

  if (agentsLoading) return <FullScreenLoader />

  return (
    <>
      <header className="mb-8">
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-brand uppercase">
          Knowledge Base
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Agent knowledge &amp; playbook
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Everything the selected agent knows and says on a call — editable here, never
          hardcoded.
        </p>
      </header>

      <div className="card mb-5">
        <div className="flex max-w-sm flex-col gap-1.5">
          <label htmlFor="kb-agent-select" className="text-xs font-semibold text-muted">
            Agent
          </label>
          <select
            id="kb-agent-select"
            className="input-field"
            value={agentId}
            onChange={(e) => setSearchParams({ agentId: e.target.value })}
          >
            {agents.length === 0 && <option value="">No agents yet</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedAgent && !agentsLoading && (
        <div className="card text-center text-sm text-muted">
          Create an AI agent first, then come back here to configure its knowledge base.
        </div>
      )}

      {selectedAgent && (
        <>
          <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`cursor-pointer rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tab === t.id
                    ? 'border-b-2 border-brand text-brand'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'catalog' && (
            <div className="card flex flex-col gap-6">
              {kbLoading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : (
                <>
                  <CompanyInfoForm value={companyInfo} onChange={setCompanyInfo} />
                  <CatalogEditor label="Products" items={products} onChange={setProducts} />
                  <CatalogEditor label="Services" items={services} onChange={setServices} />
                  {canManage && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={kbSaving}
                        onClick={() => void handleSaveCatalog()}
                      >
                        {kbSaving ? 'Saving…' : 'Save knowledge base'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'faqs' && (
            <div className="card">
              {!kb ? (
                <p className="text-sm text-muted">
                  Save the knowledge base first to start adding FAQs.
                </p>
              ) : (
                <FaqTable knowledgeBaseId={kb.id} faqs={kb.faqs} onChange={(faqs) => setKb({ ...kb, faqs })} />
              )}
            </div>
          )}

          {tab === 'objections' && (
            <div className="card">
              {!kb ? (
                <p className="text-sm text-muted">
                  Save the knowledge base first to start adding objection responses.
                </p>
              ) : (
                <ObjectionTable
                  knowledgeBaseId={kb.id}
                  objections={kb.objections}
                  onChange={(objections) => setKb({ ...kb, objections })}
                />
              )}
            </div>
          )}

          {tab === 'playbook' && (
            <div className="flex flex-col gap-5">
              <div className="card">
                {playbookLoading ? (
                  <p className="text-sm text-muted">Loading…</p>
                ) : (
                  <PlaybookForm
                    playbook={
                      playbook ?? {
                        id: '',
                        agentId,
                        opening: '',
                        discoveryQuestions: [],
                        qualificationRules: {},
                        objectionHandling: {},
                        closingRules: {},
                        questions: [],
                        createdAt: '',
                        updatedAt: '',
                      }
                    }
                    onSave={handleSavePlaybook}
                  />
                )}
              </div>
              <div className="card">
                {!playbook ? (
                  <p className="text-sm text-muted">
                    Save the playbook first to start adding structured discovery questions.
                  </p>
                ) : (
                  <PlaybookQuestionsTable
                    playbookId={playbook.id}
                    questions={playbook.questions}
                    onChange={(questions) => setPlaybook({ ...playbook, questions })}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
